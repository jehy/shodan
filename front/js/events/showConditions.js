'use strict';

import * as Highcharts from 'highcharts';
import * as boost from 'highcharts/modules/boost';
import * as HighchartsMore from 'highcharts/highcharts-more';
import * as dataModule from 'highcharts/modules/data';
import * as sunburst from 'highcharts/modules/sunburst';
import * as Utils from '../utils';

boost(Highcharts);
dataModule(Highcharts);
HighchartsMore(Highcharts);
sunburst(Highcharts);

// uncomment to use dark theme:
// const theme = require('highcharts/themes/dark-unica.js');
// theme(Highcharts);


const fetchErrorsAlert = $('#fetchErrors');

function addConditionsGraph(graph, data) {
  // Highcharts.getOptions().colors.splice(0, 0, 'transparent');


  Highcharts.chart({

    chart: {
      renderTo: graph[0],
      height: '80%',
    },
    title: {
      text: 'Conditions timings',
    },
    subtitle: {
      text: 'Conditions timings',
    },
    series: [{
      type: 'sunburst',
      data,
      allowDrillToNode: true,
      cursor: 'pointer',
      dataLabels: {
        format: '{point.name}',
        filter: {
          property: 'innerArcLength',
          operator: '>',
          value: 16,
        },
      },
      levels: [{
        level: 1,
        levelIsConstant: false,
        dataLabels: {
          filter: {
            property: 'outerArcLength',
            operator: '>',
            value: 64,
          },
        },
      }, {
        level: 2,
        colorByPoint: true,
      },
      {
        level: 3,
        colorVariation: {
          key: 'brightness',
          to: -0.5,
        },
      }, {
        level: 4,
        colorVariation: {
          key: 'brightness',
          to: 0.5,
        },
      }],

    }],
    tooltip: {
      headerFormat: '',
      pointFormat: 'Time spent for <b>{point.name}</b> is <b>{point.value}</b>',
    },
  });
}

function showConditionsTimings(data, container) {
  let graphData = [{
    id: '0.0',
    parent: '',
    name: 'Conditions Timings',
  }];
  const dataWithHashes = data.map((el)=>{
    const hash = `${data.host}${data.pid}`;
    return {...el, hash};
  });
  const dataFilterred = dataWithHashes.filter((el, index)=>{
    const found = dataWithHashes.findIndex((el2)=>el2.hash === el.hash);
    return found !== index;
  });
  const hosts = dataFilterred.map((row)=>row.host).filter((el, index, arr)=>arr.indexOf(el) === index);
  hosts.forEach((host)=>{
    graphData.push({
      id: host,
      parent: '0.0',
      name: host,
    });
  });
  dataFilterred.forEach((row)=>{
    const id = `${row.host}${row.pid}`;
    const pidExists = graphData.find((el)=>el.id === id);
    if (!pidExists) {
      graphData.push({
        id,
        parent: row.host,
        name: row.pid,
      });
    }
    const actionsData = Object.entries(row.message.actions).map(([name, content])=>{
      return {
        id: `action_${id}${name}`,
        parent: id,
        name: `action_${name} (${content.count})`,
        value: content.time,
      };
    });
    const filtersData = Object.entries(row.message.filters).map(([name, content])=>{
      return {
        id: `filter_${id}${name}`,
        parent: id,
        name: `filter_${name} (${content.count})`,
        value: content.time,
      };
    });
    graphData = graphData.concat(actionsData).concat(filtersData);
  });
  const graph = $('<div/>');
  addConditionsGraph(graph, graphData);

  const logMessage = $('<div style="display: none"/>')
    .html(`<pre>${JSON.stringify(data, null, 3)}</pre>`);
  const showBtn = $('<button type="button" class="btn btn-default">Show data</button>');
  showBtn.click(()=>{
    logMessage.toggle();
  });
  container.append(graph).append(showBtn).append(logMessage);
}

function showConditions(data) {

  if (!data) {
    fetchErrorsAlert.empty().append('No logs for slow searches, please come back later').show();
    return;
  }
  const container = $('<div/>');
  container.append('<h1>Conditions Timings</h1>');
  showConditionsTimings(data.conditionsTimings, container);
  Utils.showModal('Search conditions speed', container);
}

export default showConditions;
