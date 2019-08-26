'use strict';

const modalTitle = $('#modal .modal-title');
const modalBody = $('#modal .modal-body');
const modal = $('#modal');


function showModal(header, data) {
  modalTitle.empty().append(header);
  modalBody.empty().append(data);
  // modal.on('hidden.bs.modal',  ()=>{
  //  window.location.href = '#';
  // /});
  modal.modal();
}

function addAutoBadge(error) {
  if (error.indexOf('AUTO ') === 0) {
    return `${error.replace('AUTO ', '')} <span class="label label-default">auto</span>`;
  }
  return error;
}

function addErrorBadges(row) {

  const displayName = row.msgName;
  if (row.errors && row.errors.length) {
    return `${displayName} <span class="label label-danger">${row.errors.join(', ')}</span>`;
  }
  return displayName;
}

function formatMessageName(row) {
  return addAutoBadge(addErrorBadges(row));
}

function showDiff(sec) {
  let unit = 'sec';
  let data = sec;
  if (data > 60) {
    data /= 60;
    unit = 'min';
    if (data > 60) {
      data /= 60;
      unit = 'hour';
      if (data > 24) {
        data /= 24;
        unit = 'day';
        if (data > 30) {
          data /= 30;
          unit = 'month';
        }
      }
    }
  }
  return `${parseInt(data, 10)} ${unit}`.replace(' ', '&nbsp;');
}

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

export {
  showDiff,
  showModal,
  addAutoBadge,
  addErrorBadges,
  formatMessageName,
  makeKibanaLink,
};
