exports.up = (knex) => {
  return knex.schema.alterTable('logs', (t) => {
    return t.integer('pid').index();
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('logs', (t) => {
    return t.dropColumn('pid');
  });
};
