'use strict';

const socket = require('socket.io-client')('http://192.168.16.195:3000');
const $ = require('jquery');
const moment = require('moment');
const Highcharts = require('highcharts');
require('highcharts/modules/exporting')(Highcharts);


let timeoutId = null;

function showModal(header, data) {
  $('#modal .modal-title').empty().append(header);
  $('#modal .modal-body').empty().append(data);
  // $('.highcharts-container').width($('#modal').width());
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
  // showTopErrors();
  // $('#topErrors-show').click(() => showTopErrors());
  $('#topErrors-env').change(() => showTopErrors());
  $('#topErrors-period').change(() => showTopErrors());
  $('#reload-interval').change(() => reloader());
});

socket.on('event', (event) => {
  $('.progress').hide();
  console.log(`received event ${event.name}`);
  // console.log(JSON.stringify(event, null, 3));

  if (event.name === 'updateTopErrors') {
    const tbody = $('<tbody/>');
    event.data.forEach((row) => {
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
        .append(`<td>${row.count}</td><td>${showDiff(firstMet)}</td><td>${showDiff(lastMet)}</td>`)
        .append(tdDelta);
      tbody.append(tr);
    });
    $('#topErrors tbody').replaceWith(tbody);
  }
  else if (event.name === 'displayErrByMessage') {
    const graph = $('<div/>');
    // //////
    // console.log('graph');
    // console.log(event.data.graph);
    const data = event.data.graph
      .map((item) => {
        if (item.eventDate.length < 16) {
          item.eventDate = `${item.eventDate}0`;
        }
        return [parseInt(moment.utc(item.eventDate, 'YYYY MM DD HH mm')
          .format('x'), 10), item.count];
      });
    // console.log('data');
    // console.log(data);
    const zeroFilled = data.reduce((res, cur, index, arr) => {
      const next = arr[index + 1];
      res.push(cur);
      if (!next) {
        return res;
      }
      let val = cur[0];
      while (val < next[0] - 600000) {
        val += 600000;
        res.push([val, 0]);
      }
      return res;
    }, []);
    // console.log('zeroFilled');
    // console.log(zeroFilled);
    Highcharts.chart({
      chart: {
        type: 'area',
        zoomType: 'x',
        renderTo: graph[0],
        events: {
          load: (chart) => {
            setTimeout(() => chart.target.reflow());
          },
        },
      },
      title: {
        text: 'Errors for last day',
      },
      subtitle: {
        // eslint-disable-next-line no-undef
        text: document.ontouchstart === undefined ?
          'Click and drag in the plot area to zoom in' : 'Pinch the chart to zoom in',
      },
      xAxis: {
        type: 'datetime',
      },
      yAxis: {
        title: {
          text: 'Errors number',
        },
      },
      legend: {
        enabled: false,
      },
      plotOptions: {
        area: {
          fillColor: {
            linearGradient: {
              x1: 0,
              y1: 0,
              x2: 0,
              y2: 1,
            },
            stops: [
              [0, Highcharts.getOptions().colors[0]],
              [1, Highcharts.Color(Highcharts.getOptions().colors[0]).setOpacity(0).get('rgba')],
            ],
          },
          marker: {
            radius: 2,
          },
          lineWidth: 1,
          states: {
            hover: {
              lineWidth: 1,
            },
          },
          threshold: null,
        },
      },

      series: [{
        type: 'area',
        name: 'Errors',
        data: zeroFilled,
      }],
    });


    // //
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
    const container = $('<div/>');
    container.append(graph);
    container.append(table);
    showModal(header, container);
  }
  else {
    console.log(`unknown event ${event.name}`);
  }
});
socket.on('disconnect', () => {
  console.log('client disconnected');
});
