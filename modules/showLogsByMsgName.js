function showLogsByMsgName(knex, socket, event) {
  const {msgName, name, env} = event.data;
  let queryData = knex('logs')
    .where('msgName', msgName)
    .where('name', name);

  if (env) {
    queryData = queryData
      .where('env', env);
  }
  queryData = queryData.select('eventDate', 'name', 'type', 'msgId', 'env', 'host', 'role', 'message')
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
  queryGraph = queryGraph.groupByRaw('CONCAT(DATE_FORMAT(eventDate, "%Y %m %d %H")," ",FLOOR(DATE_FORMAT(eventDate, "%i")/10)*10)');
  Promise.all([queryGraph, queryData])
    .then(([graphData, data]) => {
      socket.emit('event', {name: 'displayErrByMessage', data: {errors: data, graph: graphData, msgName}});
    });
}

module.exports = showLogsByMsgName;
