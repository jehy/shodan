const express = require('express');
const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
// const debug = require('debug')('shodan:server');
const config = require('config');
const bunyan = require('bunyan');
const knex = require('knex')(config.db);
require('./modules/knex-timings')(knex, false);

const showLogsByErrorId = require('./modules/showLogsByErrorId');
const {showTopErrors} = require('./modules/showTopErrors');
const showHanged = require('./modules/showHanged');
const showSpeed = require('./modules/showSpeed');
const showConditions = require('./modules/showConditions');
const updateMessageComment = require('./modules/updateMessageComment');

const log = bunyan.createLogger({name: 'shodan:server'});

if (config.ui.auth && config.ui.auth.enabled) {
// eslint-disable-next-line global-require
  require('./modules/auth.js')(app, io, knex);
}

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/dist/index.html`);
});

app.use(express.static('dist'));

setInterval(() => {
  log.info(`Current users connected: ${Object.keys(io.sockets.connected).length}`);
}, 5000);

function sendClientConfig(socket) {
  const eventData = {
    name: 'updateConfig',
    data: {
      config:
        {
          updater: {
            indexes: config.updater.kibana.indexes,
            kibana:
              {
                url: config.updater.kibana.url,
              },
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
  log.info(`A user connected (${socket.request.user && socket.request.user.displayName || 'unknown'})`);

  sendClientConfig(socket);

  socket.on('event', (event) => {
    log.info(`event ${event.name} fired: ${JSON.stringify(event)}`);

    if (!event.data.index) {
      log.info(`No index for request ${JSON.stringify(event.data)}, setting to default`);
      event.data.index = 'twapi-avia-*';
    }
    if (config.ui.auth && config.ui.auth.enabled && (!socket.request.user || !socket.request.user.logged_in)) {
      log.warn('user not authorized!');
      socket.emit('event', {name: 'updateTopErrors', data: [], fetchErrors: ['Not authorized']});
      return;
    }
    if (event.name === 'showTopErrors') {
      showTopErrors(knex, socket, event);
    } else if (event.name === 'updateMessageComment') {
      updateMessageComment(knex, socket, event);
    } else if (event.name === 'showHanged') {
      showHanged(knex, socket, event);
    } else if (event.name === 'showSpeed') {
      showSpeed(knex, socket, event);
    }  else if (event.name === 'showConditions') {
      showConditions(knex, socket, event);
    } else if (event.name === 'showLogsByErrorId') {
      showLogsByErrorId(knex, socket, event);
    } else {
      log.error(`dunno event name ${event.name}`);
    }
  });

});

http.listen(config.ui.port, () => {
  log.info(`listening on *:${config.ui.port}`);
});
