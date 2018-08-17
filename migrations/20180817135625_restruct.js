exports.up = (knex, Promise)=> {
  return knex.schema.createTable('errors', (t) => {
    t.increments('id').unsigned().primary();
    t.string('name').notNull().index();
    t.string('msgName').notNull().index();
    t.string('index').index();
  })
    .then(()=>{
      return knex.raw('insert into errors select NULL as id, `name` as` name`, `msgName` as `msgName`, `index` as `index`  from `logs`'
        + '  group by `msgName`, `name`, `index`');
    }).then(()=>{
      return knex.schema.alterTable('logs', (t) => {
        return t.integer('error_id').unsigned().notNullable();
      });
    })
    .then(()=>{
      return knex.raw('update logs set logs.error_id = (select errors.id from errors '
        + 'where  errors.name=logs.name and errors.msgName=logs.msgName and errors.index=logs.index)');
    }).then(()=>{
      return knex.schema.alterTable('comments', (t) => {
        return t.integer('error_id').unsigned().notNullable();
      });
    })
    .then(()=>{
      return knex.raw('create table tmp as (select c2.id from comments c2 left join errors on'
        + '(c2.name=errors.name) and c2.msgName=errors.msgName and c2.`index`=errors.`index`'
        + 'where errors.id is NULL)');
    })
    .then(()=>{
      return knex.raw('delete from comments where id in (select id from tmp)');
    })
    .then(()=>{
      return knex.schema.dropTableIfExists('tmp');
    })
    .then(()=>{
      return knex.raw('update comments set comments.error_id = (select errors.id from errors '
        + 'where  comments.name=errors.name and comments.msgName=errors.msgName and comments.index=errors.index)');
    }).then(()=>{
      return knex.schema.alterTable('first_last_met', (t) => {
        return t.integer('error_id').unsigned().notNullable();
      });
    })
    .then(()=>{
      return knex.raw('update first_last_met set first_last_met.error_id = (select errors.id from errors '
        + 'where  first_last_met.name=errors.name and first_last_met.msgName=errors.msgName and first_last_met.index=errors.index)');
    })
    .then(()=>{
      return knex.schema.alterTable('first_last_met', (t) => {
        return t.dropColumns('msgName', 'name', 'index');
      });
    })
    .then(()=>{
      return knex.schema.alterTable('comments', (t) => {
        return t.dropColumns('msgName', 'name', 'index');
      });
    })
    .then(()=>{
      return knex.schema.alterTable('logs', (t) => {
        return t.dropColumns('msgName', 'name', 'index');
      });
    })
    .then(()=>{
      return knex.schema.dropTableIfExists('first_last_met_tmp');
    });
};

exports.down = (knex, Promise) => {
  // return knex.schema.dropTableIfExists('errors');
  throw new Error('Not downgradable!');
};
