const $ = require('jquery');
const moment = require('moment');
const Utils = require('../utils');

const fetchErrorsAlert = $('#fetchErrors');

function formatErrorDeltaTD(row) {
  if (!row.preHour) {
    return '<td class="warning">N/A</td>';
  }
  const currentPercent = parseInt(row.count / (row.preHour / 100), 10);
  let errorDelta;
  if (currentPercent > 100) {
    errorDelta = `+${currentPercent - 100}`;
  }
  else {
    errorDelta = `-${100 - currentPercent}`;
  }
  let tdClass = '';
  if (currentPercent >= 300) {
    tdClass = 'danger';
  }
  else if (currentPercent < 50) {
    tdClass = 'success';
  }
  return `<td class="${tdClass}">${errorDelta}</td>`;
}

function formatFirstMetTD(row) {
  const firstMet = moment().diff(moment(row.firstMet), 's');
  let tdClass = '';
  const appearDiff = moment().diff(moment(row.firstMet), 'h');
  if (appearDiff < 4) {
    tdClass = 'danger';
  }
  else if (appearDiff < 8) {
    tdClass = 'warning';
  }
  return `<td class="${tdClass}">${Utils.showDiff(firstMet)}</td>`;
}

function formatErrorsOtherEnv(row, showErorrsOtherEnv) {
  if (!showErorrsOtherEnv) {
    return '';
  }
  return `<td>${row.otherEnv || 0}</td>`;
}

function formatLastMetTD(row) {
  /* const lastMet = moment().diff(moment(row.lastMet), 's');
  let tdClass = '';
  const metDiff = moment().diff(moment(row.lastMet), 'm');
  if (metDiff < 5) {
    tdClass = 'danger';
  }
  else if (metDiff < 15) {
    tdClass = 'warning';
  }
  return `<td class="${tdClass}">${Utils.showDiff(lastMet)}</td>`; */
  const lastMet = moment().diff(moment(row.lastMet), 's');
  return `<td>${Utils.showDiff(lastMet)}</td>`;
}

function formatMessageName(row) {
  const tdClass = '';
  /* const veryBadMessages = ['unhandledRejection', 'uncaughtException'].map(m => m.toLowerCase());
  if (veryBadMessages.some(bad => row.msgName.toLowerCase().includes(bad))) {
    tdClass = 'danger';
  } */
  let displayName = row.msgName;
  if (row.errors && row.errors.length) {
    displayName = `${row.msgName} <span class="label label-danger">${row.errors.join(', ')}</span>`;
  }
  return `<td class="${tdClass}">${displayName}</td>`;
}

function formatComment(comment, config) {
  if (!comment || !config.ui.display.jiraUrl) {
    return comment;
  }
  const matches = comment.match(/[A-Z]{2,4}-[0-9]{2,5}/);
  if (matches.length) {
    matches.forEach((m) => {
      comment = comment.replace(m, `<a target="_blank" href="${config.ui.display.jiraUrl}${m}">${m}</a>`);
    });
  }
  return comment;
}

function updateTopErrors(data, fetchErrors, socket, config) {
  if (fetchErrors && fetchErrors.length) {
    fetchErrorsAlert.empty().append(fetchErrors.join('<br>')).show();
  }
  else {
    fetchErrorsAlert.hide();
  }
  const headerFields = ['name', 'msgName', 'Count', 'Age', 'Last met', 'previous interval, %', 'Other env count', 'Comment'];
  const showErorrsOtherEnv = data.some(row => row.otherEnv);
  const tbody = $('<tbody/>');
  data.forEach((row) => {
    const tr = $('<tr/>');
    tr.click(() => {
      const container = $('<div class="progress">' +
        '<div class="progress-bar progress-bar-striped active" role="progressbar" aria-valuenow="45"' +
        ' aria-valuemin="0" aria-valuemax="100" style="width: 45%">' +
        '<span class="sr-only">45% Complete</span>' +
        '</div></div>');
      Utils.showModal(row.msgName, container);
      const errorData = {
        name: 'showLogsByMsgName',
        data: {
          msgName: row.msgName,
          name: row.name,
          env: row.env,
        },
      };
      socket.emit('event', errorData);
    });
    tr.append(`<td>${row.name}</td>`)
      .append(formatMessageName(row))
      .append(`<td>${row.count}</td>`)
      .append(formatFirstMetTD(row))
      .append(formatLastMetTD(row))
      .append(formatErrorDeltaTD(row))
      .append(formatErrorsOtherEnv(row, showErorrsOtherEnv))
      .append(`<td>${formatComment(row.comment, config)}</td>`);
    tbody.append(tr);
  });
  $('#topErrors tbody').replaceWith(tbody);
  if (!showErorrsOtherEnv) {
    headerFields.splice(headerFields.indexOf('Other env count'), 1);
  }
  const thead = $('<thead>').append($('<tr>').append(`<th>${headerFields.join('</th><th>')}</th>`));
  $('#topErrors thead').replaceWith(thead);
}

module.exports = updateTopErrors;
