/*
*
    type: logEntry._type,
    name: logEntry._source.fields.name,
    timestamp: logEntry._source['@timestamp'],
    level: logEntry._source.fields.type,
    message: message.trim(),
    msgName: messageName.trim(),
    msgId: logEntry._source['msgId'],
    env: logEntry._source['chef_environment'],
    host: logEntry._source['host'],
    role: logEntry._source['role'],

    ,
  kibanaErrors       {
  kibanaErrors          "type": "twapi-avia",
  kibanaErrors          "name": "ADDITIONAL_SERVICES",
  kibanaErrors          "timestamp": "2018-03-22T12:53:35.707Z",
  kibanaErrors          "level": "E",
  kibanaErrors          "message": "_ex_createAdditionalServicesOrders_0 BAD SERVICE 1 undefined order e8ff45b4-7d2b-4aa3-87f1-603716c304b4",
  kibanaErrors          "msgName": "_ex_createAdditionalServicesOrders_0",
  kibanaErrors          "msgId": "6623620001b5defcf9a487bbc0bb441d",
  kibanaErrors          "env": "production-b",
  kibanaErrors          "host": "order-production-b-1i5ro",
  kibanaErrors          "role": "api-order"
  kibanaErrors       },

    */
exports.up = function(knex, Promise) {
  return knex.schema.createTable('logs', function(t) {
    t.increments('id').unsigned().primary();
    t.dateTime('eventDate').notNull().index();
    t.string('name').notNull().index();
    t.string('type').notNull().index();
    t.string('msgName').notNull().index();
    t.string('msgId').notNull();
    t.string('guid').notNull().unique();
    t.string('env').notNull().index();
    t.string('host').notNull();
    t.string('role').notNull().index();
    t.text('message').nullable();
    t.enum('level', ['I', 'E', 'W','Z','D','']).notNull().index();
  });
};

exports.down = function(knex, Promise) {
  return knex.schema.dropTableIfExists('logs');
};
