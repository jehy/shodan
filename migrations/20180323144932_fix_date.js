exports.up = (knex, Promise) => {
  return knex.schema.alterTable('logs', (t) => {
    t.specificType('eventDate', 'DATETIME(6)').alter();
  });
};

exports.down = (knex, Promise) => {
  return knex.schema.alterTable('logs', (t) => {
    t.date('eventDate').notNull().index().alter();
  });
};
