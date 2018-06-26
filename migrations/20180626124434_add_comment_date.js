exports.up = (knex) => {
  return knex.schema.alterTable('comments', (t) => {
    t.dateTime('added').notNull().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    t.string('author').notNull().defaultTo('Evgeny Bondarenko');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('comments', (t) => {
    t.dropColumn('added');
    t.dropColumn('author');
  });
};
