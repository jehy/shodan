const $ = require('jquery');
const moment = require('moment');
const Utils = require('../utils');

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
    const firstMet = moment().diff(moment(row.firstMet), 's');
    const lastMet = moment().diff(moment(row.lastMet), 's');
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
    const tdDelta = `<td class="${tdClass}">${errorDelta}</td>`;
    tr.append(`<td>${row.name}</td><td>${row.msgName}</td>`)
      .append(`<td>${row.count}</td><td>${Utils.showDiff(firstMet)}</td><td>${Utils.showDiff(lastMet)}</td>`)
      .append(tdDelta);
    tbody.append(tr);
  });
  $('#topErrors tbody').replaceWith(tbody);
}

module.exports = updateTopErrors;
