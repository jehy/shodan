
function up(knex, Promise) {
  return knex.schema.alterTable('slack_bot', (t) => {
    t.integer('typeErr').unsigned().notNullable().alter();
  });
}

function down(knex, Promise) {
  return knex.schema.alterTable('slack_bot', (t) => {
    t.string('typeErr').notNullable().alter();
  });
}

module.exports = {up, down};
