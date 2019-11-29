const Slack = require('slack');
const moment = require('moment');
const config = require('config');
const bunyan = require('bunyan');
const Promise = require('bluebird');
const knex = require('knex')(config.db);

require('../modules/knex-timings')(knex, false);

const {makeKibanaLink} = require('../modules/common');
const {getTopErrors} = require('../modules/showTopErrors');

const log = bunyan.createLogger({name: 'shodan:slack-notify'});
const {kibana} = config.updater;
const slackCfg = config.slack;
const slack = new Slack({token: slackCfg.credentials.token});

const TIMEOUT = slackCfg.errNotifyBot.intervalMin * 1000 * 60;

const Errors = {
  FIRST_ERRORS_PROD: 'firstErrorsProd',
  GROWING_ERRORS_PROD: 'growingErrorsProd',
  FIRST_ERRORS_STAGE: 'firstErrorsStage',
  GROWING_ERRORS_STAGE: 'growingErrorsStage',
};

const typesConfig = {
  [Errors.FIRST_ERRORS_PROD]: {
    description: '',
    condition: (el) => {
      const first = moment(el.firstMet).format('DDMMYYYY') === moment().format('DDMMYYYY');
      return el.env !== 'staging' && first;
    },
  },
  [Errors.GROWING_ERRORS_PROD]: {
    description: '',
    condition: (el) => {
      const hour = el.preHour >= slackCfg.errNotifyBot.perHourErrors;
      const grow = (el.preHour === 0 ? !!el.count : (el.count / el.preHour)) >= slackCfg.errNotifyBot.perHourErrors;
      return el.env !== 'staging' && hour && grow;
    },
  },
  [Errors.FIRST_ERRORS_STAGE]: {
    description: 'на стейдже',
    condition: (el) => {
      const first = moment(el.firstMet).format('DDMMYYYY') === moment().format('DDMMYYYY');
      return el.env === 'staging' && first;
    },
  },
  [Errors.GROWING_ERRORS_STAGE]: {
    description: 'на стейдже',
    condition: (el) => {
      const hour = el.preHour >= slackCfg.errNotifyBot.perHourErrors;
      const grow = (el.preHour === 0 ? !!el.count : (el.count / el.preHour)) >= slackCfg.errNotifyBot.perHourErrors;
      return el.env === 'staging' && hour && grow;
    },
  },
};

const events = [
  // eslint-disable-next-line sonarjs/no-duplicate-string
  {name: 'showTopErrors', data: { env: '', period: 'hour', role: '', pid: '', index: 'twapi-avia'}},
  {name: 'showTopErrors', data: { env: 'staging', period: 'hour', role: '', pid: '', index: 'twapi-avia'}},
];

async function getDuty() {
  const info = await slack.channels.info({
    token: slackCfg.credentials.token,
    channel: slackCfg.errNotifyBot.releaseChannelId,
  });
  return info.channel.topic.value.match(/<@\w{9}>/gi);
}

function createHeader(duty) {
  return [{
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Статистика.* Уважаемые дежурные ${duty.join(',')}, у нас что-то горит...`,
    },
  }];
}

function link(m) {
  return makeKibanaLink('twapi-avia', m.name, m.msgName, kibana.url);
}
function formatDate(date) {
  return moment(date).format(slackCfg.errNotifyBot.formatDate);
}
function prevInterval(m) {
  return (m.preHour === 0 ? m.count : (m.count / m.preHour).toFixed(2));
}

function generateBlocks(messages, duty) {
  let i = 0;
  return createHeader(duty).concat(Object.keys(messages).reduce((acc, typeError) => {
    messages[typeError].forEach((m) => {
      const description = typesConfig[typeError].description ? `описание: ${typesConfig[typeError].description}` : '';
      acc.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${i++ + 1}.* <${link(m)}|${m.name}.${m.msgName}>, `
            + `сколько: ${m.count}, `
            + `первая: ${formatDate(m.firstMet)}, `
            + `последняя: ${formatDate(m.lastMet)}, `
            + `рост: ${Math.trunc(prevInterval(m))} `
            + `${description} `,
        },
      });
    });
    return acc;
  }, []));
}

async function sendMessages(object, duty) {
  const keys = Object.keys(object);
  if (keys.length === 0) {
    log.info('Object with errors has not keys in sendMessages()');
    return;
  }
  // ограничиваем количество сообщений, для отправки в слак
  // делим на количество типов ошибок, попровну на каждый тип
  const limit = Math.round(slackCfg.errNotifyBot.maxSlackMessages / keys.length);

  const errors = keys.reduce((acc, el) => {
    acc[el] = object[el].slice(0, limit);
    return acc;
  }, {});

  const blocks = generateBlocks(errors, duty);

  if (blocks.length !== 1) {
    await slack.chat.postMessage({
      token: slackCfg.credentials.token,
      channel: slackCfg.errNotifyBot.outputChannelId,
      text: '',
      as_user: true,
      blocks,
    });
  }
}


async function writeToDb(object) {
  const keys = Object.keys(object);
  if (keys.length === 0) {
    log.info('Object with errors has not keys in writeToDb()');
    return;
  }
  const duty = await getDuty();
  log.info(`Duty is ${JSON.stringify(duty)}`);
  const minutes = slackCfg.errNotifyBot.diffMinutesBetweenSendSlack;

  const slackMessages = await Promise.reduce(keys, async (acc, curTypeError) => {
    const currentArr = object[curTypeError];
    const databaseMessages = await Promise.reduce(currentArr, async (accum, curMes) => {
      const value = await knex
        .where({typeErr: curTypeError, msgName: curMes.msgName})
        .andWhereRaw(`added > DATE_SUB(NOW(), INTERVAL ${minutes} MINUTE)`)
        .from('slack_bot')
        .first('id', 'added');

      if (!value) {
        log.info(`We have new record: ${JSON.stringify(curMes)}`);
        await knex.insert({msgName: curMes.msgName, typeErr: curTypeError}).into('slack_bot');
        accum.push(curMes);
      }
      return accum;
    }, []);

    acc[curTypeError] = [].concat(databaseMessages);
    return acc;
  }, {});
  await sendMessages(slackMessages, duty);
}

function run() {
  const blackList = slackCfg.errNotifyBot.blackListMsgNames;

  return Promise.map(events, (el) => getTopErrors(knex, el))
    .then(async (res) => {
      const errors = res
        .reduce((acc, obj) => acc.concat(obj.topErrors), [])
        .filter((e) => !blackList.includes(e.msgName));

      log.info('We are have', errors.length, 'errors');
      const priorityConditions = Object.keys(typesConfig);
      log.info('Priority conditions', priorityConditions);

      const assembledObject = errors.reduce((acc, el) => {
        for (let i = 0; i < priorityConditions.length; i++) {
          const curr = priorityConditions[i];
          if (typesConfig[curr].condition(el)) {
            acc[curr] = [].concat(acc[curr] ? acc[curr] : [], el);
            break;
          }
        }
        return acc;
      }, {});

      await writeToDb(assembledObject);
    })
    .catch((e) => log.error(e));
}
async function start() {
  log.info('Slack-bot started');
  await run();
  setTimeout(start, TIMEOUT);
}

start();
