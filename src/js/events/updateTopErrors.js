'use strict';

import * as moment from 'moment';
import * as Utils from '../utils';

const indexSelector = $('#topErrors-index');
/**
 * Корректировка округления десятичных дробей.
 * https://developer.mozilla.org/ru/docs/Web/JavaScript/Reference/Global_Objects/Math/floor
 * @param {String}  type  Тип корректировки.
 * @param {Number}  value Число.
 * @param {Integer} exp   Показатель степени (десятичный логарифм основания корректировки).
 * @returns {Number} Скорректированное значение.
 */
function decimalAdjust(type, value, exp) {
  // Если степень не определена, либо равна нулю...
  if (typeof exp === 'undefined' || +exp === 0) {
    return Math[type](value);
  }
  value = +value;
  exp = +exp;
  // Если значение не является числом, либо степень не является целым числом...
  if (Number.isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0)) {
    return NaN;
  }
  // Сдвиг разрядов
  value = value.toString().split('e');
  value = Math[type](+(`${value[0]}e${value[1] ? (+value[1] - exp) : -exp}`));
  // Обратный сдвиг
  value = value.toString().split('e');
  return +(`${value[0]}e${value[1] ? (+value[1] + exp) : exp}`);
}

function round10(value, exp = -1) {
  return decimalAdjust('round', value, exp);
}

function formatErrorDeltaTD(row) {
  if (!row.preHour) {
    return '<td class="warning">N/A</td>';
  }
  const koef = round10(row.count / row.preHour);
  let tdClass = '';
  if (koef >= 3) {
    tdClass = 'danger';
  } else if (koef < 0.5) {
    tdClass = 'success';
  }
  return `<td class="${tdClass}">${koef}</td>`;
}

function formatFirstMetTD(row) {
  const firstMet = moment().diff(moment(row.firstMet), 's');
  let tdClass = '';
  const appearDiff = moment().diff(moment(row.firstMet), 'h');
  if (appearDiff < 6) {
    tdClass = 'danger';
  } else if (appearDiff < 48) {
    tdClass = 'warning';
  }
  return `<td class="${tdClass}">${Utils.showDiff(firstMet)}</td>`;
}

function formatErrorsOtherEnv(row, showErorrsOtherEnv) {
  if (!showErorrsOtherEnv) {
    return '';
  }
  return `<td>${row.otherEnv || 0}</td>`;
}

function formatLastMetTD(row) {
  /* const lastMet = moment().diff(moment(row.lastMet), 's');
  let tdClass = '';
  const metDiff = moment().diff(moment(row.lastMet), 'm');
  if (metDiff < 5) {
    tdClass = 'danger';
  }
  else if (metDiff < 15) {
    tdClass = 'warning';
  }
  return `<td class="${tdClass}">${Utils.showDiff(lastMet)}</td>`; */
  const lastMet = moment().diff(moment(row.lastMet), 's');
  return `<td>${Utils.showDiff(lastMet)}</td>`;
}

function formatComment(comment, config) {
  if (!comment || !config.ui.display.jiraUrl) {
    return comment;
  }
  const matches = comment.match(/[A-Z]{2,5}-[0-9]{2,5}/g);
  if (matches && matches.length) {
    matches.forEach((m) => {
      comment = comment.replace(m, `<a target="_blank" href="${config.ui.display.jiraUrl}${m}">${m}</a>`);
    });
  }
  return comment;
}

function updateTopErrors(data, socket, config) {
  const headerFields = ['name', 'msgName', 'Count', 'Age', 'Last met', 'previous interval', 'Comment'];
  // const headerFields = ['name', 'msgName', 'Count', 'Age', 'Last met', 'previous interval', 'Other env count', 'Comment'];
  // const showErorrsOtherEnv = data.some(row => row.otherEnv);
  const tbody = $('<tbody/>');
  data.forEach((row) => {
    const tr = $('<tr/>');
    tr.click(() => {
      const container = $('<div class="progress">'
        + '<div class="progress-bar progress-bar-striped active" role="progressbar" aria-valuenow="45"'
        + ' aria-valuemin="0" aria-valuemax="100" style="width: 45%">'
        + '<span class="sr-only">45% Complete</span>'
        + '</div></div>');
      Utils.showModal(row.msgName, container);
      const index = indexSelector.val();
      const errorData = {
        name: 'showLogsByErrorId',
        data: {
          errorId: row.id,
          env: row.env,
          index,
        },
      };
      // window.location.href = `#action=event&data=${encodeURIComponent(JSON.stringify(errorData))}`;
      socket.emit('event', errorData);
    });
    tr.append(`<td>${row.name}</td>`)
      .append(`<td>${Utils.formatMessageName(row)}</td>`)
      .append(`<td>${row.count}</td>`)
      .append(formatFirstMetTD(row))
      .append(formatLastMetTD(row))
      .append(formatErrorDeltaTD(row))
      // .append(formatErrorsOtherEnv(row, showErorrsOtherEnv))
      .append(`<td>${formatComment(row.comment, config)}</td>`);
    tbody.append(tr);
  });
  $('#topErrors tbody').replaceWith(tbody);
  // if (!showErorrsOtherEnv) {
  //  headerFields.splice(headerFields.indexOf('Other env count'), 1);
  // }
  const thead = $('<thead>').append($('<tr>').append(`<th>${headerFields.join('</th><th>')}</th>`));
  $('#topErrors thead').replaceWith(thead);
}

export default updateTopErrors;
