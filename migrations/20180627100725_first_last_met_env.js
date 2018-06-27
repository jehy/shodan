exports.up = (knex, Promise)=> {
    return knex.schema.alterTable('first_last_met', (t) => {
        t.string('env').notNull().index();
    })
        .then(() => knex.raw('insert into first_last_met select min(`eventDate`) as `firstMet`,' +
    'max(`eventDate`) as `lastMet`, `name`, `msgName`, `env`  from `logs`  group by `msgName`, `name`'));
};

exports.down = (knex, Promise) => {
    return knex.schema.alterTable('first_last_met', (t) => {
        t.dropColumn('env');
    });
};
