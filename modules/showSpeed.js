const config = require('config');
const bunyan = require('bunyan');
const Promise = require('bluebird');

const log = bunyan.createLogger({name: 'shodan:showSpeed'});


async function showSpeed(knex, socket, event) {

  const queryData1 = knex('speed_logs').select()
    .where('msgName', 'SEARCH_TIMING_PIPELINE')
    .where('env', '!=', 'staging') // TODO remove when staging ok
    .orderBy('eventDate', 'desc')
    .limit(20);

  const queryData2 = knex('speed_logs').select()
    .where('msgName', 'SEARCH_TIMING_TOTAL')
    .where('env', '!=', 'staging') // TODO remove when staging ok
    .orderBy('eventDate', 'desc')
    .limit(20);

  const res = await Promise.all([queryData1, queryData2]);
  const data = res[0].concat(res[1]).map((el) => {
    const fixed = Object.assign({}, el);
    const message = el.message.replace(el.msgName, '').trim().trim();
    fixed.message = JSON.parse(message);
    return fixed;
  });
  socket.emit('event', {name: 'showSpeed', data, id: event.id});
}


module.exports = showSpeed;
