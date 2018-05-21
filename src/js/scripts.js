'use strict';

const socket = require('socket.io-client')();
const $ = require('jquery');
const events = require('./events');

let timeoutId = null;
const progressBar = $('.progress');

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
    socket.emit('event', {name: 'showTopErrors', data: {env, period}});
    timeoutId = setTimeout(reloader, interval * 1000);
  }
}


socket.on('connect', () => {
  console.log('client connected');
  socket.sendBuffer = [];
  // $('#topErrors-show').click(() => showTopErrors());
  $('#topErrors-env').change(() => reloader());
  $('#topErrors-period').change(() => reloader());
  $('#reload-interval').change(() => reloader());
  reloader();
});

socket.on('event', (event) => {
  $('.progress').hide();
  console.log(`received event ${event.name}`);
  if (events[event.name]) {
    events[event.name](event.data, event.fetchErrors, socket);
  }
  else {
    console.log(`unknown event ${event.name}`);
  }
});
socket.on('disconnect', () => {
  console.log('client disconnected');
});
