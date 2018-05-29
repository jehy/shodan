'use strict';

const modalTitle = $('#modal .modal-title');
const modalBody = $('#modal .modal-body');
const modal = $('#modal');


function showModal(header, data) {
  modalTitle.empty().append(header);
  modalBody.empty().append(data);
  modal.modal();
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
  return `${parseInt(data, 10)} ${unit}`.replace(' ', '&nbsp;');
}

module.exports = {
  showDiff,
  showModal,
};
