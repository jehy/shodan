'use strict';

const moment = require('moment');
const Utils = require('../utils');

function showHanged(data) {

  const container = $('<div/>');
  const notNeededFields = ['logId', 'message', 'msgId', 'type'];
  const maxScore = data.reduce((res, d)=>{
    const score = d.messages.reduce((res2, msg)=>{
      if (msg.name === 'HANG_CHECK')
      {
        return res2;
      }
      return Math.max(res2, msg.score);
    }, 0);
    return Math.max(score, res);
  }, 0);
  console.log(`max score: ${maxScore}`);
  const scoreForWarn = maxScore * 0.8;
  const needFields = Object.keys(data[0].messages[0])
    .filter(key => !notNeededFields.includes(key));
  const thead = $('<thead>');
  const headerTds = needFields.map(key => `<th>${key}</th>`);
  thead.append(headerTds);
  let needStripe = true;
  data.forEach((hang)=>{
    const {env, host, role, pid, messages} = hang;

    const common = `
            <table class="table">
            <thead><th>env</th><th>host</th><th>role</th><th>pid</th></thead>
            <tbody><tr><td>${env}</td>
            <td>${host}</td>
            <td>${role}</td>
            <td>${pid}</td>
            </tr></tbody>
            </table>`;
    const table = $('<table class="table"/>');
    table.append(thead.clone());
    const tbody = $('<tbody>');
    messages.forEach((err) => {
      needStripe = !needStripe;
      let trStyle = '';
      if (needStripe) {
        trStyle = ' style="background-color: #f0f0f0;"';
      }
      if (err.score > scoreForWarn)
      {
        trStyle = ' class = "warning"';
      }
      if (err.name === 'HANG_CHECK')
      {
        trStyle = ' class = "danger"';
      }
      err.eventDate = moment(err.eventDate).format('HH:mm:ss');
      const meta = needFields.map(key => `<td>${err[key]}</td>`).join('');
      let errMessage = err.message;
      if (errMessage.length === 2007 && errMessage.includes('CUT'))
      {
        errMessage += ` (${Math.floor(err.messageLength / 1024)} KB)`;
      }
      const message = $(`<td colspan=${needFields.length} class="err-msg">`).text(errMessage);
      // tr.append(Object.values(err).map((val => `<td>${val}</td>`)).join(''));
      tbody.append(`<tr${trStyle}>${meta}</tr>`);
      tbody.append($(`<tr${trStyle}>`).append(message));
    });
    table.append(tbody);
    const header = $('<div class="panel-heading" />');
    const body = $('<div class="body" />');
    const panel = $('<div class="panel panel-info" />');
    header.append(common);
    body.append(table);
    panel.append(header);
    panel.append(body);
    container.append(panel);
    // container.append(common);
    // container.append(table);
    // container.append('<br><br>');
  });
  const header = 'Last hangs';
  Utils.showModal(header, container);
}

module.exports = showHanged;
