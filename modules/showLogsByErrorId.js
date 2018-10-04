const Promise = require('bluebird');

function showLogsByErrorId(knex, socket, event) {
  const {errorId, env, role, pid} = event.data;
  let queryData = knex('logs')
    .join('errors', 'logs.error_id', 'errors.id')
    .where('error_id', errorId);

  if (env) {
    queryData = queryData
      .where('logs.env', env);
  }
  if (role) {
    queryData = queryData
      .where('logs.role', role);
  }
  queryData = queryData.select('errors.id', 'logs.messageLength', 'logs.eventDate', 'errors.name', 'errors.msgName', 'logs.type',
    'logs.env', 'logs.host', 'logs.role', 'logs.message', 'logs.pid', 'errors.index')
    .orderBy('logs.id', 'desc')
    .limit(50);

  let queryGraph = knex('logs')
    .join('errors', 'logs.error_id', 'errors.id')
    .count('logs.eventDate as count')
    .select(knex.raw('CONCAT(DATE_FORMAT(logs.eventDate, "%Y %m %d %H")," ",'
      + ' FLOOR(DATE_FORMAT(logs.eventDate, "%i")/10)*10)  as eventDate'))
    .where('errors.id', errorId)
    .whereRaw('logs.eventDate > DATE_SUB(NOW(), INTERVAL 1 DAY)');

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
    .where('error_id', errorId)
    .limit(1).first();
  Promise.all([queryGraph, queryData, commentQuery])
    .then(([graphData, data, commentData]) => {
      socket.emit('event', {
        name: 'displayErrByMessage',
        data: {
          errors: data,
          graph: graphData,
          msgName: data.msgName,
          errorId,
          name: data.name,
          comment: commentData,
        },
      });
    });
}

module.exports = showLogsByErrorId;
