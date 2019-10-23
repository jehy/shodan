const table = 'slack_bot';
function up(knex, Promise) {
  return knex.schema.createTable(table, (t) => {
    t.increments('id').unsigned().primary();
    t.string('msgName').nullable();
    t.string('typeErr').notNullable();
    t.dateTime('added').notNull().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
  });
}

function down(knex, Promise) {
  return knex.schema.dropTableIfExists(table);
}

module.exports = {up, down};
