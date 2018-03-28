const $ = require('jquery');

function showModal(header, data) {
  $('#modal .modal-title').empty().append(header);
  $('#modal .modal-body').empty().append(data);
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

module.exports = {
  showDiff,
  showModal,
};
