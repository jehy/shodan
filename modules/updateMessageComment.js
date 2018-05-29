const debug = require('debug')('shodan:server');

function updateMessageComment(knex, socket, event) {
  const {msgName, name, comment} = event.data;
  const queryData = knex('comments')
    .select('id')
    .where('msgName', msgName)
    .where('name', name)
    .limit(1);

  queryData.then((data) => {
    if (data[0] && data[0].id) {
      knex('comments')
        .where('id', data[0].id)
        .update({comment})
        .then(()=>{
          debug('comment updated');
        });
    }
    else {
      knex('comments')
        .insert({
          comment,
          name,
          msgName,
        })
        .then(()=>{
          debug('comment added');
        });
    }
  });
}

module.exports = updateMessageComment;