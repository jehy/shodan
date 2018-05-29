exports.up = (knex, Promise) => {
  return knex.schema.createTable('comments', (t) => {
    t.increments('id').unsigned().primary();
    t.string('msgName').notNull().index();
    t.string('name').notNull().index();
    t.string('comment').nullable();
  });
};

exports.down = (knex, Promise) => {
  return knex.schema.dropTableIfExists('comments');
};
