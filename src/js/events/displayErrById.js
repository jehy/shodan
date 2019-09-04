'use strict';

import * as Highcharts from 'highcharts';
// uncomment to use dark theme:
// const theme = require('highcharts/themes/dark-unica.js');
// theme(Highcharts);

import * as boost from 'highcharts/modules/boost';
import * as moment from 'moment';
import * as Utils from  '../utils';


boost(Highcharts);
Highcharts.setOptions({
  global: {
    useUTC: false,
  },
});

function fillWithZeros(graphData) {
  const timingInterval = 60 * 1000 * 10;// 10 minutes step on graph
  // fill with zeros when there were no errors
  const zeroFilled = graphData.reduce((res, cur, index, arr) => {
    const next = arr[index + 1];
    res.push(cur);
    if (!next) {
      return res;
    }
    let val = cur[0];
    while (val < next[0] - timingInterval) {
      val += timingInterval;
      res.push([val, 0]);
    }
    return res;
  }, []);
  // fill with zeros up to now
  const nowMillis = parseInt(moment().format('x'), 10);
  const fillUpTo = nowMillis - timingInterval * 2;
  let lastTiming = zeroFilled[zeroFilled.length - 1][0];
  while (lastTiming < fillUpTo) {
    lastTiming += timingInterval;
    zeroFilled.push([lastTiming, 0]);
  }
  return zeroFilled;
}
function rowToPoint(row) {
  const eventDate = row.eventDate.padEnd(16, '0');
  return [
    parseInt(moment(eventDate, 'YYYY MM DD HH mm').format('x'), 10),
    row.count,
  ];
}

function addGraph(graph, data) {
  let graphData = data.graph.reduce((res, el)=>{
    if (!res[el.env]) {
      res[el.env] = [];
    }
    const point = rowToPoint(el);
    res[el.env].push(point);
    return res;
  }, {});
  graphData = Object.entries(graphData).reduce((res, [env, item])=>{
    res[env] = fillWithZeros(item);
    return res;
  }, {});
  const series = Object.entries(graphData).reduce((res, [env, zeroFilled])=>{
    return res.concat({
      type: 'area',
      name: env,
      data: zeroFilled,
    });
  }, []);
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
      text: document.ontouchstart === undefined
        ? 'Click and drag in the plot area to zoom in' : 'Pinch the chart to zoom in',
    },
    xAxis: {
      type: 'datetime',
    },
    yAxis: {
      title: {
        text: 'Errors number',
      },
      min: 0,
    },
    legend: {
      enabled: true,
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
    series,
  });
}

function getCommentGroup(data, socket) {

  const commentInput = $('<input type="text" class="form-control" id="comment">');
  if (data.comment) {
    commentInput.val(data.comment.comment);
  }
  const commentGroup = $('<div class="input-group" style="margin-top:20px;margin-bottom: 20px;">');
  commentGroup.append('<span class="input-group-addon">Comment</span>');
  if (data.comment) {
    commentGroup.append(`<span class="input-group-addon">${data.comment.added}</span>`);
    commentGroup.append(`<span class="input-group-addon">${data.comment.author}</span>`);
  }
  commentGroup.append(commentInput);
  const commentBtn = $('<button type="button" class="btn btn-default">Save</button>');

  commentBtn.click(() => {
    const eventData = {
      name: 'updateMessageComment',
      data: {
        errorId: data.errors[0].id,
        comment: $('#comment').val(),
      },
    };
    socket.emit('event', eventData);
  });
  commentGroup.append($('<span class="input-group-btn">').append(commentBtn));
  return commentGroup;
}


function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m)=>map[m]).replace(/\n/g, '<br>').replace(/\\n/g, '<br>').replace(/ /g, '&nbsp;');
}

function formatJSON(message) {
  let i = 0;
  const replacements = [];
  while (i < message.length) {
    if (message[i] !== '{') {
      i++;
      continue;
    }
    let jsonFound = false;
    let n = i;
    while (!jsonFound && n < message.length) {
      n++;
      const closing = message.indexOf('}', n);
      try {
        const found = message.substr(i, (n - i + 1));
        const replace = JSON.stringify(JSON.parse(found), null, 3);
        replacements.push({from: found, to: replace});
        jsonFound = true;
        i = closing + 1;
      } catch (err) {
        // no need
      }
    }
    if (!jsonFound) {
      i++;
    }
  }
  replacements.forEach((replacement)=>{
    message = message.replace(replacement.from, `\n${replacement.to}`);
  });
  return message;
}

function cutFormat(message, err) {
  if (err.messageLength > message.length && message.endsWith('... CUT')) {
    return `${message} (${Math.floor(err.messageLength / 1024)} KB)`;
  }
  return message;
}

function formatErrorMessage(message, err) {
  const cutFormatted = cutFormat(message, err);
  const formated = formatJSON(cutFormatted);
  const escaped = escapeHtml(formated);
  return escaped;
}


function displayErrById(data, socket, config) {

  const graph = $('<div/>');
  addGraph(graph, data);
  // //
  // eventDate, name,type,msgId,env,host,role,message
  const notNeededFields = ['message', 'name', 'msgName', 'index', 'type'];
  const needFields = Object.keys(data.errors[0])
    .filter((key) => !notNeededFields.includes(key));
  const header = data.msgName;
  const thead = $('<thead>');
  const headerTds = needFields.map((key) => `<th>${key}</th>`);
  thead.append(headerTds);
  const table = $('<table class="table"/>');
  table.append(thead);
  const tbody = $('<tbody>');
  let needStripe = true;
  data.errors.forEach((err) => {
    needStripe = !needStripe;
    let trStyle = '';
    if (needStripe) {
      trStyle = ' style="background-color: #f0f0f0;"';
    }
    err.eventDate = moment(err.eventDate).format('HH:mm:ss');
    const meta = needFields.map((key) => `<td>${err[key]}</td>`).join('');
    const errMessage = formatErrorMessage(err.message, err);
    const message = $(`<td colspan=${needFields.length} class="err-msg">`).html(errMessage);
    // tr.append(Object.values(err).map((val => `<td>${val}</td>`)).join(''));
    tbody.append(`<tr${trStyle}>${meta}</tr>`);
    tbody.append($(`<tr${trStyle}>`).append(message));
  });
  table.append(tbody);


  const commentGroup = getCommentGroup(data, socket);
  const container = $('<div/>');
  const msgName = Utils.formatMessageName(data.errors[0]);
  const {index, name} = data.errors[0];
  const kibanaLink = Utils.makeKibanaLink(index, name, msgName, config.updater.kibana.url);
  container.append(`
            <table class="table">
            <thead><th>name</th><th>msgName</th><th>index</th></thead>
            <tbody><tr><td><a href="${kibanaLink}">${name}</a></td>
            <td><a href="${kibanaLink}">${msgName}</a></td>
            <td>${index}</td>
            </tr></tbody>
            </table>`);
  container.append(graph);
  container.append(commentGroup);
  container.append(table);
  Utils.showModal(header, container);
}

export default displayErrById;
