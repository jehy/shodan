const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const debug = require('debug')('shodan:server');
const config = require('config');
const knex = require('knex')(config.db);

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/dist/index.html');
});

io.on('connection', function (socket) {
  debug('a user connected');
  knex('logs')
    .select('msgName')
    .whereRaw('eventDate >= DATE_SUB(NOW(),INTERVAL 1 HOUR)')
    .groupBy('msgName')
    .count('msgName as count')
    .orderByRaw('count(msgName) desc')
    .limit(50)
    .then((topErrors) => {
      return Promise.all(topErrors.map((err) => {
        return knex('logs').select('eventDate').where('msgName', err.msgName).orderBy('id', 'asc').limit(1)
          .then((data) => {
            return Object.assign(err, {firstMet: data[0].eventDate});
          });
      }));
    })
    .then((topErrors) => {
      socket.emit('event', {name: 'updateTopErrors', data: topErrors});
    });

  socket.on('event', function (event) {
    debug(`event ${event.name} fired with data ${event.data}`);
    if (event.name === 'showLogsByMsgName') {
      const msgName = event.data.msgName;
      knex('logs')
        .where('msgName', msgName)
        .select('eventDate', 'name', 'type', 'msgId', 'env', 'host', 'role', 'message')
        .orderBy('id', 'desc')
        .limit(50)
        .then((errors) => {
          socket.emit('event', {name: 'displayErrByMessage', data: {errors: errors, msgName}});
        });
    }
    else {
      debug(`dunno event name ${event.name}`);
    }
  });

});

http.listen(3000, function () {
  debug('listening on *:3000');
});

