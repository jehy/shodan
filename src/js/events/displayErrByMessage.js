'use strict';

import Highcharts from 'highcharts';
import boost from 'highcharts/modules/boost';
import moment from 'moment';
import Utils from '../utils';

boost(Highcharts);

function displayErrByMessage(data, fetchErrors, socket) {

  const graph = $('<div/>');
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
  const needFields = Object.keys(data.errors[0]).filter(key => key !== 'message');
  const header = data.msgName;
  const thead = $('<thead>');
  const headerTds = needFields.map(key => `<th>${key}</th>`);
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
    const meta = needFields.map(key => `<td>${err[key]}</td>`).join('');
    const message = $(`<td colspan=${needFields.length} class="err-msg">`).text(err.message);
    // tr.append(Object.values(err).map((val => `<td>${val}</td>`)).join(''));
    tbody.append(`<tr${trStyle}>${meta}</tr>`);
    tbody.append($(`<tr${trStyle}>`).append(message));
  });
  table.append(tbody);
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
        msgName: data.msgName,
        name: data.name,
        comment: $('#comment').val(),
      },
    };
    socket.emit('event', eventData);
  });
  commentGroup.append($('<span class="input-group-btn">').append(commentBtn));
  const container = $('<div/>');
  container.append(graph);
  container.append(commentGroup);
  container.append(table);
  Utils.showModal(header, container);
}

module.exports = displayErrByMessage;
