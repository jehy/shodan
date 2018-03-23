
exports.up = function(knex, Promise) {
  return knex.schema.alterTable('logs', function(t) {
    t.specificType('eventDate', 'DATETIME(6)').alter();
  });
};

exports.down = function(knex, Promise) {
  return knex.schema.alterTable('logs', function(t) {
    t.date('eventDate').notNull().index().alter();
  });
};
