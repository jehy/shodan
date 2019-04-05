const config = require('config');
const bunyan = require('bunyan');
const Promise = require('bluebird');

const log = bunyan.createLogger({name: 'shodan:showSpeed'});

function fixData(el)
{
  const fixed = Object.assign({}, el);
  const message = el.message.replace(el.msgName, '').trim().trim();
  fixed.message = JSON.parse(message);
  return fixed;
}

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


  const conditionsTimings = await knex('speed_logs').select()
    .where('msgName', 'CONDITIONS_TIMINGS')
    .orderBy('eventDate', 'desc')
    .limit(20);

  const data = {
    pipelineData: pipelineData.map(fixData),
    totalData: totalData.map(fixData),
    conditionsTimings: conditionsTimings.map(fixData),
  };
  socket.emit('event', {name: 'showSpeed', data, id: event.id});
}


module.exports = showSpeed;
