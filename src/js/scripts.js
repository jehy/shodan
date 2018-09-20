'use strict';

const socket = require('socket.io-client')();
const uuid = require('nanoid');
const events = require('./events');

let timeoutId = null;
const progressBar = $('#progressMain');
const indexSelector = $('#topErrors-index');
let needUpdateId = null;

const config = {
  ui: {
    display: {
      jiraUrl: '',
    },
  },
};

$('#topErrors').on('keyup keypress', (e) => {
  const keyCode = e.keyCode || e.which;
  if (keyCode === 13) {
    e.preventDefault();
    return false;
  }
  return true;
});

function reloader() {
  const interval = parseInt($('#reload-interval').val(), 10);
  if (interval) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    progressBar.show();
    const env = $('#topErrors-env').val();
    const period = $('#topErrors-period').val();
    const role = $('#topErrors-role').val();
    const pid = $('#topErrors-pid').val();
    const index = indexSelector.val();
    needUpdateId = uuid();
    socket.emit('event', {name: 'showTopErrors', data: {env, period, role, pid, index}, id: needUpdateId});
    timeoutId = setTimeout(reloader, interval * 1000);
  }
}


progressBar.show(); // show it while connecting for the first time


let starting = true;
socket.on('connect', () => {
  console.log('client connected');
  if (starting) {
    const hash = window.location.hash.substr(1);
    console.log(`hash: ${hash}`);
    const params = new URLSearchParams(hash);
    let data = params.get('data');
    if (data) {
      data = JSON.parse(decodeURIComponent(data));
    }
    if (params.get('action') === 'event') {
      socket.emit('event', data);
    }
  }
  starting = false;

  socket.sendBuffer = [];
  // $('#topErrors-show').click(() => showTopErrors());
  $('#topErrors-role').change(() => reloader());
  $('#topErrors-env').change(() => reloader());
  $('#topErrors-period').change(() => reloader());
  $('#topErrors-pid').change(() => reloader());
  $('#reload-interval').change(() => reloader());
});

socket.on('event', (event) => {
  console.log(`received event ${event.name}`);
  if (event.name === 'updateConfig') {
    Object.assign(config, event.data.config);
    console.log(`Received new config: ${JSON.stringify(config)}`);
    indexSelector.children().remove();
    config.updater.indexes.forEach((index)=>{
      indexSelector.append(`<option value="${index}">${index}</option>`);
    });
    indexSelector.change(() => reloader());
    reloader();
  }
  else if (events[event.name]) {
    if (event.name === 'updateTopErrors')
    {
      if (event.id !== needUpdateId)
      {
        console.log(`This update is already not needed(${event.id} while waiting for ${needUpdateId}), skipping`);
        return;
      }
    }
    progressBar.hide();
    events[event.name](event.data, event.fetchErrors, socket, config);
  }
  else {
    console.log(`unknown event ${event.name}`);
  }
});
socket.on('disconnect', () => {
  console.log('client disconnected');
});
