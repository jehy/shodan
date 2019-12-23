/* eslint-disable no-underscore-dangle */
const axios = require('axios');
// const debug = require('debug')('shodan:updater');
const bunyan = require('bunyan');
const config = require('config');
const moment = require('moment');
const Promise = require('bluebird');
const knex = require('knex')(config.db);
const {fixLogEntry} = require('../lib/fixLogs');
require('../modules/knex-timings')(knex, false);

const log = bunyan.createLogger({name: 'shodan:updater'});

let lastRemovedLogs = null;

const commonDateFormat = 'YYYY-MM-DD HH:mm:ss';

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
  const excludeIndexes = config.updater.kibana.indexFilterOut.map((indexExclude) => ({
    match_phrase: {
      _index: {
        query: indexExclude,
      },
    },
  }));
  const includeIndexes = config.updater.kibana.indexes.map((includeIndex) => ({match_phrase: {_index: includeIndex}}));
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
    data: dataString,
  };
  // debug(options);
  try {
    const result = await axios(options);
    log.debug('request data ok');
    return result.data;
  } catch (err) {
    log.warn(`failed to send request ${JSON.stringify(options)}`);
    throw err;
  }
}

async function fetchData(queryFrom, queryTo) {
  const response = await getData(queryFrom, queryTo);
  let data;
  try {
    data = response.responses[0].hits.hits;
  } catch (e) { // data has no... data
    log.warn('No hits.hits:', data);
    return null;
  }
  data = data
    .reduce((res, el) => {
      return res.concat(el);
    }, [])
    .filter((item) => item)
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
    log.info('First time update, fetching data from ', queryFrom.format(commonDateFormat));
  } else {
    queryFrom = moment(lastDate);
  }
  const now = moment();
  if (config.updater.kibana.crawlDelay) {
    now.subtract(config.updater.kibana.crawlDelay, 'm');
  }
  const queryTo = moment.min(queryFrom.clone().add(config.updater.kibana.searchFor, 'h'), now);

  const dateString = queryFrom.format(commonDateFormat);
  const reply = await knex('logs').count()
    .whereRaw(`eventDate between DATE_SUB("${dateString}", INTERVAL ${config.updater.kibana.searchFor} HOUR) and  "${dateString}"`);
  const logsForLastHour = Object.values(reply[0])[0];
  log.info(`Logs in base for hour: ${logsForLastHour}`);
  if (logsForLastHour > config.updater.kibana.maxLogsPerHour * config.updater.kibana.searchFor) {
    const addFiveMin = queryFrom.clone().add(5, 'm');
    if (addFiveMin < now) {
      log.warn('Too many logs for this hour, I will skip 5 minutes...');
      queryFrom = addFiveMin;
    }
  }
  return {queryFrom, queryTo};
}

const errorIdCache = {};

function setItemErrorId(item, id) {

  if (parseInt(id, 10) !== id) {
    log.error(`WRONG ID ${JSON.stringify(id)}`);
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
    log.error(`WRONG ID 2${JSON.stringify(res.id)}`);
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
    // .returning('id')
    .into('errors');
  const [autoIncrementId] = insertResult;
  // debug(`Auto increment id: ${JSON.stringify(autoIncrementId)}`);
  setItemErrorId(item, autoIncrementId);
  errorIdCache[errorHash] = autoIncrementId;
  return true;
}

async function updateMetData(item) {
  const affectedRows = await knex('first_last_met')
    .where('error_id', item.error_id)
    .where('env', item.env)
    .update({lastMet: item.eventDate});
  if (affectedRows === 1) {
    return true;
  }
  if (affectedRows > 1) {
    log.error(`WTF, ${affectedRows} were affected`);
  }
  return knex.insert({
    firstMet: item.eventDate,
    lastMet: item.eventDate,
    error_id: item.error_id,
    env: item.env,
  })
    .into('first_last_met');
}

async function doUpdateLogs() {
  const {queryFrom, queryTo} = await Promise.resolve(getLogUpdateInterval()).timeout(10 * 1000);
  log.info(`Fetching data from ${queryFrom.format(commonDateFormat)} to ${queryTo.format(commonDateFormat)}`);
  const queryFromInt = parseInt(queryFrom.format('x'), 10);
  const queryToInt = parseInt(queryTo.format('x'), 10);
  const data = await Promise.resolve(fetchData(queryFromInt, queryToInt)).timeout(40 * 1000);
  /* if (data.count === config.kibana.fetchNum) {
        full = true;
      } */
  if (data.count === 0) {
    log.info('No new items to add');
    return true;
  }
  log.info(`Adding ${data.count} items`);
  let newErrors = 0;
  await Promise.map(data.data, async (item)=>{
    try {
      const isNew = await Promise.resolve(addItem(item));
      if (isNew) {
        newErrors++;
      }
    } catch (err) {
      log.error(`ERROR: ${err.message} ${err.stack}\n ot item ${JSON.stringify(item, null, 3)}`);
    }
  }, {concurrency: 1}).timeout(20 * 1000); // no more concurrency because there will be duplicates of error messages
  log.info(`Got all error IDs, new errors: ${newErrors}`);
  const query = knex('logs').insert(data.data).toString();
  const insertRes = await Promise.resolve(knex.raw(query.replace('insert', 'INSERT IGNORE'))).timeout(20 * 1000);
  const failed = insertRes.filter((item) => !item).length;
  if (failed > 1) { // 1 is usually a duplicate
    log.info(`Failed to add ${failed} items`);
  }
  log.info('Items added, updating met data');
  const dataForUpdate = data.data.reduce((res, item) => {
    item.eventDateObject = moment(item.eventDate, 'YYYY-MM-DD HH:mm:ss.SSS');
    const hash = `${item.env}.${item.error_id}`; // last met data in unique for each env
    if (!res[hash] || item.eventDateObject.isAfter(res[hash].eventDateObject)) {
      res[hash] = item;
    }
    return res;
  }, {});
  await Promise.map(Object.values(dataForUpdate), updateMetData, {concurrency: 1}).timeout(20 * 1000);
  log.info('updated met data');
  return true;
}


async function cleanUp() {

  const today = parseInt(moment().format('DD'), 10);
  if (lastRemovedLogs && lastRemovedLogs === today) {
    return;
  }
  log.info('Removing old logs');
  lastRemovedLogs = today;
  let count = 0;
  let removeCounter = 0;
  while (count > 1000 || removeCounter === 0) {
    removeCounter++;
    // eslint-disable-next-line no-await-in-loop
    count = await knex('logs')
      .whereRaw(`eventDate < DATE_SUB(NOW(), INTERVAL ${config.updater.kibana.storeLogsFor} DAY)`)
      .limit(5000)
      .del();
    log.info(`Removed ${count} old logs, iteration ${removeCounter}`);
  }

  // eslint-disable-next-line sonarjs/no-duplicate-string
  const oldErrors = await knex.select('errors.id', 'logs.error_id').from('errors')
    .leftJoin('logs', 'errors.id', 'logs.error_id')
    .whereNull('logs.error_id');
  log.info(`Removing old errors (${oldErrors.length})`);
  const countErrors = await knex('errors').whereIn('id', oldErrors.map((el)=>el.id)).del();
  log.info(`Removed old errors (${countErrors})`);


  const oldMetData = await knex.select('first_last_met.error_id', 'errors.id').from('first_last_met')
    .leftJoin('errors', 'first_last_met.error_id', 'errors.id')
    .whereNull('errors.id');
  log.info(`Removing old met data, for not actual errors (${oldMetData.length})`);
  const countOldMetData = await knex('first_last_met').whereIn('error_id', oldMetData.map((el)=>el.error_id)).del();
  log.info(`Removed old met data (${countOldMetData})`);


  const count2 = await knex('first_last_met')
    .whereRaw('lastMet < DATE_SUB(NOW(), INTERVAL 2 MONTH)')
    .del();
  log.info(`Removed ${count2} met data, by age`);

  const oldCommentData = await knex.select('comments.error_id', 'errors.id').from('comments')
    .leftJoin('errors', 'comments.error_id', 'errors.id')
    .whereNull('errors.id');
  log.info(`Removing old comments data (${oldCommentData.length})`);
  const countOldCommentData = await knex('comments').whereIn('error_id', oldCommentData.map((el)=>el.error_id)).del();
  log.info(`Removed old comments data (${countOldCommentData})`);
  Object.keys(errorIdCache).forEach((key)=>delete errorIdCache[key]);
}

async function updateLogs() {
  try {
    await cleanUp();
    await Promise.resolve(doUpdateLogs()).timeout(60 * 1000);
  } catch (err) {
    log.error(err);
  }
  setTimeout(() => updateLogs(), config.updater.kibana.updateInterval * 1000);
}

updateLogs();
