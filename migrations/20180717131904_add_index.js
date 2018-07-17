exports.up = (knex) => {
  return knex.schema.alterTable('logs', (t) => {
    return t.string('index').index();
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('logs', (t) => {
    return t.dropColumn('index');
  });
};
