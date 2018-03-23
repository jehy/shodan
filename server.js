const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const debug = require('debug')('shodan:server');
const config = require('config');
const knex = require('knex')(config.db);

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/dist/index.html`);
});

io.on('connection', (socket) => {
  debug('a user connected');

  socket.on('event', (event) => {
    debug(`event ${event.name} fired`);
    debug(JSON.stringify(event));
    if (event.name === 'showTopErrors') {
      let query = knex('logs')
        .select('msgName', 'name')
        .whereRaw('eventDate >= DATE_SUB(NOW(),INTERVAL 1 HOUR)');
      if (event.data.env) {
        query = query
          .where('env', event.data.env);
      }
      query = query
        .groupBy('msgName', 'name')
        .count('msgName as count')
        .orderByRaw('count(msgName) desc, msgName')
        .limit(50);
      query
        .then((topErrors) => {
          const msgNames = topErrors.map(err => err.msgName);

          let hourPreQuery = knex('logs')
            .select('msgName', 'name')
            .count('msgName as count')
            .groupBy('msgName', 'name')
            .whereRaw('eventDate BETWEEN DATE_SUB(NOW(),INTERVAL 2 HOUR) AND DATE_SUB(NOW(),INTERVAL 1 HOUR)');
          if (event.data.env) {
            hourPreQuery = hourPreQuery
              .where('env', event.data.env);
          }
          let firstLastMetDataQuery = knex('logs')
            .select('msgName', 'name')
            .min('eventDate as firstMet')
            .max('eventDate as lastMet')
            .whereIn('msgName', msgNames)
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
      const {msgName} = event.data;
      knex('logs')
        .where('msgName', msgName)
        .select('eventDate', 'name', 'type', 'msgId', 'env', 'host', 'role', 'message')
        .orderBy('id', 'desc')
        .limit(50)
        .then((errors) => {
          socket.emit('event', {name: 'displayErrByMessage', data: {errors, msgName}});
        });
    }
    else {
      debug(`dunno event name ${event.name}`);
    }
  });

});

http.listen(3000, () => {
  debug('listening on *:3000');
});

