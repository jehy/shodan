'use strict';

const socket = require('socket.io-client')('http://localhost:3000');
const $ = require('jquery');
const moment = require('moment');

function showModal(header, data) {
  $('#modal .modal-title').html(header);
  $('#modal .modal-body').html(data);
  $('#modal').modal();
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
      }
    }
  }
  return `${parseInt(data, 10)} ${unit}`;
}

function showTopErrors() {
  const env = $('#topErrors-env').val();
  const period = $('#topErrors-period').val();
  socket.emit('event', {name: 'showTopErrors', data: {env, period}});
}

function reloader() {
  const interval = parseInt($('#reload-interval').val(), 10);
  if (interval) {
    showTopErrors();
    setTimeout(reloader, interval * 1000);
  }
}

reloader();

socket.on('connect', () => {
  console.log('client connected');
  // showTopErrors();
  // $('#topErrors-show').click(() => showTopErrors());
  $('#topErrors-env').change(() => showTopErrors());
});

socket.on('event', (event) => {
  console.log(`received event ${event.name}`);
  // console.log(JSON.stringify(event, null, 3));

  if (event.name === 'updateTopErrors') {
    const tbody = $('<tbody/>');
    event.data.forEach((row) => {
      const tr = $('<tr/>');
      tr.click(() => {
        socket.emit('event', {name: 'showLogsByMsgName', data: {msgName: row.msgName}});
      });
      const firstMet = moment().diff(moment(row.firstMet), 's');
      const lastMet = moment().diff(moment(row.lastMet), 's');
      let errorDelta = row.count - row.preHour;
      if (errorDelta > 0) {
        errorDelta = `+${errorDelta}`;
      }
      let errorDivide = 2;
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
        .append(`<td>${row.count}</td><td>${showDiff(firstMet)}</td><td>${showDiff(lastMet)}</td>`)
        .append(tdDelta);
      tbody.append(tr);
    });
    $('#topErrors tbody').replaceWith(tbody);
  }
  else if (event.name === 'displayErrByMessage') {
    // eventDate, name,type,msgId,env,host,role,message
    const needFilelds = Object.keys(event.data.errors[0]).filter(key => key !== 'message');
    const header = event.data.msgName;
    const thead = $('<thead>');
    const headerTds = needFilelds.map(key => `<th>${key}</th>`);
    thead.append(headerTds);
    const table = $('<table class="table table-striped"/>');
    table.append(thead);
    const tbody = $('<tbody>');
    event.data.errors.forEach((err) => {
      err.eventDate = moment(err.eventDate).format('HH:mm:ss');
      const meta = needFilelds.map(key => `<td>${err[key]}</td>`).join('');
      const message = `<td colspan=${needFilelds.length}>${err.message}</td>`;
      // tr.append(Object.values(err).map((val => `<td>${val}</td>`)).join(''));
      tbody.append(`<tr>${meta}</tr>`);
      tbody.append(`<tr>${message}</tr>`);
    });
    table.append(tbody);
    showModal(header, table);
  }
  else {
    console.log(`unknown event ${event.name}`);
  }
});
socket.on('disconnect', () => {
  console.log('client disconnected');
});
