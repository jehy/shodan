// require module on client & server
function makeKibanaLink(index, name, msgName, kibanaUrl) {
  name = name.split('"').join();
  msgName = msgName.split('"').join();
  kibanaUrl = kibanaUrl.replace('logs-shodan', 'logs');
  return `${kibanaUrl}/app/kibana#/discover?_g=()&_a=(columns:!(message),filters:!(('$state':(store:appState),`
        + `meta:(alias:!n,disabled:!f,index:'${index}-*',key:fields.name,negate:!f,params:(query:${name},type:phrase),`
        + `type:phrase,value:${name}),query:(match:(fields.name:(query:${name},type:phrase)))),('$state':(store:appState),`
        + `meta:(alias:!n,disabled:!f,index:'${index}-*',key:fields.type,negate:!f,params:(query:E,type:phrase),type:phrase,value:E),`
        + `query:(match:(fields.type:(query:E,type:phrase)))),('$state':(store:appState),meta:(alias:!n,disabled:!f,index:'${index}-*',`
        + `key:msgName,negate:!f,params:(query:${msgName},type:phrase),type:phrase,value:${msgName}),`
        + `query:(match:(msgName:(query:${msgName},type:phrase))))),index:'${index}-*',interval:auto,query:(language:lucene,query:''),`
        + 'sort:!(\'@timestamp\',desc))';
}

module.exports = {makeKibanaLink};
