/* eslint-disable no-underscore-dangle */

// const debugCMP = require('debug')('shodan:updater:cmp');
// const debug = require('debug')('shodan:updater');
const moment = require('moment');
const config = require('config');

function fixData(el) {
  const fixed = { ...el};
  const message = el.message.replace(el.msgName, '').trim().trim();
  fixed.message = JSON.parse(message);
  return fixed;
}

function getStackStart(msg) {
  const stackBegin1 = msg.includes('(/') && msg.indexOf('(/');
  const stackBegin2 = msg.includes('at /') && msg.indexOf('at /');
  const stackBegin3 = msg.includes(' at ') && msg.indexOf(' at ');
  if (stackBegin1 && stackBegin2 && stackBegin3) {
    return Math.min(stackBegin1, stackBegin2, stackBegin3);
  }
  if (stackBegin1 || stackBegin2 || stackBegin3) {
    return stackBegin1 || stackBegin2 || stackBegin3;
  }
  return -1;
}

function minimalReplace(messageName) {
  return messageName
    .replace(new RegExp(/\n/g), ' ') // remove carriage returns
    .replace(new RegExp(/\t/g), ' ') // remove tabs
    .replace(/ +/g, ' ');// remove double spaces
}

function fixMessageName(messageName, message, force) {
  if (messageName === 'uncaughtException_0') {
    let start = message.lastIndexOf('uncaughtException');
    let realMessage = minimalReplace(message);
    let to = -1;
    if (start !== -1) {
      start += 'uncaughtException'.length;
      realMessage = realMessage.substr(start);
      to = getStackStart(realMessage);
    }
    if (start !== -1 && to !== -1) {
      return `uncaughtException_0 ${realMessage.substr(0, to).trim()}`.substr(0, 255);
    }
  }
  if (messageName === 'uncaughtException') {
    const data = message.split('------------------------------');
    if (data.length > 1) {
      const realMessage = minimalReplace(data[data.length - 1]);
      const to = getStackStart(realMessage);
      if (to !== -1) {
        return `uncaughtException ${realMessage.substr(0, to).trim()}`.substr(0, 255);
      }
    }
  }
  if (!messageName || force) {
    let autoMessageName = `AUTO ${minimalReplace(message)}`
      .replace(/js:\d+:\d+/g, 'js:xx:xx')// remove stack traces
      .replace(/{.+}/g, '{OBJ}')// remove json objects
      .replace(/releases\/\d+\//g, 'DATE')// remove release dates
      .replace(/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g, 'EMAIL')// remove emails
      .replace(/http:\/\/.+ /g, 'http://addr')// remove http addresses
      .replace(/https:\/\/.+ /g, 'https://addr')// remove https addresses
      .replace(/\d+ ms/g, 'xx ms')// remove timings
      .replace(/\d+ attempts/g, 'x attempts')// remove attempts
      .replace(/\d+ attempt/g, 'x attempt')// remove attempts
      .replace(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/ig, 'GUID')// remove GUIDs
      .replace(/\d+/g, 'x')// remove any numbers
      .trim();
    if (autoMessageName.length > 50) {
      const pos = autoMessageName.indexOf(' ', 50);
      if (pos !== -1 && pos < 60) {
        autoMessageName = `${autoMessageName.substr(0, pos).trim()}...`;
      } else {
        autoMessageName = `${autoMessageName.substr(0, 50).trim()}...`;
      }
    }
    // debugCMP(`message:${message.replace(new RegExp(/\n/g), '')}`);
    // debugCMP(`messageName:${autoMessageName}`);
    return autoMessageName;
  }
  return messageName;
}

function fixLogEntry(logEntry) {
  let message = logEntry._source.message
    || logEntry._source.data && JSON.stringify(logEntry._source.data)
    || 'none';
  const messageLength = message.length;
  let messageName = logEntry._source.msgName;
  if (!messageName && logEntry._source.data) {
    if (logEntry._source.data.event) {
      messageName = logEntry._source.data.event;
    } else {
      const tmp = JSON.stringify(logEntry._source.data);
      messageName = tmp.substr(1, tmp.length - 2);
    }
  }
  messageName = fixMessageName(messageName, message);
  if (message.length > config.updater.maxErrorLength) {
    // debug(`TOO long message (${message.length / 1000} KB)!!! msgName: ${messageName}, start: ${message.substr(0, 100)}`);
    message = `${message.substr(0, 2000)} ... CUT`;
  }
  let index = logEntry._index.split('-');
  if (index.length > 2) { // remove date from index
    const isItDate = index[index.length - 1];
    if (isItDate.split('.').length === 3) {
      index.splice(index.length - 1);
    }
  }
  index = index.join('-');

  return {
    guid: `${logEntry._index}${logEntry._id}`,
    index,
    type: logEntry._type,
    name: logEntry._source.fields.name || logEntry._source.name || 'NONE',
    messageLength,
    eventDate: moment(logEntry._source['@timestamp']).format('YYYY-MM-DD HH:mm:ss.SSS'),
    level: logEntry._source.fields.type,
    pid: logEntry._source.fields.pid,
    message: message.trim(),
    msgName: messageName.trim(),
    msgId: logEntry._source.msgId || 'NONE',
    env: logEntry._source.chef_environment,
    host: logEntry._source.host,
    role: logEntry._source.role,
  };
}

function makeKibanaLink(index, name, msgName, kibanaUrl) {
  name = name.split('"').join();
  msgName = msgName.split('"').join();
  kibanaUrl = kibanaUrl.replace('logs-shodan', 'logs');
  return `${kibanaUrl}/app/kibana#/discover?_g=()&_a=(columns:!(message),filters:!(('$state':(store:appState),`
      + `meta:(alias:!n,disabled:!f,index:'${index}-*',key:fields.name,negate:!f,params:(query:${name},type:phrase),`
      + `type:phrase,value:${name}),query:(match:(fields.name:(query:${name},type:phrase)))),('$state':(store:appState),`
      + `meta:(alias:!n,disabled:!f,index:'${index}-*',key:fields.type,negate:!f,params:(query:E,type:phrase),type:phrase,value:E),`
      + `query:(match:(fields.type:(query:E,type:phrase)))),('$state':(store:appState),meta:(alias:!n,disabled:!f,index:'${index}-*',`
      + `key:msgName,negate:!f,params:(query:${msgName},type:phrase),type:phrase,value:${msgName}),`
      + `query:(match:(msgName:(query:${msgName},type:phrase))))),index:'${index}-*',interval:auto,query:(language:lucene,query:''),`
      + 'sort:!(\'@timestamp\',desc))';
}

function singleLineString(strings, ...values) {
  // Interweave the strings with the
  // substitution vars first.
  let output = '';
  for (let i = 0; i < values.length; i++) {
    output += strings[i] + values[i];
  }
  output += strings[values.length];

  // Split on newlines.
  const lines = output.split(/(?:\r\n|\n|\r)/);

  // Rip out the leading whitespace.
  return lines.map((line) => {
    return line.replace(/^\s+/gm, '');
  }).join(' ').trim();
}

module.exports = {
  fixLogEntry,
  fixMessageName,
  fixData,
  makeKibanaLink,
  singleLineString,
};
