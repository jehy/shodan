exports.up = (knex) => {
  return knex.schema.alterTable('comments', (t) => {
    return t.string('index').index();
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('comments', (t) => {
    return t.dropColumn('index');
  });
};
