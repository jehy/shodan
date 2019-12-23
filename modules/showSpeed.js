const config = require('config');
const bunyan = require('bunyan');
const Promise = require('bluebird');
const {fixData} = require('../lib/fixLogs');

const log = bunyan.createLogger({name: 'shodan:showSpeed'});

async function showSpeed(knex, socket, event) {

  const pipelineData = await  knex('speed_logs').select()
    .where('msgName', 'SEARCH_TIMING_PIPELINE')
    .where('level', 'W')
    .orderBy('eventDate', 'desc')
    .limit(20);

  const totalData = await knex('speed_logs').select()
    .where('msgName', 'SEARCH_TIMING_TOTAL')
    .where('level', 'W')
    .orderBy('eventDate', 'desc')
    .limit(20);
  const data = {
    pipelineData: pipelineData.map(fixData),
    totalData: totalData.map(fixData),
  };
  socket.emit('event', {name: 'showSpeed', data, id: event.id});
}


module.exports = showSpeed;
