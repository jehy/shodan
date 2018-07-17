const debug = require('debug')('shodan:server');
const config = require('config');

const veryBadMessages = ['unhandledRejection', 'uncaughtException'].map(m => m.toLowerCase());

function getLastIntervalTopErrors(knex, event, interval) {

  let query = knex('logs')
    .select('msgName', 'name', 'index')
    .select(knex.raw('MAX(LOCATE("... CUT", message, 1999)) as tooLong'))
    .where('index', 'like', event.data.index.replace('*', '%'))
    .whereRaw(`eventDate >= DATE_SUB(NOW(),INTERVAL 1 ${interval})`);
  if (event.data.env) {
    query = query
      .where('env', event.data.env);
  }
  if (event.data.role) {
    query = query
      .where('role', event.data.role);
  }
  if (event.data.pid) {
    query = query
      .where('pid', event.data.pid);
  }
  query = query
    .groupBy('msgName', 'name', 'index')
    .count('msgName as count')
    .orderByRaw('count(msgName) desc, name, msgName')
    .limit(config.ui.display.errorsNumber);
  return query;
}

function getPrevIntervalErrorStats(knex, event, interval) {
  let hourPreQuery = knex('logs')
    .select('msgName', 'name')
    .count('msgName as count')
    .groupBy('msgName', 'name')
    .where('index', 'like', event.data.index.replace('*', '%'))
    .whereRaw(`eventDate BETWEEN DATE_SUB(NOW(),INTERVAL 2 ${interval}) AND DATE_SUB(NOW(),INTERVAL 1 ${interval})`);
  if (event.data.env) {
    hourPreQuery = hourPreQuery
      .where('env', event.data.env);
  }
  if (event.data.role) {
    hourPreQuery = hourPreQuery
      .where('role', event.data.role);
  }
  if (event.data.pid) {
    hourPreQuery = hourPreQuery
      .where('pid', event.data.pid);
  }
  return hourPreQuery;
}

function getFirstLastDateMet(knex, event, msgNames) {
  let firstLastMetDataQuery = knex('first_last_met')
    .select()
    .where('index', 'like', event.data.index.replace('*', '%'))
    .whereIn('msgName', msgNames);
  if (event.data.env) {
    firstLastMetDataQuery = firstLastMetDataQuery
      .where('env', event.data.env);
  }
  if (event.data.role) {
    firstLastMetDataQuery = firstLastMetDataQuery
      .where('role', event.data.role);
  }
  if (event.data.pid) {
    firstLastMetDataQuery = firstLastMetDataQuery
      .where('pid', event.data.pid);
  }
  return firstLastMetDataQuery;
}

function getLogComments(knex, event, msgNames) {
  return knex('comments')
    .where('index', 'like', event.data.index.replace('*', '%'))
    .select('msgName', 'name', 'comment')
    .whereIn('msgName', msgNames);
}

function getOtherEnvErrorNum(knex, event, msgNames, interval) {
  let otherEnvQuery = knex('logs')
    .select('msgName', 'name')
    .where('index', 'like', event.data.index.replace('*', '%'))
    .whereRaw(`eventDate >= DATE_SUB(NOW(),INTERVAL 1 ${interval})`)
    .whereIn('msgName', msgNames)
    // .whereIn('msgName', knex.raw(`SELECT DISTINCT msgName from logs where eventDate >= DATE_SUB(NOW(),INTERVAL 1 ${interval})`))
    .groupBy('msgName', 'name')
    .count('msgName as count');
  if (event.data.env) {
    otherEnvQuery = otherEnvQuery
      .whereNot('env', event.data.env);
  }
  if (event.data.pid) {
    otherEnvQuery = otherEnvQuery
      .whereNot('pid', event.data.pid);
  }
  if (event.data.role) {
    otherEnvQuery = otherEnvQuery
      .whereNot('role', event.data.role);
  }
  return otherEnvQuery;
}

function getErrorTotal(knex) {
  return knex('logs')
    .count().whereRaw('eventDate>DATE_SUB(NOW(), INTERVAL 1 HOUR)')
    .then((reply) => {
      return Object.values(reply[0])[0];
    });
}

function checkErrorEntry(err) {
  const errors = [];
  if (parseInt(err.tooLong, 10) !== 0) {
    errors.push('Too long');
  }

  if (veryBadMessages.some(bad => err.msgName.toLowerCase().includes(bad))) {
    errors.push('Unhadled');
  }
  return errors;
}

function getMetData(err, firstLastMetData) {

  let metData = firstLastMetData
    .find(item => item.msgName === err.msgName && item.name === err.name);
  if (!metData) {
    debug(`ERR: not found met data for msgName "${err.msgName}" and name "${err.name}" 
                  in object ${JSON.stringify(firstLastMetData, null, 3)}`);
    metData = {firstMet: 0, lastMet: 0};
  }
  return metData;
}

function showTopErrors(knex, socket, event) {

  const fetchErrors = [];

  let interval = 'DAY';
  if (event.data.period === 'hour') {
    interval = 'HOUR';
  }

  getLastIntervalTopErrors(knex, event, interval)
    .then((topErrors) => {
      const msgNames = topErrors.map(err => err.msgName);
      const errorsPerThisHourQuery = getErrorTotal(knex);
      const firstLastMetQuery = getFirstLastDateMet(knex, event, msgNames);
      const logCommentQuery = getLogComments(knex, event, msgNames);
      const preHourQuery = getPrevIntervalErrorStats(knex, event, interval);
      let otherEnvQuery = false;
      if (event.data.env) {
        otherEnvQuery = getOtherEnvErrorNum(knex, event, msgNames, interval);
      }
      return Promise.all([preHourQuery, firstLastMetQuery, errorsPerThisHourQuery, otherEnvQuery, logCommentQuery])
        .then(([preHourData, firstLastMetData, errorsPerHour, otherEnvErrors, logComments]) => {
          if (errorsPerHour * 0.7 > config.updater.kibana.maxLogsPerHour) {
            fetchErrors.push(`Warning: many logs per this hour (${errorsPerHour}), some may be skipped`);
          }
          if (topErrors.length === 0) {
            fetchErrors.push('Warning: No logs found, please check updater');
          }
          return topErrors.map((err) => {
            const preHour = preHourData.find(item => item.msgName === err.msgName && item.name === err.name);
            const comment = logComments.find(item => item.msgName === err.msgName && item.name === err.name);
            const metData = getMetData(err, firstLastMetData);
            if (otherEnvErrors) {
              const otherEnv = otherEnvErrors.find(item => item.msgName === err.msgName && item.name === err.name);
              if (otherEnv) {
                Object.assign(err, {otherEnv: otherEnv.count});
              }
            }
            return Object.assign(err, {
              firstMet: metData.firstMet,
              lastMet: metData.lastMet,
              preHour: preHour && preHour.count || 0,
              comment: comment && comment.comment || '',
              errors: checkErrorEntry(err),
            });
          });
        });
    })
    .then((topErrors) => {
      socket.emit('event', {name: 'updateTopErrors', data: topErrors, fetchErrors});
    });
}


module.exports = showTopErrors;
