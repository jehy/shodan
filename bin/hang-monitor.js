'use strict';

const rp = require('request-promise');
// const debug = require('debug')('shodan:updater');
const bunyan = require('bunyan');
const config = require('config');
const moment = require('moment');
const Promise = require('bluebird');
const crypto = require('crypto');
const knex = require('knex')(config.db);
const {fixLogEntry, getMessageName} = require('../modules/utils');
require('../modules/knex-timings')(knex, false);

const log = bunyan.createLogger({name: 'shodan:hang-monitor'});

let lastRemovedLogs = null;

let hangedErrorId = 0;

function md5(data)
{
  return crypto.createHash('md5').update(data).digest('hex');
}

function generateRequest(time, env, host, role, pid, after = false)
{
  const request = {
    version: true,
    size: 20,
    query: {
      bool: {
        must: [
          {match_all: {}},
          {match_phrase: {chef_environment: {query: env}}},
          {match_phrase: {'beat.hostname': {query: host}}},
          {match_phrase: {'fields.pid': {query: pid}}},
          {match_phrase: {role: {query: role}}}],
        filter: [],
        should: [],
        must_not: [],
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

  if (after)
  {
    request.sort = [{'@timestamp': {order: 'asc', unmapped_type: 'boolean'}}];
    request.query.bool.must.push({
      range: {
        '@timestamp': {
          lte: parseInt(moment(time).add('10', 'minutes').format('x'), 10),
          gte: parseInt(moment(time).format('x'), 10),
          format: 'epoch_millis',
        },
      },
    });
    return request;
  }
  request.sort = [{'@timestamp': {order: 'desc', unmapped_type: 'boolean'}}];
  request.query.bool.must.push({
    range: {
      '@timestamp': {
        gte: parseInt(moment(time).subtract('10', 'minutes').format('x'), 10),
        lte: parseInt(moment(time).format('x'), 10),
        format: 'epoch_millis',
      },
    },
  });
  return request;
}

async function getNearHangedLogs(index, date, env, host, role, pid) // todo use args
{
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

  const dataString1 = {index: [`${index}-*`], ignore_unavailable: true, preference: config.updater.kibana.preference};
  log.info(`Fetching data around ${moment(date).format('YYYY-MM-DD HH:mm:ss')}`);
  const dataString2After = generateRequest(date, env, host, role, pid, true);
  const dataString2Before = generateRequest(date, env, host, role, pid, false);

  const dataStringFinal1 = `${JSON.stringify(dataString1)}\n${JSON.stringify(dataString2After)}\n`;
  const dataStringFinal2 = `${JSON.stringify(dataString1)}\n${JSON.stringify(dataString2Before)}\n`;
  const options1 = {
    url: `${kibanaUrl}/elasticsearch/_msearch`,
    method: 'POST',
    encoding: null,
    headers,
    body: dataStringFinal1,
  };
  const options2 = Object.assign({}, options1, {body: dataStringFinal2});
  const options = [options1, options2];
  try
  {
    const results = await Promise.map(options, option=>rp(option), {concurrency: 1});
    log.debug('request data ok');
    return results;
  }
  catch (err) {
    log.warn(`failed to send requests ${JSON.stringify(options)}`);
    throw err;
  }
}


async function doAddHangedLogs()
{
  if (hangedErrorId === 0)
  {
    hangedErrorId = await knex('errors')
      .select('id')
      .where('msgName', 'HANGED')
      .limit(1)
      .first();
    if (!hangedErrorId || !hangedErrorId.id)
    {
      log.error('HANGED msgname can not be found in logs! Can`t update hang data!');
      return;
    }
    hangedErrorId = hangedErrorId.id;
  }
  let lastHangedErrorId = await knex('hanged_logs')
    .select('logId')
    .orderBy('logId', 'desc')
    .limit(1)
    .first();
  lastHangedErrorId = lastHangedErrorId && lastHangedErrorId.logId || 0;

  const newLogErrorData = await knex('logs')
    .join('errors', 'errors.id', 'logs.error_id')
    .select('logs.id', 'logs.eventDate', 'logs.env', 'logs.host', 'logs.role', 'logs.pid', 'errors.index')
    .where('logs.id', '>', lastHangedErrorId)
    .where('logs.error_id', hangedErrorId)
    .orderBy('logs.id')
    .first();
  if (!newLogErrorData)
  {
    log.info('No new hangs, horray!');
    return;
  }
  const responses = await getNearHangedLogs(newLogErrorData.index, newLogErrorData.eventDate, newLogErrorData.env, newLogErrorData.host,
    newLogErrorData.role, newLogErrorData.pid);
  let data;
  try {
    data = responses.map(d=>JSON.parse(d));
  } catch (e) {
    log.warn('malformed json!', e, responses);
    return;
  }
  try {
    data = data.map(d=>d.responses[0].hits.hits);
  } catch (e) { // data has no... data
    log.warn('No hits.hits:', data);
    return;
  }
  data = data
    .reduce((res, el) => {
      return res.concat(el);
    }, [])
    .filter(item => item)
    .map((entry)=>{
      // eslint-disable-next-line no-underscore-dangle
      if (!entry._source.message && entry._source.data)
      {
        // eslint-disable-next-line no-underscore-dangle
        entry._source.message = JSON.stringify(entry._source.data);
        // eslint-disable-next-line no-underscore-dangle
        entry._source.message = entry._source.message.substr(1, entry._source.message.length - 2);
      }
      const standard = fixLogEntry(entry);
      delete standard.host;
      delete standard.role;
      delete standard.env;
      delete standard.pid;
      delete standard.index;
      delete standard.messageLength;
      const messageGeneric = getMessageName('', standard.message, true);
      return Object.assign(standard, {
        messageGeneric: messageGeneric || entry.name,
        messageGenericHash: md5(`${entry.name}${messageGeneric}`),
        logId: newLogErrorData.id,
      });
    });
  log.info(`Adding ${data.length} items`);
  const query = knex('hanged_logs').insert(data).toString();
  const insertRes = await knex.raw(query.replace('insert', 'INSERT IGNORE'));
  const failed = insertRes.filter(item => !item).length;
  if (failed > 1) { // 1 is usually a duplicate
    log.info(`Failed to add ${failed} items`);
  }
  const distinct  = await knex('hanged_logs')
    .select('messageGenericHash as hash')
    .count('messageGenericHash as count')
    .groupBy('messageGenericHash')
    .having(knex.raw('count(messageGenericHash) > 1'));
  await Promise.map(distinct, (hashData)=>{
    return knex('hanged_logs')
      .update({score: hashData.count})
      .where('messageGenericHash', hashData.hash);
  });
  log.info('Hanged logs updated');
}


async function cleanUp()
{

  const today = parseInt(moment().format('DD'), 10);
  if (lastRemovedLogs && lastRemovedLogs === today) {
    return;
  }
  log.info('Removing old logs');
  lastRemovedLogs = today;
  const count = await knex('hanged_logs')
    .whereRaw(`eventDate < DATE_SUB(NOW(), INTERVAL ${config.updater.kibana.storeLogsFor} DAY)`)
    .del();
  log.info(`Removed ${count} old hang logs`);
}

async function addHangedLogs() {
  try {
    await cleanUp();
    await doAddHangedLogs();
  }
  catch (err)
  {
    log.error(err);
  }
  setTimeout(() => addHangedLogs(), config.updater.kibana.updateInterval * 1000);
}

addHangedLogs();
