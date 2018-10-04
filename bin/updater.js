/* eslint-disable no-underscore-dangle */
const rp = require('request-promise');
const debug = require('debug')('shodan:updater');
const config = require('config');
const moment = require('moment');
const Promise = require('bluebird');
const knex = require('knex')(config.db);
const {fixLogEntry} = require('../modules/utils');

require('../modules/knex-timings')(knex, false);

let lastRemovedLogs = null;

async function getData(queryFrom, queryTo) {
  const kibanaUrl = config.updater.kibana.url;
  const headers = {
    Origin: kibanaUrl,
    'Accept-Encoding': 'none',
    'Accept-Language': 'en-US,en;q=0.8,ru;q=0.6',
    'kbn-version': config.updater.kibana.version,
    'User-Agent': config.updater.userAgent,
    'Content-Type': 'application/x-ndjson',
    Accept: 'application/json, text/plain, */*',
    Referer: `${kibanaUrl}/app/kibana?`,
    Connection: 'close',
    'Save-Data': 'on',
  };
  if (config.updater.kibana.auth.cookie) {
    headers.Cookie = config.updater.kibana.auth.cookie;
  }
  if (config.updater.kibana.auth.basic) {
    headers.Authorization = `Basic ${config.updater.kibana.auth.basic}`;
  }

  const dataString1 = {index: ['*-*'], ignore_unavailable: true, preference: config.updater.kibana.preference};
  const excludeIndexes = config.updater.kibana.indexFilterOut.map(indexExclude => ({
    match_phrase: {
      _index: {
        query: indexExclude,
      },
    },
  }));
  const includeIndexes = config.updater.kibana.indexes.map(includeIndex => ({match_phrase: {_index: includeIndex}}));
  const dataString2 = {
    version: true,
    size: config.updater.kibana.fetchNum,
    sort: [{'@timestamp': {order: 'asc', unmapped_type: 'boolean'}}],
    query: {
      bool: {
        must: [{match_all: {}}, {match_phrase: {'fields.type': {query: 'E'}}}, {
          range: {
            '@timestamp': {
              gte: queryFrom,
              lte: queryTo,
              format: 'epoch_millis',
            },
          },
        }],
        // must_not: [{match_phrase: {msgName: {query: 'privatefares_1'}}},
        // {match_phrase: {msgName: {query: 'privatefares_0'}}}],
        must_not: excludeIndexes,
        minimum_should_match: 1,
        should: includeIndexes,
      },
    },
    _source: {excludes: []},
    aggs: {
      2: {
        date_histogram: {
          field: '@timestamp',
          interval: '1m',
          time_zone: 'Europe/Minsk',
          min_doc_count: 1,
        },
      },
    },
    stored_fields: ['*'],
    script_fields: {},
  };

  const dataString = `${JSON.stringify(dataString1)}\n${JSON.stringify(dataString2)}\n`;
  const options = {
    url: `${kibanaUrl}/elasticsearch/_msearch`,
    method: 'POST',
    encoding: null,
    headers,
    body: dataString,
  };
  // debug(options);
  try
  {
    const result = await rp(options);
    debug('request data ok');
    return result;
  }
  catch (err) {
    debug(`failed to send request ${JSON.stringify(options)}`);
    throw err;
  }
}

async function fetchData(queryFrom, queryTo) {
  const element = await getData(queryFrom, queryTo);
  let data;
  try {
    data = JSON.parse(element);
  } catch (e) {
    debug('malformed json!', e, element);
    return null;
  }
  try {
    data = data.responses[0].hits.hits;
  } catch (e) { // data has no... data
    debug('No hits.hits:', data);
    return null;
  }
  data = data
    .reduce((res, el) => {
      return res.concat(el);
    }, [])
    .filter(item => item)
    .map(fixLogEntry);
  return {count: data.length, data};
}

async function getLogUpdateInterval() {
  const res = await knex('logs')
    .select('eventDate')
    .orderBy('eventDate', 'desc').limit(1).first();
  const lastDate = res && res.eventDate;
  let queryFrom;
  if (!lastDate) {
    queryFrom = moment().subtract(config.updater.kibana.firstSearchFor, 'h');
    debug('First time update, fetching data from ', queryFrom.format('YYYY-MM-DD HH:mm:ss'));
  }
  else {
    queryFrom = moment(lastDate);
  }
  const now = moment();
  if (config.updater.kibana.crawlDelay) {
    now.subtract(config.updater.kibana.crawlDelay, 'm');
  }
  let queryTo = moment.min(queryFrom.clone().add(config.updater.kibana.searchFor, 'h'), now);

  const dateString = queryFrom.format('YYYY-MM-DD HH:mm:ss');
  const reply = await knex('logs').count()
    .whereRaw(`eventDate between DATE_SUB("${dateString}", INTERVAL ${config.updater.kibana.searchFor} HOUR) and  "${dateString}"`);
  const logsForLastHour = Object.values(reply[0])[0];
  debug(`Logs in base for hour: ${logsForLastHour}`);
  if (logsForLastHour > config.updater.kibana.maxLogsPerHour * config.updater.kibana.searchFor) {
    debug('Too many logs for this hour, I will skip some...');
    queryFrom = moment.min(now.clone().subtract(5, 'm'), queryFrom.clone().add(1, 'h'));
    queryTo = moment.min(queryFrom.clone().add(config.updater.kibana.searchFor, 'h'), now);
  }
  return {queryFrom, queryTo};
}

const errorIdCache = {};

function setItemErrorId(item, id) {

  if (parseInt(id, 10) !== id) {
    debug(`WRONG ID ${JSON.stringify(id)}`);
    process.exit(1);
  }
  item.error_id = id;
  delete item.name;
  delete item.msgName;
  delete item.index;
}

/**
 *
 * @param item
 * @returns {Promise<boolean>} true if it is a new error, false otherwise
 */
async function addItem(item) {
  const errorHash = `${item.name}.${item.msgName}.${item.index}`;
  if (errorIdCache[errorHash]) {
    setItemErrorId(item, errorIdCache[errorHash]);
    return false;
  }
  const res = await knex('errors').select('id')
    .where('name', item.name)
    .where('msgName', item.msgName)
    .where('index', item.index)
    .first();

  if (res && parseInt(res.id, 10) !== res.id) {
    debug(`WRONG ID 2${JSON.stringify(res.id)}`);
    process.exit(1);
  }
  if (res && res.id) {
    setItemErrorId(item, res.id);
    errorIdCache[errorHash] = res.id;
    return false;
  }
  const insertResult = await knex.insert({
    name: item.name,
    msgName: item.msgName,
    index: item.index,
  })
    .returning('id')
    .into('errors');
  const [autoIncrementId] = insertResult;
  // debug(`Auto increment id: ${JSON.stringify(autoIncrementId)}`);
  setItemErrorId(item, autoIncrementId);
  errorIdCache[errorHash] = autoIncrementId;
  return true;
}

async function updateMetData(options)
{
  const [errorId, metData] = options;
  const affectedRows = await knex('first_last_met')
    .where('error_id', errorId)
    .where('env', metData.item.env)
    .update({lastMet: metData.item.eventDate});
  if (affectedRows === 1) {
    return true;
  }
  if (affectedRows > 1) {
    debug(`WTF, ${affectedRows} were affected`);
  }
  return knex.insert({
    firstMet: metData.item.eventDate,
    lastMet: metData.item.eventDate,
    error_id: metData.item.error_id,
    env: metData.item.env,
  })
    .into('first_last_met');
}

async function doUpdateLogs() {
  const {queryFrom, queryTo} = await getLogUpdateInterval();
  debug(`\nFetching data from ${queryFrom.format('YYYY-MM-DD HH:mm:ss')} to ${queryTo.format('YYYY-MM-DD HH:mm:ss')}`);
  const data = await fetchData(parseInt(queryFrom.format('x'), 10), parseInt(queryTo.format('x'), 10));
  /* if (data.count === config.kibana.fetchNum) {
        full = true;
      } */
  if (data.count === 0) {
    debug('No new items to add');
    return true;
  }
  debug(`Adding ${data.count} items`);
  let newErrors = 0;
  await Promise.map(data.data, async (item)=>{
    try
    {
      const isNew = await addItem(item);
      if (isNew)
      {
        newErrors++;
      }
    } catch (err)
    {
      debug(`ERROR: ${err.message} ${err.stack}\n ot item ${JSON.stringify(item, null, 3)}`);
    }
  }, {concurrency: 1}); // no more concurrency because there will be duplicates of error messages
  debug(`Got all error IDs, new errors: ${newErrors}`);
  const query = knex('logs').insert(data.data).toString();
  const insertRes = await knex.raw(query.replace('insert', 'INSERT IGNORE'));
  const failed = insertRes.filter(item => !item).length;
  if (failed > 1) { // 1 is usually a duplicate
    debug(`Failed to add ${failed} items`);
  }
  debug('Items added, updating met data');
  const dataForUpdate = data.data.reduce((res, item) => {
    const itemDate = moment(item.eventDate, 'YYYY-MM-DD HH:mm:ss.SSS');
    if (!res[item.error_id] || itemDate.isAfter(res[item.error_id].met)) {
      res[item.error_id] = {met: itemDate, item};
    }
    return res;
  }, {});
  await Promise.map(Object.entries(dataForUpdate), updateMetData, {concurrency: 10});
  debug('updated met data');
  return true;
}

async function updateLogs() {

  const today = parseInt(moment().format('DD'), 10);
  if (lastRemovedLogs === null || lastRemovedLogs !== today) {
    debug('Removing old logs');
    lastRemovedLogs = today;
    const count = await knex('logs')
      .whereRaw(`eventDate < DATE_SUB(NOW(), INTERVAL ${config.updater.kibana.storeLogsFor} DAY)`)
      .del();
    debug(`Removed ${count} old logs`);

    debug('Removing old errors');
    // select errors.id, logs.error_id as logsNum from errors left join logs on logs.error_id=errors.id where isnull(logs.error_id)
    const oldErrors = await knex.select('errors.id', 'logs.error_id').from('errors')
      .leftJoin('logs', 'errors.id', 'logs.error_id')
      .whereNull('logs.error_id');
    debug(`Removing old errors (${oldErrors.length})`);
    const countErrors = await knex('errors').whereIn('id', oldErrors.map(el=>el.id)).del();
    debug(`Removed old errors (${countErrors})`);


    const oldMetData = await knex.select('first_last_met.error_id', 'errors.id').from('first_last_met')
      .leftJoin('errors', 'first_last_met.error_id', 'errors.id')
      .whereNull('errors.id');
    debug(`Removing old met data (${oldMetData.length})`);
    const countOldMetData = await knex('first_last_met').whereIn('error_id', oldMetData.map(el=>el.error_id)).del();
    debug(`Removed old met data (${countOldMetData})`);


    const oldCommentData = await knex.select('comments.error_id', 'errors.id').from('comments')
      .leftJoin('errors', 'comments.error_id', 'errors.id')
      .whereNull('errors.id');
    debug(`Removing old comments data (${oldCommentData.length})`);
    const countOldCommentData = await knex('comments').whereIn('error_id', oldCommentData.map(el=>el.error_id)).del();
    debug(`Removed old comments data (${countOldCommentData})`);

  }

  return Promise.resolve(doUpdateLogs())
    .catch((err) => {
      debug(err);
    })
    .finally(() => setTimeout(() => updateLogs(), config.updater.kibana.updateInterval * 1000));
}

updateLogs();
