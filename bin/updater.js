const Promise = require('bluebird');
const rp = require('request-promise');
const debug = require('debug')('shodan:updater');
const debugCMP = require('debug')('shodan:updater:cmp');
const config = require('config');
const moment = require('moment');
const knex = require('knex')(config.db);

function fixLogEntry(logEntry) {
  const message = logEntry._source['message'] || 'none';
  let messageName = logEntry._source['msgName'];
  if (!messageName) {
    messageName = `AUTO ${message.replace(new RegExp(/\n/g), '')}`;
    messageName = messageName.replace(/js:\d+:\d+/g, 'js:xx:xx');//remove stack traces
    messageName = messageName.replace(/{.+}/g, '{OBJ}');//remove json objects
    messageName = messageName.replace(/releases\/\d+\//g, 'DATE');//remove release dates
    messageName = messageName.replace(/http:\/\/.+ /g, 'http://addr');//remove http addresses
    messageName = messageName.replace(/https:\/\/.+ /g, 'https://addr');//remove https addresses
    messageName = messageName.replace(/\d+ ms/g, 'xx ms');//remove timings
    messageName = messageName.replace(/\d+ attempts/g, 'x attempts');//remove attempts
    messageName = messageName.replace(/\d+ attempt/g, 'x attempt');//remove attempts
    messageName = messageName.replace(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/ig, 'GUID');//remove GUIDs
    messageName = messageName.replace(/\d+/g, 'x');//remove any numbers
    messageName = messageName.replace(/ +/g, ' ');//remove double spaces
    if (messageName.length > 50) {
      const pos = messageName.indexOf(' ', 50);
      if (pos && pos < 60) {
        messageName = `${messageName.substr(0, pos)}...`;
      }
      else {
        messageName = `${messageName.substr(0, 50)}...`;
      }
    }
    debugCMP('message:' + message.replace(new RegExp(/\n/g), ''));
    debugCMP('messageName:' + messageName);

  }
  return {
    guid: `${logEntry._index}${logEntry._id}`,
    type: logEntry._type,
    name: logEntry._source.fields.name,
    eventDate: moment(logEntry._source['@timestamp']).format('YYYY-MM-DD HH:mm:ss.SSS'),
    level: logEntry._source.fields.type,
    message: message.trim(),
    msgName: messageName.trim(),
    msgId: logEntry._source['msgId'],
    env: logEntry._source['chef_environment'],
    host: logEntry._source['host'],
    role: logEntry._source['role'],
  };
}

function getIndex(queryFrom, queryTo) {
  // request current index
  const kibanaUrl = config.kibana.url;
  const headers = {
    Origin: kibanaUrl,
    'Accept-Encoding': 'none',
    'Accept-Language': 'en-US,en;q=0.8,ru;q=0.6',
    'kbn-version': config.kibana.version,
    'User-Agent': config.userAgent,
    'Content-Type': 'application/json;charset=UTF-8',
    Accept: 'application/json, text/plain, */*',
    Referer: `${kibanaUrl}/app/kibana`,
    Connection: 'keep-alive',
    'Save-Data': 'on',
    Cookie: config.kibana.cookie,
  };

  const dataString = {
    fields: ['@timestamp'],
    index_constraints: {
      '@timestamp': {
        max_value: {gte: queryFrom/* 1494395361553*/, format: 'epoch_millis'},
        min_value: {lte: queryTo/* 1494398961553*/, format: 'epoch_millis'},
      },
    },
  };

  const options = {
    url: `${kibanaUrl}/elasticsearch/${config.kibana.search}-*/_field_stats?level=indices`,
    method: 'POST',
    headers,
    json: true,
    body: dataString,
  };
  return rp(options);
}


function getData(queryFrom, queryTo, index) {
  const kibanaUrl = config.kibana.url;
  const headers = {
    Origin: kibanaUrl,
    'Accept-Encoding': 'none',
    'Accept-Language': 'en-US,en;q=0.8,ru;q=0.6',
    'kbn-version': config.kibana.version,
    'User-Agent': config.userAgent,
    'Content-Type': 'application/x-ndjson',
    Accept: 'application/json, text/plain, */*',
    Referer: `${kibanaUrl}/app/kibana?`,
    Connection: 'close',
    'Save-Data': 'on',
    Cookie: config.kibana.cookie,
  };

  const dataString1 = {"index": [index], "ignore_unavailable": true, "preference": config.kibana.preference};
  const dataString2 = {
    "version": true,
    "size": config.kibana.fetchNum,
    "sort": [{"@timestamp": {"order": "asc", "unmapped_type": "boolean"}}],
    "query": {
      "bool": {
        "must": [{"match_all": {}}, {"match_phrase": {"fields.type": {"query": "E"}}}, {
          "range": {
            "@timestamp": {
              gte: queryFrom,
              lte: queryTo,
              "format": "epoch_millis"
            }
          }
        }], "must_not": []
      }
    },
    "_source": {"excludes": []},
    "aggs": {
      "2": {
        "date_histogram": {
          "field": "@timestamp",
          "interval": "1m",
          "time_zone": "Europe/Minsk",
          "min_doc_count": 1
        }
      }
    },
    "stored_fields": ["*"],
    "script_fields": {},
    "docvalue_fields": ["@timestamp", "data.timestamp", "data.trip.endDateTime", "data.trip.startDateTime", "data.trips.endDateTime", "data.trips.startDateTime"],
    "highlight": {
      "pre_tags": ["@kibana-highlighted-field@"],
      "post_tags": ["@/kibana-highlighted-field@"],
      "fields": {
        "*": {
          "highlight_query": {
            "bool": {
              "must": [{"match_all": {}}, {"match_phrase": {"fields.type": {"query": "E"}}}, {
                "range": {
                  "@timestamp": {
                    "gte": queryFrom,
                    "lte": queryTo,
                    "format": "epoch_millis"
                  }
                }
              }], "must_not": []
            }
          }
        }
      },
      "fragment_size": 2147483647
    }
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
      const formated = JSON.stringify(JSON.parse(result), null, 3);
      debug('request data ok');
      return result;
    })
    .catch((err) => {
      debug('request data fail: ' + err);
    });
}

function fetchData(queryFrom, queryTo) {
  return getIndex(queryFrom, queryTo)
    .then((data) => {
      const indexes = Object.keys(data.indices).filter((index) => !index.includes('search'));
      if (!indexes || !indexes.length) {
        throw new Error('Failed to fetch indices!');
      }
      debug('indices:', indexes);
      return indexes;
    })
    // .then(indexes=> getData(userQuery, queryFrom, queryTo, indexes[0]))
    .then((indexes) => {
      const promises = indexes.map((index) => getData(queryFrom, queryTo, index));
      return Promise.all(promises);
    })
    .then((dataArray) => {
      return dataArray.map((element) => {
        let data;
        try {
          data = JSON.parse(element);
        } catch (e) {
          debug('malformed json!', e, element);
          return;
        }
        try {
          data = data.responses[0].hits.hits;
          return data;
        } catch (e) { // data has no... data
          debug('No hits.hits:', data);
          return;
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

function updateLogs() {
  knex('logs').select('eventDate').orderBy('eventDate', 'desc').limit(1).then(([res]) => res && res.eventDate)
    .then((lastDate) => {
      let queryFrom;
      let queryTo;
      if (!lastDate) {
        queryFrom = moment().subtract(config.kibana.searchFor, 'h');// for last searchFor hours
        queryTo = moment();
      }
      else {
        queryFrom = moment(lastDate);
        queryTo = queryFrom.clone().add(config.kibana.searchFor, 'h');
      }
      debug(`Fetching data from ${queryFrom.format('YYYY-MM-DD HH:mm:ss')} to ${queryTo.format('YYYY-MM-DD HH:mm:ss')}`);
      return fetchData(parseInt(queryFrom.format('x'), 10) , parseInt(queryTo.format('x'), 10) );
    })
    .then((data) => {
      // debug(data.data[0]);
      debug(`Adding ${data.count} items`);
      let duplicates = 0;
      const entries = data.data.map((entry) => knex('logs').insert(entry).catch((err) => {
        if (!err.message.includes('Duplicate entry')) {
          debug(`Failed add: ${err}`);
        }
        else {
          duplicates++;
        }
        return false;
      }));
      return Promise.all(entries).then((res) => [res, duplicates]);
    })
    .then(([res, duplicates]) => {
      const failed = res.filter(item => !item).length;
      if (failed !== 0) {
        debug(`Failed to add ${failed} items (${duplicates} duplicates)`);
      }
    })
    .catch((err) => {
      debug(err);
    })
    .finally(() => setTimeout(() => updateLogs(), config.kibana.updateInterval * 1000));
  //.finally(() => Promise.delay(1000).then(() => process.exit(0)));
}

updateLogs();
