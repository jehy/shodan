const $ = require('jquery');
const moment = require('moment');
const Utils = require('../utils');


function formatErrorDeltaTD(row) {
  let errorDelta = row.count - row.preHour;
  if (errorDelta > 0) {
    errorDelta = `+${errorDelta}`;
  }
  let errorDivide = 3;
  if (row.preHour) {
    errorDivide = row.count / row.preHour;
  }
  let tdClass = '';
  if (errorDivide >= 2) {
    tdClass = 'danger';
  }
  else if (errorDivide < 0.5) {
    tdClass = 'success';
  }
  return `<td class="${tdClass}">${errorDelta}</td>`;
}

function formatFirstMetTD(row) {
  const firstMet = moment().diff(moment(row.firstMet), 's');
  let tdClass = '';
  const appearDiff = moment().diff(moment(row.firstMet), 'h');
  if (appearDiff < 2) {
    tdClass = 'danger';
  }
  else if (appearDiff < 4) {
    tdClass = 'warning';
  }
  return `<td class="${tdClass}">${Utils.showDiff(firstMet)}</td>`;
}


function formatLastMetTD(row) {
  const lastMet = moment().diff(moment(row.lastMet), 's');
  let tdClass = '';
  const metDiff = moment().diff(moment(row.lastMet), 'm');
  if (metDiff < 5) {
    tdClass = 'danger';
  }
  else if (metDiff < 15) {
    tdClass = 'warning';
  }
  return `<td class="${tdClass}">${Utils.showDiff(lastMet)}</td>`;
}

function updateTopErrors(data, socket) {
  const tbody = $('<tbody/>');
  data.forEach((row) => {
    const tr = $('<tr/>');
    tr.click(() => {
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
    tr.append(`<td>${row.name}</td><td>${row.msgName}</td>`)
      .append(`<td>${row.count}</td>`)
      .append(formatFirstMetTD(row))
      .append(formatLastMetTD(row))
      .append(formatErrorDeltaTD(row));
    tbody.append(tr);
  });
  $('#topErrors tbody').replaceWith(tbody);
}

module.exports = updateTopErrors;
