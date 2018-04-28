const $ = require('jquery');
const moment = require('moment');
const Highcharts = require('highcharts');
const Utils = require('../utils');
require('highcharts/modules/exporting')(Highcharts);

function displayErrByMessage(data, fetchErrors, socket) {

  const graph = $('<div/>');
  // //////
  // console.log('graph');
  // console.log(event.data.graph);
  const graphData = data.graph
    .map((item) => {
      if (item.eventDate.length < 16) {
        item.eventDate = `${item.eventDate}0`;
      }
      return [parseInt(moment.utc(item.eventDate, 'YYYY MM DD HH mm')
        .format('x'), 10), item.count];
    });
  // console.log('data');
  // console.log(data);
  const zeroFilled = graphData.reduce((res, cur, index, arr) => {
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
  const needFilelds = Object.keys(data.errors[0]).filter(key => key !== 'message');
  const header = data.msgName;
  const thead = $('<thead>');
  const headerTds = needFilelds.map(key => `<th>${key}</th>`);
  thead.append(headerTds);
  const table = $('<table class="table table-striped"/>');
  table.append(thead);
  const tbody = $('<tbody>');
  data.errors.forEach((err) => {
    err.eventDate = moment(err.eventDate).format('HH:mm:ss');
    const meta = needFilelds.map(key => `<td>${err[key]}</td>`).join('');
    const message = $(`<td colspan=${needFilelds.length}>`).text(err.message);
    // tr.append(Object.values(err).map((val => `<td>${val}</td>`)).join(''));
    tbody.append(`<tr>${meta}</tr>`);
    tbody.append($('<tr>').append(message));
  });
  table.append(tbody);
  const container = $('<div/>');
  container.append(graph);
  container.append(table);
  Utils.showModal(header, container);
}

module.exports = displayErrByMessage;
