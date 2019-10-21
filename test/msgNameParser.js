const {assert} = require('chai');
const parsingUtils = require('../modules/utils');


describe('Message name generator', () => {


  it('should make message name from uncaughtException_0', () => {
    const err = 'uncaughtException_0 uncaughtException TypeError: Cannot read property \'length\' of undefined at Function.'
      + ' (/home/stmth/smth/releases/20180405071600/src/mcore_modules/confirming/search.js:3519:35)'
      + ' at next (/home/stmth/smth/releases/20180405071600/lib/nodejs/step.js:49:23)';

    const logEntry = {
      _source: {
        message: err,
        msgName: 'uncaughtException_0',
        fields: {},
      },
      // eslint-disable-next-line sonarjs/no-duplicate-string
      _index: 'some-index',
    };
    const fixed = parsingUtils.fixLogEntry(logEntry);
    assert.equal(fixed.msgName, 'uncaughtException_0 TypeError: Cannot read property \'length\' of undefined at Function.');
  });


  it('should make message name from uncaughtException', () => {
    const err = 'uncaughtException {} ---------------------Thu Apr 05 2018 08:05:20'
      + ' GMT+0000 (UTC)------------------------------ TypeError: result.services.filter'
      + ' is not a function at results.reduce (/home/stmth/smth/releases/20180405071600/s'
      + 'rc/tw_shared_types/additional_services/service/index.js:73:6) at Array.reduce () '
      + 'at async.mapSeries (/home/stmth/smth/releases/20180405071600/src/tw_shared_types'
      + '/additional_services/service/index.js:71:34) at ';

    const logEntry = {
      _source: {
        message: err,
        msgName: 'uncaughtException',
        fields: {},
      },
      _index: 'some-index',
    };
    const fixed = parsingUtils.fixLogEntry(logEntry);
    assert.equal(fixed.msgName, 'uncaughtException TypeError: result.services.filter is not a function at results.reduce');
  });

  it('should make message name from uncaughtException (format 2)', () => {
    const err = 'uncaughtException {"name":"MyResponseError","message"'
      + ':"no response","cause":{"status":{"sent":true,"sendTime":"2018-04-05T08:02:48.594Z",'
      + '"request":"\n\t\n\t \n\t\t\n\t\t LED\n\t\t SCW\n\t\t 12.05.18\n\t\t false\n\t\t Y\n\t\t\n\t\t\n\t\t '
      + 'ADT\n\t\t 1\n\t\t\n\t\t\n\t\t\t200\n\t\t\tspOnePass\n\t\t\tdifferentFlightsCombFirst\n\t\t\t'
      + 'true\n\t\t\tfalse\n\t\t\ttrue\n\t\t\n\t\t\n\t\t true\n\t\t true\n\t\t true\n\t\t true\n\t\t '
      + 'true\n\t\t true\n\t\t true\n\t\t true\n\t\t true\n\t\t en\n\t\t\n\t \n\t\n \n","msgId":1753766333,"'
      + 'options":{}}}} ---------------------Thu Apr 05 2018 08:03:48 GMT+0000 (UTC)------------------------------'
      + ' MyResponseError: no response at /home/stmth/smth/releases/20180405071600/src/tw_shared_types/engines/'
      + 'engines/sirena/sirenaclient.js:106:21 at Array.forEach () at Socket. (/home/stmth/smth/releases/20180405071600/'
      + 'src/tw_shared_types/engines/engines/sirena/sirenaclient.js:105:33)';

    const logEntry = {
      _source: {
        message: err,
        msgName: 'uncaughtException',
        fields: {},
      },
      _index: 'some-index',
    };
    const fixed = parsingUtils.fixLogEntry(logEntry);
    assert.equal(fixed.msgName, 'uncaughtException MyResponseError: no response');
  });

  it('should make message name from data with email', () => {
    const err = 'logMailEvents - error saving event - email: 2987782@mail.ru 21112005@bk.ru '
      + 'jehy@gmail.com vasya@pupkin@mail.ru msgId: undefined event: open';

    const logEntry = {
      _source: {
        message: err,
        fields: {},
      },
      _index: 'some-index',
    };
    const fixed = parsingUtils.fixLogEntry(logEntry);
    assert.equal(fixed.msgName, 'AUTO logMailEvents - error saving event - email: EMAIL...');
  });
});
