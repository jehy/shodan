exports.up = (knex, Promise) => {
  console.log('Warning, this may take large time on big database, please wait...');
  return knex.schema.alterTable('logs', (t) => {
    t.enum('env', ['production-a', 'production-b', 'staging']).notNull().alter();
  });
};

exports.down = (knex, Promise) => {
  console.log('Warning, this may take large time on big database, please wait...');
  return knex.schema.alterTable('logs', (t) => {
    t.string('env').notNull().alter();
  });
};
