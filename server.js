const express = require('express');
const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const debug = require('debug')('shodan:server');
const config = require('config');
const knex = require('knex')(config.db);

require('./modules/knex-timings')(knex, false);

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/dist/index.html`);
});

app.use(express.static('dist'));

setInterval(() => {
  debug(`Current users connected: ${Object.keys(io.sockets.connected).length}`);
}, 5000);

io.on('connection', (socket) => {
  debug('a user connected');

  socket.on('event', (event) => {
    debug(`event ${event.name} fired`);
    debug(JSON.stringify(event));
    if (event.name === 'showTopErrors') {
      let interval = 'DAY';
      if (event.data.period === 'hour') {
        interval = 'HOUR';
      }
      let query = knex('logs')
        .select('msgName', 'name')
        .whereRaw(`eventDate >= DATE_SUB(NOW(),INTERVAL 1 ${interval})`);
      if (event.data.env) {
        query = query
          .where('env', event.data.env);
      }
      query = query
        .groupBy('msgName', 'name')
        .count('msgName as count')
        .orderByRaw('count(msgName) desc, name, msgName')
        .limit(50);
      query
        .then((topErrors) => {
          const msgNames = topErrors.map(err => err.msgName);

          let hourPreQuery = knex('logs')
            .select('msgName', 'name')
            .count('msgName as count')
            .groupBy('msgName', 'name')
            .whereRaw(`eventDate BETWEEN DATE_SUB(NOW(),INTERVAL 2 ${interval}) AND DATE_SUB(NOW(),INTERVAL 1 ${interval})`);
          if (event.data.env) {
            hourPreQuery = hourPreQuery
              .where('env', event.data.env);
          }
          let firstLastMetDataQuery = knex('logs')
            .select('msgName', 'name')
            .min('eventDate as firstMet')
            .max('eventDate as lastMet')
            .whereIn('msgName', msgNames)
            // .whereIn('msgName', knex.raw(`SELECT DISTINCT msgName from logs where eventDate >= DATE_SUB(NOW(),INTERVAL 1 ${interval})`))
            .groupBy('msgName', 'name');
          if (event.data.env) {
            firstLastMetDataQuery = firstLastMetDataQuery
              .where('env', event.data.env);
          }
          return Promise.all([hourPreQuery, firstLastMetDataQuery])
            .then(([preHourData, firstLastMetData]) => {
              return topErrors.map((err) => {
                const metData = firstLastMetData.find(item => item.msgName === err.msgName && item.name === err.name);
                const preHour = preHourData.find(item => item.msgName === err.msgName && item.name === err.name);
                return Object.assign(err, {
                  firstMet: metData.firstMet,
                  lastMet: metData.lastMet,
                  preHour: preHour && preHour.count || 0,
                });
              });
            });
        })
        .then((topErrors) => {
          socket.emit('event', {name: 'updateTopErrors', data: topErrors});
        });
    }
    else if (event.name === 'showLogsByMsgName') {
      const {msgName, name, env} = event.data;
      let queryData = knex('logs')
        .where('msgName', msgName)
        .where('name', name);

      if (env) {
        queryData = queryData
          .where('env', env);
      }
      queryData = queryData.select('eventDate', 'name', 'type', 'msgId', 'env', 'host', 'role', 'message')
        .orderBy('id', 'desc')
        .limit(50);

      let queryGraph = knex('logs')
        .count('eventDate as count')
        .select(knex.raw('CONCAT(DATE_FORMAT(eventDate, "%Y %m %d %H")," ", FLOOR(DATE_FORMAT(eventDate, "%i")/10)*10)  as eventDate'))
        .where('msgName', msgName)
        .whereRaw('eventDate > DATE_SUB(NOW(), INTERVAL 1 DAY)')
        .where('name', name);

      if (env) {
        queryGraph = queryGraph
          .where('env', env);
      }
      queryGraph = queryGraph.groupByRaw('CONCAT(DATE_FORMAT(eventDate, "%Y %m %d %H")," ",FLOOR(DATE_FORMAT(eventDate, "%i")/10)*10)');
      Promise.all([queryGraph, queryData])
        .then(([graphData, data]) => {
          socket.emit('event', {name: 'displayErrByMessage', data: {errors: data, graph: graphData, msgName}});
        });
    }
    else {
      debug(`dunno event name ${event.name}`);
    }
  });

});

http.listen(config.port, () => {
  debug(`listening on *:${config.port}`);
});

