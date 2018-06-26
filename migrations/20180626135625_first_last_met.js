exports.up = (knex, Promise)=> {
  return knex.schema.createTable('first_last_met', (t) => {
    t.dateTime('firstMet').notNull().index();
    t.dateTime('lastMet').notNull().index();
    t.string('name').notNull().index();
    t.string('msgName').notNull().index();
  }).then(() => knex.raw('insert into first_last_met select min(`eventDate`) as `firstMet`,' +
    'max(`eventDate`) as `lastMet`, `name`, `msgName`  from `logs`  group by `msgName`, `name`'));
};

exports.down = (knex, Promise) => {
  return knex.schema.dropTableIfExists('first_last_met');
};
