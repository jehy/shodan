exports.up = (knex, Promise)=> {
  return knex.schema.createTable('first_last_met_tmp', (t) => {
    t.dateTime('firstMet').notNull();
    t.dateTime('lastMet').notNull();
    t.string('name').notNull();
    t.string('msgName').notNull();
    t.string('env').notNull();
    t.string('index');
  });
};

exports.down = (knex, Promise) => {
  return knex.schema.dropTableIfExists('first_last_met_tmp');
};
