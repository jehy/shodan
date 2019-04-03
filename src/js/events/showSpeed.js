'use strict';

const moment = require('moment');
const Highcharts = require('highcharts');
const boost = require('highcharts/modules/boost');
const HighchartsMore = require('highcharts/highcharts-more');
const dataModule = require('highcharts/modules/data');

const Utils = require('../utils');

boost(Highcharts);
dataModule(Highcharts);
HighchartsMore(Highcharts);

// uncomment to use dark theme:
// const theme = require('highcharts/themes/dark-unica.js');
// theme(Highcharts);


const fetchErrorsAlert = $('#fetchErrors');

function addGraph(graph, data)
{
  let maxTiming = 0;
  let minTiming = null;
  const simple = data.timings.reduce((res, timing) => {
    if (!timing.name)
    {
      return res;
    }
    if (timing.name.includes(' END '))
    {
      return res;
    }
    const name = timing.name.replace(' END', '').replace(' START', '').trim();
    const start = timing.time;
    if (minTiming === null || minTiming > start)
    {
      minTiming = start;
    }
    const endTiming = data.timings
      .find(timingSearch=>timingSearch.name
        && timingSearch.name.includes(' END')
        && timingSearch.name.replace(' END', ' START') === timing.name);
    let end;
    if (endTiming)
    {
      end = endTiming.time;
      if (maxTiming < end)
      {
        maxTiming = end;
      }
    }
    const obj = {name, start, end};
    res.push(obj);
    return res;
  }, []);
  simple.forEach((el)=>{
    if (!el.end)
    {
      el.end = maxTiming;
    }
    el.start -= minTiming;
    el.start /= 1000;
    el.end -= minTiming;
    el.end /= 1000;
  });
  const dataColumns = simple.map(data2 => data2.name);
  const valueColumns = simple.map(data2 => ([data2.start, data2.end]));
  const options = {
    chart: {
      type: 'columnrange',
      inverted: true,
      zoomType: 'x',
      renderTo: graph[0],
      events: {
        load: (chart) => {
          setTimeout(() => chart.target.reflow());
        },
      },
    },
    title: {
      text: 'search speed',
    },
    subtitle: {
      // eslint-disable-next-line no-undef
      text: document.ontouchstart === undefined
        ? 'Click and drag in the plot area to zoom in' : 'Pinch the chart to zoom in',
    },
    xAxis: {
      categories: dataColumns,
    },
    yAxis: {
      title: {
        text: 'timing',
      },
    },
    legend: {
      enabled: false,
    },
    series: [{
      name: 'Timing',
      data: valueColumns,
    }],
  };
  Highcharts.chart(options);
}


function showSpeed(data) {

  if (!data || !data.length) {
    fetchErrorsAlert.empty().append('No logs for slow searches, please come back later').show();
    return;
  }
  // //
  // eventDate, name,type,msgId,env,host,role,message
  const notNeededFields = ['message', 'name', 'index', 'type', 'guid', 'msgId'];
  const needFields = Object.keys(data[0])
    .filter(key => !notNeededFields.includes(key));
  const header = data.msgName;
  const thead = $('<thead>');
  const headerTds = needFields.map(key => `<th>${key}</th>`);
  thead.append(headerTds);
  const table = $('<table class="table"/>');
  table.append(thead);
  const tbody = $('<tbody>');
  let needStripe = true;
  data.forEach((log) => {
    const graph = $('<div/>');
    addGraph(graph, log.message);
    needStripe = !needStripe;
    let trStyle = '';
    if (needStripe) {
      trStyle = ' style="background-color: #f0f0f0;"';
    }
    log.eventDate = moment(log.eventDate).format('HH:mm:ss');
    const meta = needFields.map(key => `<td>${log[key]}</td>`).join('');
    const errMessage = JSON.stringify(log.message, null, 3);
    // tr.append(Object.values(err).map((val => `<td>${val}</td>`)).join(''));
    tbody.append(`<tr${trStyle}>${meta}</tr>`);
    const tdGraph = $(`<td colspan="${needFields.length}"></td>`).append(graph);
    const showBtn = $('<button type="button" class="btn btn-default">Show data</button>');
    const btnTd = $(`<td colspan="${needFields.length}"></td>`).append(showBtn);
    const btnTr = $('<tr/>').append(btnTd);
    tbody.append($('<tr/>').append(tdGraph));
    tbody.append(btnTr);
    const message = $(`<td colspan="${needFields.length}" class="err-msg" style="display: none">`).html(`<pre>${errMessage}</pre>`);
    tbody.append($(`<tr${trStyle}>`).append(message));
    showBtn.click(()=>{
      message.toggle();
    });
  });
  table.append(tbody);


  const container = $('<div/>');
  container.append(table);
  Utils.showModal(header, container);
}

module.exports = showSpeed;
