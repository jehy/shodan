/* eslint-disable no-underscore-dangle */

const debugCMP = require('debug')('shodan:updater:cmp');
const debug = require('debug')('shodan:updater');
const moment = require('moment');
const config = require('config');

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

function getMessageName(messageName, message, force) {
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
      }
      else {
        autoMessageName = `${autoMessageName.substr(0, 50).trim()}...`;
      }
    }
    debugCMP(`message:${message.replace(new RegExp(/\n/g), '')}`);
    debugCMP(`messageName:${autoMessageName}`);
    return autoMessageName;
  }
  return messageName;
}

function fixLogEntry(logEntry) {
  let message = logEntry._source.message || 'none';
  let messageName = logEntry._source.msgName;
  messageName = getMessageName(messageName, message);
  if (message.length > config.updater.maxErrorLength) {
    debug(`TOO long message (${message.length / 1000} KB)!!! msgName: ${messageName}, start: ${message.substr(0, 100)}`);
    message = `${message.substr(0, 2000)}... CUT (${message.length / 1000} KB)`;
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
    name: logEntry._source.fields.name,
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

module.exports = {
  fixLogEntry,
  getMessageName,
};
