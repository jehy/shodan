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
          setTimeout(() => chart.target.reflow(), 1000);
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

function showTimeLineData(data, container)
{
  const notNeededFields = ['message', 'name', 'index', 'type', 'guid', 'msgId', 'id'];
  const needFields = Object.keys(data[0])
    .filter(key => !notNeededFields.includes(key));
  const thead = $('<thead>');
  const headerTds = needFields.map(key => `<th>${key}</th>`);
  thead.append(headerTds);
  let needStripe = true;
  data.forEach((log, index) => {
    const graph = $('<div/>');
    addGraph(graph, log.message);
    const table = $('<table class="table"/>');
    if (index === 0)
    {
      table.append(thead);
    }
    const tbody = $('<tbody>');
    needStripe = !needStripe;
    let trStyle = '';
    if (needStripe) {
      trStyle = ' style="background-color: #f0f0f0;"';
    }
    log.eventDate = moment(log.eventDate).format('HH:mm:ss');
    const meta = needFields.map(key => `<td>${log[key]}</td>`).join('');
    const logMessage = $('<div style="display: none"/>')
      .html(`<pre>${JSON.stringify(log.message, null, 3)}</pre>`);
    tbody.append(`<tr${trStyle}>${meta}</tr>`);
    table.append(tbody);
    const showBtn = $('<button type="button" class="btn btn-default">Show data</button>');
    showBtn.click(()=>{
      logMessage.toggle();
    });
    container.append(table).append(graph).append(showBtn).append(logMessage);
  });
}

function showSpeed(data) {

  if (!data) {
    fetchErrorsAlert.empty().append('No logs for slow searches, please come back later').show();
    return;
  }
  const container = $('<div/>');
  container.append('<h1>Pipeline data</h1>');
  showTimeLineData(data.pipelineData, container);
  container.append('<h1>Total time data</h1>');
  showTimeLineData(data.totalData, container);
  // //
  // eventDate, name,type,msgId,env,host,role,message

  Utils.showModal('Search speed', container);
}

module.exports = showSpeed;
