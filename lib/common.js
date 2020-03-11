const minimatch = require('minimatch');

// require module on client & server
function makeKibanaLink(index, name, msgName, kibanaUrl, indexes) {
  const indexFound = indexes && indexes.find((ind)=>{
    const titleFix = ind.attributes.title
      .replace('-2*', '*') // twapi-avia-2 title to twapi-avia index
      .replace('-*', '*'); // since date removed...
    if (titleFix.length - index.length > 4) {
      return false; // for services with same prefix
    }
    if (titleFix === '*-*' || titleFix.length < 4) {
      return false;
    }
    return minimatch(index, titleFix);
  });
  /* if (!indexFound) {
    console.log(`index for ${index} not found in ${JSON.stringify(indexes)}`);
  }
  else
  {
    console.log(`index for ${index} found : ${JSON.stringify(indexFound)}`);
  } */
  const indexGuid = indexFound && indexFound.id || `${index}-*`; // fallback to name
  const nameFixed = name.split('"').join('');
  const msgNameFixed = msgName.split('"').join('');
  const kibanaUrlFixed = kibanaUrl.replace('logs-shodan', 'logs');
  const time = '(refreshInterval:(display:Off,pause:!f,value:0),time:(from:now-1h,mode:quick,to:now))';
  const filterSame = '(\'$state\':(store:appState),'
    + `meta:(alias:!n,disabled:!f,index:'${index}-*',key:msgName,negate:!f,`;
  const filterByMsgName = `${filterSame}params:(query:${msgNameFixed},type:phrase),type:phrase,value:${msgNameFixed}),`
    + `query:(match:(msgName:(query:${msgNameFixed},type:phrase))))`;
  const filterByName = `${filterSame}params:(query:${nameFixed},type:phrase),type:phrase,value:${nameFixed}),`
    + `query:(match:(fields.name:(query:${nameFixed},type:phrase))))`;
  const filterByErrorType = `${filterSame}params:(query:E,type:phrase),type:phrase,value:E),`
    + 'query:(match:(fields.type:(query:E,type:phrase))))';
  const extra = `,index:'${indexGuid}',interval:auto,query:(language:lucene,query:''),sort:!('@timestamp',desc))`;

  const linkWithMsgName = `${kibanaUrlFixed}/app/kibana#/discover?_g=${time}&_a=(columns:!(message),filters:!(`
  + `${[filterByMsgName, filterByName, filterByErrorType].join(',')})${extra}`;
  const linkWithoutMsgName = `${kibanaUrlFixed}/app/kibana#/discover?_g=${time}&_a=(columns:!(message),filters:!(`
    + `${[filterByName, filterByErrorType].join(',')})${extra}`;

  // auto generated message names won't have normal links
  if (msgName.indexOf('AUTO ') === 0) {
    return linkWithoutMsgName;
  }
  return linkWithMsgName;
}

module.exports = {makeKibanaLink};
