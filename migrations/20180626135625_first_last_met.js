function up(knex, Promise) {
  return knex.schema.createTable('first_last_met', (t) => {
    t.dateTime('firstMet').notNull().index();
    t.dateTime('lastMet').notNull().index();
    t.string('env').notNull().index();
    t.integer('error_id').unsigned().notNullable().index();
  });
}

function down(knex, Promise) {
  return knex.schema.dropTableIfExists('first_last_met');
}

module.exports = {up, down};
