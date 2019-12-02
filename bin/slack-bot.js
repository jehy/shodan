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
const kibanaConfig = config.updater.kibana;
const slackConfig = config.slack;
const botConfig = slackConfig.errorNotifyBot;
const slackClient = new Slack({token: slackConfig.credentials.token});

const checkInterval = botConfig.interval * 1000 * 60;

const kibanaIndex = 'twapi-avia';

class ErrorChecks {
  static grownEnough(el, min) {
    return el.preHour === 0 || (el.count / el.preHour >= min);
  }

  static countEnough(el, min) {
    return el.count >= min;
  }

  static isStaging(el) {
    return el.env === 'staging';
  }

  static appearedToday(el) {
    return moment(el.firstMet).format('DDMMYYYY') === moment().format('DDMMYYYY');
  }
}

// Ошибки по приоритету. Чем выше, тем приоритетнее. Одна ошибка попадает только в одну категорию, наиболее приоритетную.
const errorsByPriority = [
  {
    description: 'Впервые на продакшне',
    condition: (el) => {
      const countEnough = ErrorChecks.countEnough(el, botConfig.minProdErrors);
      const isStaging = ErrorChecks.isStaging(el);
      const appearedToday = ErrorChecks.appearedToday(el);
      return !isStaging && appearedToday && countEnough;
    },
  },
  {
    description: 'Впервые на стейдже',
    condition: (el) => {
      const countEnough = ErrorChecks.countEnough(el, botConfig.minStageErrors);
      const isStaging = ErrorChecks.isStaging(el);
      const appearedToday = ErrorChecks.appearedToday(el);
      return appearedToday && countEnough && isStaging;
    },
  },
  {
    description: 'Рост на продакшне',
    condition: (el) => {
      const countEnough = ErrorChecks.countEnough(el, botConfig.minProdErrors);
      const grownEnough = ErrorChecks.grownEnough(el, botConfig.minProdErrorsGrown);
      const isStaging = ErrorChecks.isStaging(el);
      return !isStaging && countEnough && grownEnough;
    },
  },
  {
    description: 'Рост на стейдже',
    condition: (el) => {
      const countEnough = ErrorChecks.countEnough(el, botConfig.minStageErrors);
      const grownEnough = ErrorChecks.grownEnough(el, botConfig.minStageErrorsGrown);
      const isStaging = ErrorChecks.isStaging(el);
      return isStaging && countEnough && grownEnough;
    },
  },
];

async function getDuty() {
  const info = await slackClient.conversations.info({
    channel: botConfig.monitoringChannelId,
  });
  return info.channel.topic.value.match(/<@\w{9}>/gi);
}

function link(error) {
  return makeKibanaLink(kibanaIndex, error.name, error.msgName, kibanaConfig.url);
}

function formatDate(date) {
  return moment(date).format('MMM DD HH:mm');
}

function errorGrowthRate(error) {
  return (error.preHour === 0 ? 'N/A' : (error.count / error.preHour).toFixed(2));
}

function generateMessage(errors, duty) {
  const header = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Shodan.* ${duty.join(',')}, обратите внимание:`,
    },
  };
  const errorsFormatted = errors.map((error, index)=>{
    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${index + 1}.* <${link(error)}|${error.name}.${error.msgName}>: ${error.description}\n`
      + `сколько: ${error.count}, ранее: ${error.preHour}, первая: ${formatDate(error.firstMet)},`
      + ` последняя: ${formatDate(error.lastMet)}, рост: ${errorGrowthRate(error)}`,
      },
    };
  });
  return [header].concat(errorsFormatted);
}

async function sendToSlack(errors) {
  const duty = await getDuty();
  log.info(`Duty data from slack: ${JSON.stringify(duty)}`);
  const message = generateMessage(errors, duty);

  await slackClient.chat.postMessage({
    channel: botConfig.outputChannelId,
    text: '',
    as_user: true,
    blocks: message,
  });
}

/**
 * filter messages for slack, leave only those that were not sent earlier
 * @param errorsToReport
 * @returns {Promise<*>}
 */
async function filterBySent(errorsToReport) {
  const possibleDuplicates = await knex('slack_bot')
    .select('msgName', 'typeErr')
    .whereRaw(`added > DATE_SUB(NOW(), INTERVAL ${botConfig.diffMinutesBetweenSendSlack} MINUTE)`)
    .from('slack_bot');
  return errorsToReport.filter((err)=>!possibleDuplicates.some((dup)=>{
    return dup.msgName === err.msgName && dup.typeErr === err.description;
  }));
}

async function processErrorMessages(errorsToReport) {
  const newErrorMessages = await filterBySent(errorsToReport);
  const errorMessagesLimited = newErrorMessages.slice(0, botConfig.maxSlackMessages);
  if (!errorMessagesLimited.length) {
    log.info('no new messages to send after filtering by already sent');
    return;
  }
  await sendToSlack(errorMessagesLimited);
  const forDatabase = errorMessagesLimited.map((err)=>({msgName: err.msgName, typeErr: err.description}));
  await knex.insert(forDatabase).into('slack_bot');
}

async function run() {

  await knex('slack_bot')
    .whereRaw(`added < DATE_SUB(NOW(), INTERVAL ${config.updater.kibana.storeLogsFor} DAY)`)
    .del();
  const dbRequests = [
    {name: 'showTopErrors', data: { env: '', period: 'hour', role: '', pid: '', index: kibanaIndex}},
    {name: 'showTopErrors', data: { env: 'staging', period: 'hour', role: '', pid: '', index: kibanaIndex}},
  ];
  const errors = (await Promise.reduce(dbRequests, async (res, el) => {
    const errorPart = await getTopErrors(knex, el);
    return res.concat(errorPart && errorPart.topErrors || []);
  }, []))
    .filter((e) => !botConfig.blackListMsgNames.includes(e.msgName));
  log.info('We have', errors.length, 'errors after blacklist');

  const errorsToReport = errors.reduce((acc, error) => {
    const reportCondition = errorsByPriority.find(({condition}) => condition(error));
    if (reportCondition) {
      acc.push({...error, description: reportCondition.description});
    }
    return acc;
  }, []);

  if (!errorsToReport.length) {
    log.info('Nothing to report after condition filter');
    return null;
  }
  return processErrorMessages(errorsToReport);
}

function schedule() {
  log.info('Slack-bot started');
  run().catch((e) => log.error(e));
  setTimeout(schedule, checkInterval);
}

schedule();
