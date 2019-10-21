function up(knex, Promise) {
  return knex.schema.createTable('hanged_logs', (t) => {
    t.increments('id').unsigned().primary();
    t.string('name').notNull().index();
    t.string('msgName').notNull().index();
    t.specificType('eventDate', 'DATETIME(6)').notNull().index();
    t.string('type').notNull().index();
    t.string('msgId').notNull();
    t.string('guid').notNull().unique();
    t.text('message').nullable();
    t.text('messageGeneric').nullable();
    t.string('messageGenericHash').nullable().index();
    t.enum('level', ['I', 'E', 'W', 'Z', 'D', '']).notNull().index();
    t.integer('logId').unsigned().notNullable();
    t.integer('score').index();
  });
}

function down(knex, Promise) {
  return knex.schema.dropTableIfExists('hanged_logs').catch();
}

module.exports = {up, down};
