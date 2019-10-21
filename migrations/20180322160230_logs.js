function up(knex, Promise) {
  return knex.schema.createTable('logs', (t) => {
    t.increments('id').unsigned().primary();
    t.specificType('eventDate', 'DATETIME(6)').notNull().index();
    t.string('type').notNull().index();
    t.string('msgId').notNull();
    t.string('guid').notNull();
    t.enum('env', ['production-a', 'production-b', 'staging']).notNull().index();
    t.string('host').notNull();
    t.string('role').notNull().index();
    t.text('message').nullable();
    t.integer('pid').index();
    t.integer('messageLength').index();
    t.integer('error_id').unsigned().notNullable().index();
    t.enum('level', ['I', 'E', 'W', 'Z', 'D', '']).notNull().index();
  });
}

function down(knex, Promise) {
  return knex.schema.dropTableIfExists('logs');
}

module.exports = {up, down};
