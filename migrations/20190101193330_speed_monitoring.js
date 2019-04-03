exports.up = (knex, Promise) => {
  return knex.schema.createTable('speed_logs', (t) => {
    t.increments('id').unsigned().primary();
    t.string('name').notNull().index();
    t.string('msgName').notNull().index();
    t.specificType('eventDate', 'DATETIME(6)').notNull().index();
    t.string('type').notNull().index();
    t.integer('pid').index();
    t.string('env').notNull().index();
    t.string('host').notNull();
    t.string('role').notNull().index();
    t.text('message').nullable();
    t.string('msgId').notNull();
    t.string('guid').notNull().unique();
    t.enum('level', ['I', 'E', 'W', 'Z', 'D', '']).notNull().index();
  });
};

exports.down = (knex, Promise) => {
  return knex.schema.dropTableIfExists('speed_logs');
};
