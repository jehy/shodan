const socket = require('socket.io-client')('http://localhost:3000');
const $ = require('jquery');
const moment = require('moment');

function showModal(header, data) {
  $('#modal .modal-title').html(header);
  $('#modal .modal-body').html(data);
  $('#modal').modal();
}

socket.on('connect', function () {
  console.log('client connected');
});
socket.on('event', function (event) {
  console.log(`received event ${event.name}`);
  console.log(JSON.stringify(event, null, 3));

  if (event.name === 'updateTopErrors') {
    const tbody = $('<tbody/>');
    event.data.forEach((row) => {
      const tr = $('<tr/>');
      tr.click(() => {
        socket.emit('event', {name: 'showLogsByMsgName', data: {msgName: row.msgName}});
      });
      let diff = moment().diff(moment(row.firstMet), 'h');
      if (diff > 24) {
        diff = `${diff} d`;
      }
      else {
        diff = `${diff} h`;
      }
      tr.append(`<td>${row.msgName}</td><td>${row.count}</td><td>${diff}</td>`);
      tbody.append(tr);
    });
    $('#topErrors tbody').replaceWith(tbody);
  }
  else if (event.name === 'displayErrByMessage') {
    //eventDate, name,type,msgId,env,host,role,message
    const needFilelds = Object.keys(event.data.errors[0]).filter((key) => key !== 'message')
    const header = event.data.msgName;
    const thead = $('<thead>');
    const headerTds = needFilelds.map((key) => `<th>${key}</th>`);
    thead.append(headerTds);
    const table = $('<table class="table table-striped"/>');
    table.append(thead);
    const tbody = $('<tbody>');
    event.data.errors.forEach((err) => {
      const meta = needFilelds.map((key) => `<td>${err[key]}</td>`).join('');
      const message = `<td colspan=${needFilelds.length}>${err.message}</td>`;
      //tr.append(Object.values(err).map((val => `<td>${val}</td>`)).join(''));
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
socket.on('disconnect', function () {
  console.log('client disconnected');
});
