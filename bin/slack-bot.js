const Slack = require('slack');
const moment = require('moment');
const config = require('config');
const bunyan = require('bunyan');
const Promise = require('bluebird');
const knex = require('knex')(config.db);
const _ = require('lodash');

require('../modules/knex-timings')(knex, false);

const {makeKibanaLink} = require('../modules/common');
const {getTopErrors} = require('../modules/showTopErrors');

const log = bunyan.createLogger({name: 'shodan:slack-notify'});
const slackCfg = config.slack;
const {kibana} = config.updater;
const slack = new Slack({token: slackCfg.credentials.token});

const events = [
  // eslint-disable-next-line sonarjs/no-duplicate-string
  {name: 'showTopErrors', data: { env: '', period: 'day', role: '', pid: '', index: 'twapi-avia'}},
  {name: 'showTopErrors', data: { env: 'staging', period: 'day', role: '', pid: '', index: 'twapi-avia'}},
];

const filters = {
  isInBlackList: {
    name: 'blackList',
    description: 'Фильтр для известно-растущщих ошибок',
    fn: (el) => !slackCfg.errNotifyBot.blackListMsgNames.includes(el.msgName),
  },
  growingErrors: {
    name: 'growingErrors',
    description: `Количество ошибок в час больше ${slackCfg.errNotifyBot.perHourErrors}, 
      есть рост за час в ${slackCfg.errNotifyBot.perHourErrors} и более раз.`,
    fn: (el) => (
      el.preHour >= slackCfg.errNotifyBot.perHourErrors
      && (el.preHour === 0 ? el.count : (el.count / el.preHour).toFixed(2)) >= slackCfg.errNotifyBot.perHourErrors
    ),
  },
  firstErrors: {
    name: 'firstErrors',
    description: `Количество ошибок в час больше ${slackCfg.perHourErrors}, ошибка замечена впервые сегодня.`,
    fn: (el) => (
      el.preHour >= slackCfg.perHourErrors
      && moment(el.firstMet).startOf('day').toString() === moment().startOf('day').toString()
    ),
  },
};

function getDuty() {
  return slack.channels.info({
    token: slackCfg.credentials.token,
    channel: slackCfg.errNotifyBot.releaseChannelId,
  }).then((info) => info.channel.topic.value.match(/<@\w{9}>/gi));
}

function createMessage(messages, duty) {
  return messages.map((el, i) => {
    const link = makeKibanaLink('twapi-avia', el.name, el.msgName, kibana.url);
    const formatDate = (date) => moment(date).format(slackCfg.errNotifyBot.formatDate);
    const prevInterval = el.preHour === 0 ? el.count : (el.count / el.preHour).toFixed(2);
    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${i + 1}.* 
           <${link}|${el.name}.${el.msgName}>,
           ${el.typeErr}, 
           сколько: ${el.count}, 
           первая: ${formatDate(el.firstMet)}, 
           последняя: ${formatDate(el.lastMet)}, 
           рост: ${prevInterval}
           ${el.env === 'staging' ? ', на стейдже' : ' '}.`.replace((/ {2}|\r\n|\n|\r/gm), ''),
      },
    };
  });
}

async function writeToSlack(messages, duty) {
  if (messages.length < 1) {
    log.info('Messages array is empty');
  }
  // ограничиваем количество сообщений, для отправки в слак (сейчас четыре типа)
  const part = slackCfg.errNotifyBot.maxSlackMessages / 4;
  const result = messages.reduce((acc, cur) => {
    if (cur.typeErr === 'firstErrors' && acc.firstErrors.length < part) {
      acc.firstErrors.push(cur);
    }
    if (cur.typeErr === 'growingErrors' && acc.growingErrors.length < part) {
      acc.growingErrors.push(cur);
    }
    if (cur.typeErr === 'staging' && acc.staging.length < part) {
      acc.staging.push(cur);
    }
    if (cur.typeErr === 'other' && acc.other.length < part) {
      acc.other.push(cur);
    }
    return acc;
  }, {firstErrors: [], growingErrors: [], staging: [], other: []});
  const res = [...result.firstErrors, ...result.growingErrors, ...result.staging, ...result.other];

  await slack.chat.postMessage({
    token: slackCfg.credentials.token,
    channel: slackCfg.errNotifyBot.outputChannelId,
    text: ' ХЗ куда девается текст, надо доделать(',
    blocks: createMessage(res, duty),
  });
}

function isExpiredTime(time) {
  return moment(moment().diff(time)).minute() > slackCfg.errNotifyBot.diffMinutesBetweenSendSlack;
}

async function writeToDb(elements) {
  if (elements.length < 1) {
    log.info('Result array of errors is empty');
    return;
  }
  const duty = await getDuty();
  log.info(`Today duty is ${JSON.stringify(duty)}`);

  const toSlackMess = await Promise.reduce(elements, async (acc, cur) => {
    const resQuery = await knex
      .where('typeErr', cur.typeErr)
      .where('msgName', cur.msgName)
      .select('added')
      .from('slack-bot')
      .orderBy('id', 'desc')
      .limit(1);

    if (!resQuery[0] || (resQuery[0] && isExpiredTime(resQuery[0].added))) {
      log.info(`Write errors to database & notification to slack ${JSON.stringify(cur)}`);
      await knex.insert({msgName: cur.msgName, typeErr: cur.typeErr}).into('slack-bot');
      acc.push(cur);
    }
    return acc;
  }, []);

  await writeToSlack(toSlackMess, duty);
}

function run() {
  return Promise.map(events, (el) => getTopErrors(knex, el))
    .then(async (res) => {
      const errors = res.reduce((acc, obj) => acc.concat(obj.topErrors), []);
      const whiteList = errors.filter(filters.isInBlackList.fn);

      const filteredErrors = [
        ...(_.remove(whiteList, filters.firstErrors.fn)).map((obj) => ({ ...obj, typeErr: 'firstErrors'})),
        ...(_.remove(whiteList, filters.growingErrors.fn)).map((obj) => ({ ...obj, typeErr: 'growingErrors'})),
        ...(_.remove(whiteList, (el) => el.env === 'staging')).map((obj) => ({ ...obj, typeErr: 'staging' })),
        ...whiteList.map((obj) => ({ ...obj, typeErr: 'other' })),
      ];

      log.info(`Filtered errors: ${JSON.stringify(filteredErrors)}`);
      await writeToDb(filteredErrors);
    })
    .catch((e) => log.error(e));
}

async function start() {
  log.info('Slack-bot started');
  await run();
  setInterval(() => run(), slackCfg.errNotifyBot.intervalMin * 1000 * 60);
}

start();
