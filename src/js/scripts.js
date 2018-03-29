'use strict';

const socket = require('socket.io-client')();
const $ = require('jquery');
const events = require('./events');

let timeoutId = null;


function showTopErrors() {
  const env = $('#topErrors-env').val();
  const period = $('#topErrors-period').val();
  socket.emit('event', {name: 'showTopErrors', data: {env, period}});
  $('.progress').show();
}

function reloader() {
  const interval = parseInt($('#reload-interval').val(), 10);
  if (interval) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    $('.progress').show();
    showTopErrors();
    timeoutId = setTimeout(reloader, interval * 1000);
  }
}

reloader();

socket.on('connect', () => {
  console.log('client connected');
  socket.sendBuffer = [];
  showTopErrors();
  // $('#topErrors-show').click(() => showTopErrors());
  $('#topErrors-env').change(() => showTopErrors());
  $('#topErrors-period').change(() => showTopErrors());
  $('#reload-interval').change(() => reloader());
});

socket.on('event', (event) => {
  $('.progress').hide();
  console.log(`received event ${event.name}`);
  if (events[event.name]) {
    events[event.name](event.data, socket);
  }
  else {
    console.log(`unknown event ${event.name}`);
  }
});
socket.on('disconnect', () => {
  console.log('client disconnected');
});
