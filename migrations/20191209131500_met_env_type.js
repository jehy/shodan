
function up(knex) {
  return knex.schema.alterTable('first_last_met', (t) => {
    t.enum('env', ['production-a', 'production-b', 'staging']).notNull().alter();
  });
}

function down(knex) {
  return knex.schema.alterTable('first_last_met', (t) => {
    t.string('env').notNullable().alter();
  });
}

module.exports = {up, down};
