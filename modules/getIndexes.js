const axios = require('axios');
const config = require('config');

async function getIndexes() {
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

  const options = {
    url: `${kibanaUrl}/api/saved_objects/?type=index-pattern&fields=title&per_page=10000`,
    method: 'GET',
    encoding: null,
    headers,
  };
  const result = await axios(options);
  // longest entries should be first
  return result.data.saved_objects.sort((a, b)=>b.attributes.title.length - a.attributes.title.length);
}

module.exports = {getIndexes};
