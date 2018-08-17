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

function getData(queryFrom, queryTo) {
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
  return getData(queryFrom, queryTo)
    .then((element) => {
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
    .map(fixLogEntry)
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
      return Promise.map(data.data, (item) => {
        const errorHash = `${item.name}.${item.msgName}.${item.index}`;
        if (errorIdCache[errorHash]) {
          setItemErrorId(item, errorIdCache[errorHash]);
          return true;
        }
        return knex('errors').select('id')
          .where('name', item.name)
          .where('msgName', item.msgName)
          .where('index', item.index)
          .first()
          .then((res) => {

            if (res && parseInt(res.id, 10) !== res.id) {
              debug(`WRONG ID 2${JSON.stringify(res.id)}`);
              process.exit(1);
            }
            if (res && res.id) {
              setItemErrorId(item, res.id);
              errorIdCache[errorHash] = res.id;
              return true;
            }
            return knex.insert({
              name: item.name,
              msgName: item.msgName,
              index: item.index,
            })
              .returning('id')
              .into('errors')
              .then(([autoIncrementId]) => {
                debug(`Auto increment id: ${JSON.stringify(autoIncrementId)}`);
                setItemErrorId(item, autoIncrementId);
                errorIdCache[errorHash] = autoIncrementId;
              });
          });
      }, {concurrency: 4})
        .then(() => data);
    })
    .then((data) => {
      debug('Got all error IDs');
      const query = knex('logs').insert(data.data).toString();
      return knex.raw(query.replace('insert', 'INSERT IGNORE'))
        .then((res) => {
          const failed = res.filter(item => !item).length;
          if (failed !== 0) {
            // debug(`Failed to add ${failed} items (${duplicates} duplicates)`);
            debug(`Failed to add ${failed} items`);
          }
        })
        .then(() => {
          debug('Items added, updating met data');
          const updateMetData = data.data.reduce((res, item) => {
            const itemDate = moment(item.eventDate, 'YYYY-MM-DD HH:mm:ss.SSS');
            if (!res[item.error_id] || itemDate.isAfter(res[item.error_id].met)) {
              res[item.error_id] = {met: itemDate, item};
            }
            return res;
          }, {});
          return Promise.map(Object.entries(updateMetData), ([errorId, metData]) => {
            return knex('first_last_met')
              .where('error_id', errorId)
              .where('env', metData.item.env)
              .update({lastMet: metData.item.eventDate})
              .then((affectedRows) => {
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
              });
          }, {concurrency: 10})
            .then(() => debug('updated met data'));
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
