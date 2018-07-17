const config = require('config');
const Promise = require('bluebird');
const knex = require('knex')(config.db);
const {getMessageName} = require('../modules/utils');

require('../modules/knex-timings')(knex, false);


//
//  this is for different data fix scrips
//
//
const concurrency = 10;

knex.select('id', 'msgName', 'message')
  .from('logs')
  .where('msgName', '...')
  .then((data) => {

    return Promise.map(data, (item) => {
      const newMessageName = getMessageName(item.msgName, item.message, true);
      if (newMessageName === item.msgName) {
        console.log(`Not updated message name! Name: ${newMessageName} \nMessage: ${item.message}`);
      }
      if (newMessageName !== item.msgName) {
        return knex('logs').where('id', item.id).update({msgName: newMessageName});
      }
      console.log(item.id);
      return Promise.resolve();
    }, {concurrency});
  })
  .then(() => {
    console.log('Logs updated');
    process.exit(0);
  });
