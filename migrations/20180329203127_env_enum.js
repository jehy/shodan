exports.up = (knex, Promise) => {
  return knex.schema.alterTable('logs', (t) => {
    t.enum('env', ['production-a', 'production-b', 'staging']).notNull().alter();
  });
};

exports.down = (knex, Promise) => {
  return knex.schema.alterTable('logs', (t) => {
    t.string('env').notNull().alter();
  });
};
