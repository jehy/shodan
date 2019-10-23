const Slack = require('slack');
const cron = require('node-cron');
const uuidv4 = require('uuid/v4');
const moment = require('moment');
const config = require('config');
const bunyan = require('bunyan');
const knex = require('knex')(config.db);
require('../modules/knex-timings')(knex, false);
const showTopErrors = require('../modules/showTopErrors');
const {makeKibanaLink, singleLineString} = require('../modules/utils');

const log = bunyan.createLogger({name: 'shodan:slack-notify'});
const slackConfig = config.slack;
const {kibana} = config.updater;
const slackBot = new Slack({token: slackConfig.token});

function getEvent(where, period) {
  return {
    name: 'showTopErrors',
    data: {
      env: where || '',         // production-a, production-b, staging
      period: period || 'day',  // hour, day
      role: '',
      pid: '',
      index: 'twapi-avia-*',
    },
    id: uuidv4(),
  };
}

const triggers = {
  case1: {
    description: singleLineString`Количество ошибок в час больше ${slackConfig.perHourErrors}, 
      есть рост за час в ${slackConfig.perHourErrors} и более раз.`,
    fn: (el) => el.preHour >= slackConfig.perHourErrors
        && (el.preHour === 0 ? el.count : (el.count / el.preHour).toFixed(2)) >= slackConfig.perHourErrors,
  },
  case2: {
    description: `Количество ошибок в час больше ${slackConfig.perHourErrors}, ошибка замечена впервые сегодня.`,
    fn: (el) => el.preHour >= slackConfig.perHourErrors
        && moment(el.firstMet).startOf('day').toString() === moment().startOf('day').toString(),
  },
};

// Фильтр для известно-растущщих ошибок
const isNotInBlackList = (el) => !slackConfig.blackListMsgNames.includes(el.msgName);

function createAttachment(arr) {
  const result = arr.map((el, i) => {
    return singleLineString`*${i + 1}.* Name: ${el.name}, msgName: ${el.msgName}, count: ${el.count}
            first: ${el.firstMet},
            last: ${el.lastMet},
            previousInterval: ${el.preHour === 0 ? el.count : (el.count / el.preHour).toFixed(2)}.
            <${makeKibanaLink('twapi-avia', el.name, el.msgName, kibana.url)}|Show logs>`;
  });
  return result.join('\n');
}

async function sendNoty(isStaging, filter1, filter2) {
  const att = [];
  const color = '#e30000';
  if (filter1.length > 0) {
    att.push({
      pretext: triggers.case1.description,
      text: createAttachment(filter1),
      color,
    });
  }
  if (filter2.length > 0) {
    att.push({
      pretext: triggers.case2.description,
      text: createAttachment(filter2),
      color,
    });
  }
  if (att.length < 1) {
    log.info(`Filtered array is empty, isStaging=${isStaging}`);
    return;
  }
  await knex.insert({fullMessage: JSON.stringify({filter1, filter2}), isStaging}).into('slack-bot');
  await slackBot.chat.postMessage({
    token: slackConfig.token,
    channel: slackConfig.channelId,
    text: isStaging ? '*Статистика (staging)*' : '*Статистика (production-a, production-b, staging)*',
    attachments: att,
  });
  log.info(`Send slack message & write errors to database, isStaging = ${isStaging}`);
}

async function isWriteToDb(isStaging) {
  const lastSend = await knex
    .where('isStaging', +isStaging)
    .select('added')
    .from('slack-bot')
    .orderBy('id', 'desc')
    .limit(1);

  if (!lastSend[0]) {
    return true;
  }
  return moment(moment().diff(lastSend[0].added)).minute() > slackConfig.diffMinutesBetweenSendSlack;
}

async function checkStats(isStaging) {
  const errors = await showTopErrors(knex, null, getEvent(isStaging ? '' : 'staging', ''));
  const filteredErrors = errors.filter(isNotInBlackList);
  const isWrite = await isWriteToDb(isStaging);
  if (isWrite) {
    await sendNoty(isStaging, filteredErrors.filter(triggers.case1.fn), filteredErrors.filter(triggers.case2.fn));
  }
}

log.info('Slack-bot started');
cron.schedule(slackConfig.cronInterval, async () => {
  log.info(`Start check errors, config: ${JSON.stringify(slackConfig)}`);
  await checkStats(false);
  await checkStats(true);
});
