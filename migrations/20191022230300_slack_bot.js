const table = 'slack-bot';
function up(knex, Promise) {
  return knex.schema.createTable(table, (t) => {
    t.increments('id').unsigned().primary();
    t.text('fullMessage').nullable();
    t.boolean('isStaging').notNullable();
    t.dateTime('added').notNull().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
  });
}

function down(knex, Promise) {
  return knex.schema.dropTableIfExists(table);
}

module.exports = {up, down};
