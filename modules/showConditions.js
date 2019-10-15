const config = require('config');
const bunyan = require('bunyan');
const Promise = require('bluebird');
const {fixData} = require('./utils');

const log = bunyan.createLogger({name: 'shodan:showSpeed'});

async function showSpeed(knex, socket, event) {

  const conditionsTimings = await knex('speed_logs').select()
    .where('msgName', 'CONDITIONS_TIMINGS')
    .orderBy('eventDate', 'desc')
    .limit(20);

  const data = {
    conditionsTimings: conditionsTimings.map(fixData),
  };
  socket.emit('event', {name: 'showConditions', data, id: event.id});
}


module.exports = showSpeed;
