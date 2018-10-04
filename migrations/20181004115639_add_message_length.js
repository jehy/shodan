exports.up = async (knex) => {
  await  knex.schema.alterTable('logs', (t) => {
    return t.integer('messageLength').index();
  });
  await knex.raw('update logs set messageLength = CHAR_LENGTH(message)'); // not quite fine but better then nothing
};

exports.down = async (knex) => {
  await  knex.schema.alterTable('logs', (t) => {
    return t.dropColumn('messageLength');
  });
};
