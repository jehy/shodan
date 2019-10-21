function up(knex, Promise) {
  return knex.schema.createTable('errors', (t) => {
    t.increments('id').unsigned().primary();
    t.string('name').notNull().index();
    t.string('msgName').notNull().index();
    t.string('index').index();
  });
}

function down(knex, Promise) {
  return knex.schema.dropTableIfExists('errors');
}


module.exports = {up, down};
