exports.up = (knex) => {
  return knex.schema.alterTable('first_last_met', (t) => {
    return t.string('index').index();
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('first_last_met', (t) => {
    return t.dropColumn('index');
  });
};
