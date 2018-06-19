/* eslint-disable no-underscore-dangle */
const Promise = require('bluebird');
const rp = require('request-promise');
const debug = require('debug')('shodan:updater');
const config = require('config');
const moment = require('moment');
const knex = require('knex')(config.db);
const {fixLogEntry} = require('../utils');

require('../modules/knex-timings')(knex, false);

let lastRemovedLogs = null;

/**
 * @deprecated
 * @param queryFrom
 * @param queryTo
 * @returns {*}
 */
function getIndex(queryFrom, queryTo) {
  // request current index
  const kibanaUrl = config.updater.kibana.url;
  const headers = {
    Origin: kibanaUrl,
    'Accept-Encoding': 'none',
    'Accept-Language': 'en-US,en;q=0.8,ru;q=0.6',
    'kbn-version': config.updater.kibana.version,
    'User-Agent': config.updater.userAgent,
    'Content-Type': 'application/json;charset=UTF-8',
    Accept: 'application/json, text/plain, */*',
    Referer: `${kibanaUrl}/app/kibana`,
    Connection: 'keep-alive',
    'Save-Data': 'on',
    Cookie: config.updater.kibana.cookie,
  };

  const dataString = {
    fields: ['@timestamp'],
    index_constraints: {
      '@timestamp': {
        max_value: {gte: queryFrom/* 1494395361553 */, format: 'epoch_millis'},
        min_value: {lte: queryTo/* 1494398961553 */, format: 'epoch_millis'},
      },
    },
  };

  const options = {
    url: `${kibanaUrl}/elasticsearch/${config.updater.kibana.index}-*/_field_stats?level=indices`,
    method: 'POST',
    headers,
    json: true,
    body: dataString,
  };
  return rp(options)
    .catch((err) => {
      debug(`failed to send request ${JSON.stringify(options)}`);
      throw err;
    });
}


function getData(queryFrom, queryTo, index) {
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
    Cookie: config.updater.kibana.cookie,
  };

  const dataString1 = {index: [index], ignore_unavailable: true, preference: config.updater.kibana.preference};
  const excludeIndexes = config.updater.kibana.indexFilterOut.map(indexExclude =>
    ({
      match_phrase: {
        _index: {
          query: indexExclude,
        },
      },
    }));
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
  return rp(options)
    .then((result) => {
      debug('request data ok');
      return result;
    })
    .catch((err) => {
      debug(`failed to send request ${JSON.stringify(options)}`);
      throw err;
    });
}

function fetchData(queryFrom, queryTo) {
  /*
  return getIndex(queryFrom, queryTo)
    .then((data) => {
      let indexes = Object.keys(data.indices);
      if (config.updater.kibana.indexFilterOut) {
        indexes = Object.keys(data.indices).filter(index => !index.includes(config.updater.kibana.indexFilterOut));
      }
      if (!indexes || !indexes.length) {
        throw new Error('Failed to fetch indexes!');
      }
      debug('indexes:', indexes);
      return indexes;
    })
    // .then(indexes=> getData(userQuery, queryFrom, queryTo, indexes[0]))
    .then((indices) => {
      const promises = indices.map(index => getData(queryFrom, queryTo, index));
      return Promise.all(promises);
    })
    */
  return Promise.all([getData(queryFrom, queryTo, config.updater.kibana.index)])
    .then((dataArray) => {
      return dataArray.map((element) => {
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
        return data;
      })
        .reduce((res, el) => {
          return res.concat(el);
        }, [])
        .filter(item => item)
        .map(fixLogEntry);
    })
    .then((data) => {
      return {count: data.length, data};
    });
}

function getLogUpdateInterval() {
  return knex('logs')
    .select('eventDate')
    .orderBy('eventDate', 'desc').limit(1)
    .then(([res]) => res && res.eventDate)
    .then((lastDate) => {
      let queryFrom;
      if (!lastDate) {
        queryFrom = moment().subtract(config.updater.kibana.firstSearchFor, 'h');
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
      return knex('logs').count()
        .whereRaw(`eventDate between DATE_SUB("${dateString}", INTERVAL ${config.updater.kibana.searchFor} HOUR) and  "${dateString}"`)
        .then((reply) => {
          const logsForLastHour = Object.values(reply[0])[0];
          debug(`Logs in base for hour: ${logsForLastHour}`);
          if (logsForLastHour > config.updater.kibana.maxLogsPerHour * config.updater.kibana.searchFor) {
            debug('Too many logs for this hour, I will skip some...');
            queryFrom = moment.min(now.clone().subtract(5, 'm'), queryFrom.clone().add(1, 'h'));
            queryTo = moment.min(queryFrom.clone().add(config.updater.kibana.searchFor, 'h'), now);
          }
          return {queryFrom, queryTo};
        });
    });
}

function doUpdateLogs() {
  return getLogUpdateInterval()
    .then(({queryFrom, queryTo}) => {
      debug(`Fetching data from ${queryFrom.format('YYYY-MM-DD HH:mm:ss')} to ${queryTo.format('YYYY-MM-DD HH:mm:ss')}`);
      return fetchData(parseInt(queryFrom.format('x'), 10), parseInt(queryTo.format('x'), 10));
    })
    .then((data) => {
      /* if (data.count === config.kibana.fetchNum) {
        full = true;
      } */
      if (data.count === 0) {
        debug('No new items to add');
        return true;
      }
      debug(`Adding ${data.count} items`);
      /* let duplicates = 0;
      const entries = data.data.map(entry => knex('logs').insert(entry).catch((err) => {
        if (!err.message.includes('Duplicate entry')) {
          debug(`Failed add: ${err}`);
        }
        else {
          duplicates++;
        }
        return false;
      }));
      return Promise.all(entries) */
      return knex.raw(knex('logs').insert(data.data).toString().replace('insert', 'INSERT IGNORE'))
        .then((res) => {
          const failed = res.filter(item => !item).length;
          if (failed !== 0) {
            // debug(`Failed to add ${failed} items (${duplicates} duplicates)`);
            debug(`Failed to add ${failed} items`);
          }
        });
    });
}

function updateLogs() {

  const today = parseInt(moment().format('DD'), 10);
  if (lastRemovedLogs === null || lastRemovedLogs !== today) {
    debug('Removing old logs');
    lastRemovedLogs = today;
    knex('logs')
      .whereRaw(`eventDate < DATE_SUB(NOW(), INTERVAL ${config.updater.kibana.storeLogsFor} DAY)`)
      .del()
      .then((count) => {
        debug(`Removed ${count} old logs`);
      });
  }

  return doUpdateLogs()
    .catch((err) => {
      debug(err);
    })
    .finally(() => setTimeout(() => updateLogs(), config.updater.kibana.updateInterval * 1000));
}

updateLogs();
