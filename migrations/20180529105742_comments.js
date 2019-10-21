function up(knex, Promise) {
  return knex.schema.createTable('comments', (t) => {
    t.increments('id').unsigned().primary();
    t.string('comment').nullable();
    t.integer('error_id').unsigned().notNullable().index();
    t.dateTime('added').notNull().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    t.string('author').notNull().defaultTo('Evgeny Bondarenko');
  });
}

function down(knex, Promise) {
  return knex.schema.dropTableIfExists('comments');
}

module.exports = {up, down};
