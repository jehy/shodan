// const debug = require('debug')('shodan:server');
const config = require('config');
const bunyan = require('bunyan');

const log = bunyan.createLogger({name: 'shodan:showTopErrors'});

const veryBadMessages = ['unhandledRejection', 'uncaughtException'].map((m) => m.toLowerCase());

function getLastIntervalTopErrors(knex, event, interval) {

  let query = knex('logs')
    .join('errors', 'logs.error_id', 'errors.id')
    .select('errors.msgName', 'errors.name', 'errors.id')
    .where('errors.index', event.data.index.replace('-*', ''))
    .whereRaw(`logs.eventDate >= DATE_SUB(NOW(),INTERVAL 1 ${interval})`);
  if (event.data.env) {
    query = query
      .where('logs.env', event.data.env);
  }
  if (event.data.role) {
    query = query
      .where('logs.role', event.data.role);
  }
  if (event.data.pid) {
    query = query
      .where('logs.pid', event.data.pid);
  }
  query = query
    .groupBy('errors.id')
    .count('errors.id as count')
    .max('messageLength as messageLength')
    .orderByRaw('count(errors.msgName) desc, errors.name, errors.msgName')
    .limit(config.ui.display.errorsNumber);
  return query;
}

function getPrevIntervalErrorStats(knex, event, interval) {
  let hourPreQuery = knex('logs')
    .join('errors', 'logs.error_id', 'errors.id')
    .select('errors.msgName', 'errors.name', 'errors.id')
    .count('errors.id as count')
    .groupBy('errors.id')
    .where('errors.index', event.data.index.replace('-*', ''))
    .whereRaw(`logs.eventDate BETWEEN DATE_SUB(NOW(),INTERVAL 2 ${interval}) AND DATE_SUB(NOW(),INTERVAL 1 ${interval})`);
  if (event.data.env) {
    hourPreQuery = hourPreQuery
      .where('logs.env', event.data.env);
  }
  if (event.data.role) {
    hourPreQuery = hourPreQuery
      .where('logs.role', event.data.role);
  }
  if (event.data.pid) {
    hourPreQuery = hourPreQuery
      .where('logs.pid', event.data.pid);
  }
  return hourPreQuery;
}

function getFirstLastDateMet(knex, event, errorIds) {
  let firstLastMetDataQuery = knex('first_last_met')
    .join('errors', 'first_last_met.error_id', 'errors.id')
    .select('errors.id')
    .where('errors.index', event.data.index.replace('-*', ''))
    .whereIn('errors.id', errorIds);
  if (event.data.env) {
    firstLastMetDataQuery = firstLastMetDataQuery
      .where('first_last_met.env', event.data.env)
      .select('first_last_met.firstMet', 'first_last_met.lastMet');
  } else {
    firstLastMetDataQuery = firstLastMetDataQuery
      .groupBy('errors.id')
      .min('first_last_met.firstMet as firstMet')
      .max('first_last_met.lastMet as lastMet');
  }
  /*
  if (event.data.role) {
    firstLastMetDataQuery = firstLastMetDataQuery
      .where('role', event.data.role);
  }
  if (event.data.pid) {
    firstLastMetDataQuery = firstLastMetDataQuery
      .where('pid', event.data.pid);
  } */
  return firstLastMetDataQuery;
}

function getLogComments(knex, event, errorIds) {
  return knex('comments')
    .join('errors', 'comments.error_id', 'errors.id')
    .where('errors.index', event.data.index.replace('-*', ''))
    .select('errors.msgName', 'errors.name', 'comments.comment')
    .whereIn('error_id', errorIds);
}

function getOtherEnvErrorNum(knex, event, errorIds, interval) {
  let otherEnvQuery = knex('logs')
    .join('errors', 'logs.error_id', 'errors.id')
    .select('errors.msgName', 'errors.name')
    .where('errors.index', event.data.index.replace('-*', ''))
    .whereRaw(`logs.eventDate >= DATE_SUB(NOW(),INTERVAL 1 ${interval})`)
    .whereIn('error_id', errorIds)
    // .whereIn('msgName', knex.raw(`SELECT DISTINCT msgName from logs where eventDate >= DATE_SUB(NOW(),INTERVAL 1 ${interval})`))
    .groupBy('errors.id')
    .count('errors.id as count');
  if (event.data.env) {
    otherEnvQuery = otherEnvQuery
      .whereNot('logs.env', event.data.env);
  }
  if (event.data.pid) {
    otherEnvQuery = otherEnvQuery
      .whereNot('logs.pid', event.data.pid);
  }
  if (event.data.role) {
    otherEnvQuery = otherEnvQuery
      .whereNot('logs.role', event.data.role);
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
  if (err.messageLength >= config.updater.maxErrorLength) {
    errors.push('Too long');
  }

  if (veryBadMessages.some((bad) => err.msgName.toLowerCase().includes(bad))) {
    errors.push('Unhadled');
  }
  return errors;
}

function getMetData(err, firstLastMetData) {

  let metData = firstLastMetData
    .find((item) => item.id === err.id);
  if (!metData) {
    log.warn(`Not found met data for id "${err.id}" msgName "${err.msgName}" and name "${err.name}" `);
    //              in object ${JSON.stringify(firstLastMetData, null, 3)}`);
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

  return getLastIntervalTopErrors(knex, event, interval)
    .then((topErrors) => {
      const errorIds = topErrors.map((err) => err.id);
      const errorsPerThisHourQuery = getErrorTotal(knex);
      const firstLastMetQuery = getFirstLastDateMet(knex, event, errorIds);
      const logCommentQuery = getLogComments(knex, event, errorIds);
      const preHourQuery = getPrevIntervalErrorStats(knex, event, interval);
      const otherEnvQuery = false;
      if (event.data.env) {
        // otherEnvQuery = getOtherEnvErrorNum(knex, event, errorIds, interval);
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
            const preHour = preHourData.find((item) => item.msgName === err.msgName && item.name === err.name);
            const comment = logComments.find((item) => item.msgName === err.msgName && item.name === err.name);
            const metData = getMetData(err, firstLastMetData);
            if (otherEnvErrors) {
              const otherEnv = otherEnvErrors.find((item) => item.msgName === err.msgName && item.name === err.name);
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
      socket.emit('event', {name: 'updateTopErrors', data: topErrors, fetchErrors, id: event.id});
    });
}


module.exports = showTopErrors;
