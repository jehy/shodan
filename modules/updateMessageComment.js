const debug = require('debug')('shodan:server');

function updateMessageComment(knex, socket, event) {
  const {errorId, comment} = event.data;
  const queryData = knex('comments')
    .select('id')
    .where('error_id', errorId)
    .limit(1)
    .first();

  let author = 'Anonymous';
  try {
    author = socket.request.user.displayName;
  }
  catch (err) {
    debug('Could not identify comment user!');
  }
  queryData.then((data) => {
    if (data && data.id) {
      knex('comments')
        .where('id', data.id)
        .update({comment, author})
        .then(() => {
          debug('comment updated');
        });
    }
    else {
      knex('comments')
        .insert({
          comment,
          error_id: errorId,
          author,
        })
        .then(()=>{
          debug('comment added');
        });
    }
  });
}

module.exports = updateMessageComment;
