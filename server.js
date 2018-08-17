const express = require('express');
const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const debug = require('debug')('shodan:server');
const config = require('config');
const knex = require('knex')(config.db);
require('./modules/knex-timings')(knex, false);
const showLogsByErrorId = require('./modules/showLogsByErrorId');
const showTopErrors = require('./modules/showTopErrors');
const updateMessageComment = require('./modules/updateMessageComment');

if (config.ui.auth && config.ui.auth.enabled) {
// eslint-disable-next-line global-require
  require('./modules/auth.js')(app, io, knex);
}

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/dist/index.html`);
});

app.use(express.static('dist'));

setInterval(() => {
  debug(`Current users connected: ${Object.keys(io.sockets.connected).length}`);
}, 5000);

function sendClinetConfig(socket) {
  const eventData = {
    name: 'updateConfig',
    data: {
      config:
        {
          updater: {
            indexes: config.updater.kibana.indexes,
          },
          ui: {
            display: config.ui.display,
          },
        },
    },
  };
  socket.emit('event', eventData);
}

io.on('connection', (socket) => {
  debug(`A user connected (${socket.request.user && socket.request.user.displayName || 'unknown'})`);

  sendClinetConfig(socket);

  socket.on('event', (event) => {
    debug(`event ${event.name} fired: ${JSON.stringify(event)}`);

    if (!event.data.index) {
      debug(`No index for request ${JSON.stringify(event.data)}, setting to default`);
      event.data.index = 'twapi-avia-*';
    }
    if (config.ui.auth && config.ui.auth.enabled) {
      if (!socket.request.user || !socket.request.user.logged_in) {
        debug('user not authorized!');
        socket.emit('event', {name: 'updateTopErrors', data: [], fetchErrors: ['Not authorized']});
        return;
      }
    }
    if (event.name === 'showTopErrors') {
      showTopErrors(knex, socket, event);
    }
    else if (event.name === 'updateMessageComment') {
      updateMessageComment(knex, socket, event);
    }
    else if (event.name === 'showLogsByErrorId') {
      showLogsByErrorId(knex, socket, event);
    }
    else {
      debug(`dunno event name ${event.name}`);
    }
  });

});

http.listen(config.ui.port, () => {
  debug(`listening on *:${config.ui.port}`);
});
