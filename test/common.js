const {assert} = require('chai');
const commonLib = require('../lib/common');


describe('common front and back libs', () => {


  describe('kibana link generator', () => {
    it('should make links when msgName is not auto', () => {

      const link = commonLib.makeKibanaLink('twapi-avia', 'SEARCH_MONITORING', 'monitorDirectFlights', 'https://logs.twiket.com');
      assert.equal(link, 'https://logs.twiket.com/app/kibana#/discover?_g=(refreshInterval:(display:Off,pause:!f,value:0),'
        + 'time:(from:now-1h,mode:quick,to:now))&_a=(columns:!(message),filters:!((\'$state\':(store:appState),'
        + 'meta:(alias:!n,disabled:!f,index:\'twapi-avia-*\',key:msgName,negate:!f,params:(query:monitorDirectFlights,type:phrase),'
        + 'type:phrase,value:monitorDirectFlights),query:(match:(msgName:(query:monitorDirectFlights,type:phrase)))),'
        + '(\'$state\':(store:appState),meta:(alias:!n,disabled:!f,index:\'twapi-avia-*\',key:msgName,negate:!f,'
        + 'params:(query:SEARCH_MONITORING,type:phrase),type:phrase,value:SEARCH_MONITORING),'
        + 'query:(match:(fields.name:(query:SEARCH_MONITORING,type:phrase)))),(\'$state\':(store:appState),'
        + 'meta:(alias:!n,disabled:!f,index:\'twapi-avia-*\',key:msgName,negate:!f,params:(query:E,type:phrase),'
        + 'type:phrase,value:E),query:(match:(fields.type:(query:E,type:phrase))))),index:\'twapi-avia-*\',interval:auto,'
        + 'query:(language:lucene,query:\'\'),sort:!(\'@timestamp\',desc))');
    });
    it('should make links when msgName is auto', () => {

      const link = commonLib.makeKibanaLink('twapi-avia', 'SEARCH_MONITORING', 'AUTO monitorDirectFlights', 'https://logs.twiket.com');
      assert.equal(link, 'https://logs.twiket.com/app/kibana#/discover?_g=(refreshInterval:(display:Off,pause:!f,value:0),'
        + 'time:(from:now-1h,mode:quick,to:now))&_a=(columns:!(message),filters:!((\'$state\':(store:appState),'
        + 'meta:(alias:!n,disabled:!f,index:\'twapi-avia-*\',key:msgName,negate:!f,'
        + 'params:(query:SEARCH_MONITORING,type:phrase),type:phrase,value:SEARCH_MONITORING),'
        + 'query:(match:(fields.name:(query:SEARCH_MONITORING,type:phrase)))),(\'$state\':(store:appState),'
        + 'meta:(alias:!n,disabled:!f,index:\'twapi-avia-*\',key:msgName,negate:!f,params:(query:E,type:phrase),'
        + 'type:phrase,value:E),query:(match:(fields.type:(query:E,type:phrase))))),index:\'twapi-avia-*\','
        + 'interval:auto,query:(language:lucene,query:\'\'),sort:!(\'@timestamp\',desc))');
    });
  });

});
