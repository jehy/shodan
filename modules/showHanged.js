const config = require('config');
const bunyan = require('bunyan');

const log = bunyan.createLogger({name: 'shodan:showHanged'});


async function showHanged(knex, socket, event) {

  const hangData = await knex('hanged_logs')
    .select('name', 'msgName', 'eventDate', 'type', 'msgId', 'message', 'level', 'score', 'logId')
    .whereRaw('eventDate > DATE_SUB(NOW(), INTERVAL 1 DAY)')
    .orderBy('eventDate');

  const logIds = hangData
    .map(data=>data.logId)
    .filter((value, index, self)=> self.indexOf(value) === index);

  const logData = await knex('logs')
    .select('env', 'host', 'role', 'pid', 'id')
    .whereIn('id', logIds)
    .orderBy('id');

  const hangDataMap = hangData
    .reduce((res, item)=>{
      if (!res[item.logId])
      {
        res[item.logId] = [];
      }
      res[item.logId].push(item);
      return res;
    }, {});
  const data = logData.map((item)=>{
    item.messages = hangDataMap[item.id];
    return item;
  });

  socket.emit('event', {name: 'showHanged', data, id: event.id});
}


module.exports = showHanged;
