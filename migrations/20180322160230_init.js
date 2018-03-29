exports.up = (knex, Promise) => {
  return knex.schema.createTable('logs', (t) => {
    t.increments('id').unsigned().primary();
    t.dateTime('eventDate').notNull().index();
    t.string('name').notNull().index();
    t.string('type').notNull().index();
    t.string('msgName').notNull().index();
    t.string('msgId').notNull();
    t.string('guid').notNull().unique();
    t.string('env').notNull().index();
    t.string('host').notNull();
    t.string('role').notNull().index();
    t.text('message').nullable();
    t.enum('level', ['I', 'E', 'W', 'Z', 'D', '']).notNull().index();
  });
};

exports.down = (knex, Promise) => {
  return knex.schema.dropTableIfExists('logs');
};
