const Promise = require('bluebird');

function showLogsByMsgName(knex, socket, event) {
  const {msgName, name, env, role, pid} = event.data;
  let queryData = knex('logs')
    .where('msgName', msgName)
    .where('name', name);

  if (env) {
    queryData = queryData
      .where('env', env);
  }
  if (role) {
    queryData = queryData
      .where('role', role);
  }
  queryData = queryData.select('eventDate', 'name', 'type', 'msgId', 'env', 'host', 'role', 'message', 'pid')
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
  if (pid) {
    queryGraph = queryGraph
      .where('pid', pid);
  }
  if (role) {
    queryGraph = queryGraph
      .where('role', role);
  }
  queryGraph = queryGraph.groupByRaw('CONCAT(DATE_FORMAT(eventDate, "%Y %m %d %H")," ",FLOOR(DATE_FORMAT(eventDate, "%i")/10)*10)');

  const commentQuery = knex('comments')
    .where('msgName', msgName)
    .where('name', name)
    .limit(1).first();
  Promise.all([queryGraph, queryData, commentQuery])
    .then(([graphData, data, commentData]) => {
      socket.emit('event', {
        name: 'displayErrByMessage',
        data: {
          errors: data,
          graph: graphData,
          msgName,
          name,
          comment: commentData,
        },
      });
    });
}

module.exports = showLogsByMsgName;
