'use strict';

const rp = require('request-promise');
// const debug = require('debug')('shodan:updater');
const bunyan = require('bunyan');
const config = require('config');
const moment = require('moment');
const Promise = require('bluebird');
const knex = require('knex')(config.db);
require('../modules/knex-timings')(knex, false);
const {fixLogEntry} = require('../modules/utils');

const log = bunyan.createLogger({name: 'shodan:speed-monitor'});

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

  const dataString1 = {index: ['twapi-avia-*'], ignore_unavailable: true, preference: config.updater.kibana.preference};
  const includeIndexes = config.updater.kibana.indexes.map(includeIndex => ({match_phrase: {_index: includeIndex}}));
  const dataString2 = {
    version: true,
    size: config.updater.kibana.fetchNum,
    sort: [{'@timestamp': {order: 'asc', unmapped_type: 'boolean'}}],
    query: {
      bool: {
        must: [
          {match_all: {}},
          {match_phrase: {'fields.type': {query: 'W'}}},
          {
            bool: {
              should: [
                {match_phrase: {msgName: 'SEARCH_TIMING_PIPELINE'}},
                {match_phrase: {msgName: 'SEARCH_TIMING_TOTAL'}}],
              minimum_should_match: 1},
          },
          {
            range: {
              '@timestamp': {
                gte: queryFrom,
                lte: queryTo,
                format: 'epoch_millis',
              },
            },
          }],
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
    log.debug('request data ok');
    return result;
  }
  catch (err) {
    log.warn(`failed to send request ${JSON.stringify(options)}`);
    throw err;
  }
}

async function fetchData(queryFrom, queryTo) {
  const response = await getData(queryFrom, queryTo);
  let data;
  try {
    data = JSON.parse(response);
  } catch (e) {
    log.warn('malformed json!', e, response);
    return null;
  }
  try {
    data = data.responses[0].hits.hits;
  } catch (e) { // data has no... data
    log.warn('No hits.hits:', data);
    return null;
  }
  data = data
    .reduce((res, el) => {
      return res.concat(el);
    }, [])
    .filter(item => item)
    .map(fixLogEntry)
    .map((el)=>{
      delete el.index;
      delete el.messageLength;
      return el;
    });
  return {count: data.length, data};
}

async function getLogUpdateInterval() {
  const res = await knex('speed_logs')
    .select('eventDate')
    .orderBy('eventDate', 'desc').limit(1).first();
  const lastDate = res && res.eventDate;
  let queryFrom;
  if (!lastDate) {
    queryFrom = moment().subtract(config.updater.kibana.firstSearchFor, 'h');
    log.info('First time update, fetching data from ', queryFrom.format('YYYY-MM-DD HH:mm:ss'));
  }
  else {
    queryFrom = moment(lastDate);
  }
  const now = moment();
  if (config.updater.kibana.crawlDelay) {
    now.subtract(config.updater.kibana.crawlDelay, 'm');
  }
  const queryTo = moment.min(queryFrom.clone().add(config.updater.kibana.searchFor, 'h'), now);

  const dateString = queryFrom.format('YYYY-MM-DD HH:mm:ss');
  const reply = await knex('speed_logs').count()
    .whereRaw(`eventDate between DATE_SUB("${dateString}", INTERVAL ${config.updater.kibana.searchFor} HOUR) and  "${dateString}"`);
  const logsForLastHour = Object.values(reply[0])[0];
  log.info(`Logs in base for hour: ${logsForLastHour}`);
  const maxPerHour = 300;
  if (logsForLastHour > maxPerHour * config.updater.kibana.searchFor) {
    const addFiveMin = queryFrom.clone().add(5, 'm');
    if (addFiveMin < now)
    {
      log.warn('Too many logs for this hour, I will skip 5 minutes...');
      queryFrom = addFiveMin;
    }
  }
  return {queryFrom, queryTo};
}

async function doAddSpeedLogs()
{
  const {queryFrom, queryTo} = await Promise.resolve(getLogUpdateInterval()).timeout(10 * 1000);
  log.info(`Fetching data from ${queryFrom.format('YYYY-MM-DD HH:mm:ss')} to ${queryTo.format('YYYY-MM-DD HH:mm:ss')}`);
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
  const query = knex('speed_logs').insert(data.data).toString();
  const insertRes = await Promise.resolve(knex.raw(query.replace('insert', 'INSERT IGNORE'))).timeout(20 * 1000);
  const failed = insertRes.filter(item => !item).length;
  if (failed > 1) { // 1 is usually a duplicate
    log.info(`Failed to add ${failed} items`);
  }
  log.info('Added');
  return true;
}

async function cleanUp()
{

  const today = parseInt(moment().format('DD'), 10);
  if (lastRemovedLogs && lastRemovedLogs === today) {
    return;
  }
  log.info('Removing old logs');
  lastRemovedLogs = today;
  const count = await knex('speed_logs')
    .whereRaw(`eventDate < DATE_SUB(NOW(), INTERVAL ${config.updater.kibana.storeLogsFor} DAY)`)
    .del();
  log.info(`Removed ${count} old speed logs`);
}

async function addSpeedLogs() {
  try {
    await cleanUp();
    await doAddSpeedLogs();
  }
  catch (err)
  {
    log.error(err);
  }
  setTimeout(() => addSpeedLogs(), config.updater.kibana.updateInterval * 1000);
}

addSpeedLogs();
