
const bunyan = require('bunyan');

const log = bunyan.createLogger({name: 'shodan:updateMessageComment'});

async function updateMessageComment(knex, socket, event) {
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
  const data = await queryData;
  if (data && data.id) {
    await knex('comments')
      .where('id', data.id)
      .update({comment, author});
    log.info('comment updated');
  }
  await knex('comments')
    .insert({
      comment,
      error_id: errorId,
      author,
    });
  log.info('comment added');
}

module.exports = updateMessageComment;
