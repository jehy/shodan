
const bunyan = require('bunyan');

const log = bunyan.createLogger({name: 'shodan:updateMessageComment'});

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
  } catch (err) {
    log.warn('Could not identify comment user!');
  }
  return queryData.then((data) => {
    if (data && data.id) {
      return knex('comments')
        .where('id', data.id)
        .update({comment, author})
        .then(() => {
          log.info('comment updated');
        });
    }
    return knex('comments')
      .insert({
        comment,
        error_id: errorId,
        author,
      })
      .then(()=>{
        log.info('comment added');
      });

  });
}

module.exports = updateMessageComment;
