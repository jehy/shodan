const config = require('config');
const knex = require('knex')(config.db);
const {getMessageName} = require('../utils');
const Promise = require('bluebird');

require('../modules/knex-timings')(knex, false);

const concurrency = 10;

knex.select('id', 'msgName', 'message')
  .from('logs')
  .whereIn('msgName', ['uncaughtException', 'uncaughtException_0'])
  .then((data) => {

    return Promise.map(data, (item) => {
      const newMessageName = getMessageName(item.msgName, item.message);
      if (newMessageName !== item.msgName) {
        return knex('logs').where('id', item.id).update({msgName: newMessageName});
      }
      return Promise.resolve();
    }, {concurrency});
    /* return data.reduce((res, item) => {
      return res.then(() => {

      });
    }, Promise.resolve()); */
  });
