exports.up = (knex, Promise) => {
  return knex.schema.table('logs', (table) => {
    table.index('error_id');
  })
    .then(() => {
      return knex.schema.table('comments', (table) => {
        table.index('error_id');
      });
    })
    .then(() => {
      return knex.schema.table('first_last_met', (table) => {
        table.index('error_id');
      });
    });
};

exports.down = (knex, Promise) => {
  throw new Error('Not downgradable!');
};
