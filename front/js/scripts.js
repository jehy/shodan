'use strict';

import * as Socket from 'socket.io-client';
import * as uuid from 'nanoid';
import * as Promise from 'bluebird';
import * as events from './events';

const socket = Socket();
const progressBar = $('#progressMain');
const indexSelector = $('#topErrors-index');
const reloadInterval = $('#reload-interval');
const topErrorsEnv = $('#topErrors-env');
const topErrorsPeriod = $('#topErrors-period');
const topErrorsRole = $('#topErrors-role');
const topErrorsPid = $('#topErrors-pid');
const fetchErrorsAlert = $('#fetchErrors');
const showHang = $('#topErrors-showHang');
const showSpeed = $('#showSpeed');
const showConditions = $('#showConditions');

const progressBarClasses = {
  warn: 'progress-bar-warning',
  info: 'progress-bar-info',
  danger: 'progress-bar-danger',
};

let needUpdateId = null;
let timeForUpdate = 0;
let canUpdate = true;

const config = {
  ui: {
    display: {
      jiraUrl: '',
    },
  },
};

// prevent submitting form
$('#topErrors').on('keyup keypress', (e) => {
  const keyCode = e.keyCode || e.which;
  if (keyCode === 13) {
    e.preventDefault();
    return false;
  }
  return true;
});

showHang.on('click', () => {
  const data = {
    name: 'showHanged',
    data: {
    },
  };
  socket.emit('event', data);
});


showSpeed.on('click', () => {
  const data = {
    name: 'showSpeed',
    data: {
    },
  };
  socket.emit('event', data);
});

showConditions.on('click', () => {
  const data = {
    name: 'showConditions',
    data: {
    },
  };
  socket.emit('event', data);
});

function reload() {
  canUpdate = false;
  progressBar.show();
  const env = topErrorsEnv.val();
  const period = topErrorsPeriod.val();
  const role = topErrorsRole.val();
  const pid = topErrorsPid.val();
  const index = indexSelector.val();
  const myId = uuid();
  needUpdateId = myId;
  console.log(`Adding event ${myId} to reload events`);
  socket.emit('event', {name: 'showTopErrors', data: {env, period, role, pid, index}, id: needUpdateId});
  let iteration = 0;
  const progressSpan = progressBar.find('span');
  const progressDiv = progressBar.find('div');
  function iterate() {
    console.log(`checking ${myId} for finish`);
    if (needUpdateId !== myId) {
      console.log(`${myId} is not main, exiting`);
      return false;
    }
    if (canUpdate) {
      console.log(`${myId} seems to finish, exiting`);
      return false;
    }
    progressSpan.text(`${iteration} seconds`);
    if (iteration > 20) {
      progressDiv.removeClass(progressBarClasses.warn);
      progressDiv.removeClass(progressBarClasses.info);
      progressDiv.addClass(progressBarClasses.danger);
    } else if (iteration > 10) {
      progressDiv.removeClass(progressBarClasses.info);
      progressDiv.removeClass(progressBarClasses.danger);
      progressDiv.addClass(progressBarClasses.warn);
    } else {
      progressDiv.removeClass(progressBarClasses.warn);
      progressDiv.removeClass(progressBarClasses.danger);
      progressDiv.addClass(progressBarClasses.info);
    }
    iteration++;

    // eslint-disable-next-line no-await-in-loop
    return Promise.delay(1000).then(()=>iterate());
  }
  return iterate();
}

function runReloader() {
  function waitCanUpdate() {
    if (canUpdate) {
      return Promise.resolve(true);
    }
    return Promise.delay(3000).then(()=>waitCanUpdate());
  }

  return waitCanUpdate().timeout(80 * 1000)
    .catch(()=>{
      console.log('Timeout while waiting for updating, requesting again');
    })
    .then(()=>{
      const now = Math.round((new Date()).getTime() / 1000);
      if (now > timeForUpdate) {
        const interval = parseInt(reloadInterval.val(), 10);
        timeForUpdate = now + interval;
        return reload();
      }
      // eslint-disable-next-line no-await-in-loop
      console.log('running delay');
      return Promise.delay(3000);
    })
    .then(()=>runReloader())
    .catch(()=>runReloader());
}

runReloader();

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

  socket.sendBuffer = []; // clean up biffer on connection
  // $('#topErrors-show').click(() => showTopErrors());
  $('#topErrors-role').change(() => reload());
  $('#topErrors-env').change(() => reload());
  $('#topErrors-period').change(() => reload());
  $('#topErrors-pid').change(() => reload());
  $('#reload-interval').change(() => reload());
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
    indexSelector.change(() => reload());
    reload();
    return;
  }

  if (event.fetchErrors && event.fetchErrors.length) {
    fetchErrorsAlert.empty().append(event.fetchErrors.join('<br>')).show();
  } else {
    fetchErrorsAlert.hide();
  }

  if (events[event.name]) {
    if (event.name === 'updateTopErrors') {
      console.log(`${event.id} finished`);
      if (event.id !== needUpdateId) {
        console.log(`This update is already not needed(${event.id} while waiting for ${needUpdateId}), skipping`);
        return;
      }
      progressBar.hide();
      canUpdate = true;
    }
    events[event.name](event.data, socket, config);
    return;
  }
  console.log(`unknown event ${event.name}`);
});

socket.on('disconnect', () => {
  console.log('client disconnected');
});
