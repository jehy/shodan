
function up(knex, Promise) {
  return knex.schema.alterTable('slack_bot', (t) => {
    t.integer('projectId').unsigned().notNullable().defaultTo(0);
  });
}

function down(knex, Promise) {
  return knex.schema.alterTable('slack_bot', (t) => {
    t.dropColumn('projectId');
  });
}

module.exports = {up, down};
