/* eslint-disable no-underscore-dangle */
const now = require('performance-now');
// const debug = require('debug')('shodan:knex-data');
const bunyan = require('bunyan');

const log = bunyan.createLogger({name: 'shodan:knex-timings'});

// The map used to store the query times, where the query unique
// identifier is the key.
const times = {};
// Used for keeping track of the order queries are executed.
let count = 0;

function printQueryWithTime(uid, showBindings) {
  const {startTime, endTime, query} = times[uid];
  const elapsedTime = endTime - startTime;
  let bindings = '';
  if (showBindings) {
    bindings = `, [${query.bindings ? query.bindings.join(',') : ''}]`;
  }

  // I print the sql generated for a given query, as well as
  // the bindings for the queries.
  const logTimings = [query.sql, bindings, `\ntime: ${Math.round(elapsedTime)}`];
  if (elapsedTime > 15000)
  {
    log.error(...logTimings);
  }
  else if (elapsedTime > 5000)
  {
    log.warn(...logTimings);
  }
  else
  {
    log.info(...logTimings);
  }
  // After I print out the query, I have no more use to it,
  // so I delete it from my map so it doesn't grow out of control.
  delete times[uid];
}

function setLogging(knex, showBindings = true) {
  // if (!debug.enabled) {
  //  return;
  // }
  knex.on('query', (query) => {
    const uid = query.__knexQueryUid;
    times[uid] = {
      position: count,
      query,
      startTime: now(),
      // I keep track of when a query is finished with a boolean instead of
      // presence of an end time. It makes the logic easier to read.
      finished: false,
    };
    count++;
  })
    .on('query-response', (response, query) => {
      const uid = query.__knexQueryUid;
      times[uid].endTime = now();
      // Mark this query as finished.
      times[uid].finished = true;
      printQueryWithTime(uid, showBindings);
    });

}

module.exports = setLogging;
