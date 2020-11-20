const Slack = require('slack');
const moment = require('moment');
const config = require('config');
const bunyan = require('bunyan');
const Promise = require('bluebird');
const axios = require('axios');
const knex = require('knex')(config.db);

require('../modules/knex-timings')(knex, false);

const {makeKibanaLink} = require('../lib/common');
const {getTopErrors} = require('../modules/showTopErrors');
const {getIndexes} = require('../modules/getIndexes');

const log = bunyan.createLogger({name: 'shodan:slack-notify'});
const kibanaConfig = config.updater.kibana;
const slackConfig = config.slack;
const slackClient = new Slack({token: slackConfig.credentials.token});

const cache = {
  holidayCache: {},
  indexes: null,
};

class ErrorChecks {
  static grownEnough(el, min) {
    return el.preHour === 0 || (el.count / el.preHour >= min);
  }

  static countEnough(el, min) {
    return el.count >= min;
  }

  static tooMany(el, max) {
    return el.count >= max;
  }

  static isStaging(el) {
    return el.env === 'staging';
  }

  static appearedToday(el) {
    return moment(el.firstMet).format('DDMMYYYY') === moment().format('DDMMYYYY');
  }
}

// Ошибки по приоритету. Чем выше, тем приоритетнее. Одна ошибка попадает только в одну категорию, наиболее приоритетную.
// !! При добавлении ошибок - дописывайте их в хвост, чтобы не менять порядковый номер существующих.
const errorsByPriority = [
  {
    description: 'Слишком много ошибок',
    condition: (el, conf) => {
      return ErrorChecks.tooMany(el, conf.tooMany);
    },
  },
  {
    description: 'Сегодня появилась впервые на продакшне',
    condition: (el, conf) => {
      const countEnough = ErrorChecks.countEnough(el, conf.minProdErrorsNew);
      const isStaging = ErrorChecks.isStaging(el);
      const appearedToday = ErrorChecks.appearedToday(el);
      return !isStaging && appearedToday && countEnough;
    },
  },
  {
    description: 'Сегодня появилась впервые на стейдже',
    condition: (el, conf) => {
      const countEnough = ErrorChecks.countEnough(el, conf.minStageErrorsNew);
      const isStaging = ErrorChecks.isStaging(el);
      const appearedToday = ErrorChecks.appearedToday(el);
      return appearedToday && countEnough && isStaging;
    },
  },
  {
    description: 'Рост на продакшне',
    condition: (el, conf) => {
      const countEnough = ErrorChecks.countEnough(el, conf.minProdErrors);
      const grownEnough = ErrorChecks.grownEnough(el, conf.minProdErrorsGrown);
      const isStaging = ErrorChecks.isStaging(el);
      return !isStaging && countEnough && grownEnough;
    },
  },
  {
    description: 'Рост на стейдже',
    condition: (el, conf) => {
      const countEnough = ErrorChecks.countEnough(el, conf.minStageErrors);
      const grownEnough = ErrorChecks.grownEnough(el, conf.minStageErrorsGrown);
      const isStaging = ErrorChecks.isStaging(el);
      return isStaging && countEnough && grownEnough;
    },
  },
];

async function checkIfHoliday() {
  const now = moment();
  const covidHolidays = now.isBetween(moment('06-05-2020', 'DD-MM-YYYY'), moment('08-05-2020 23', 'DD-MM-YYYY HH'));
  if (covidHolidays) {
    return false;
  }
  const key = now.format('YYYY-MM-DD');
  if (cache.holidayCache[key] !== undefined) {
    return cache.holidayCache[key];
  }
  try {
    const request = `https://isdayoff.ru/api/getdata?year=${now.format('YYYY')}&month=${now.format('MM')}&day=${now.format('DD')}`;
    const {data} = await axios(request);
    const isHoliday = parseInt(data, 10) === 1;
    log.info(`checking holiday, request ${request} data ${data} isHoliday ${isHoliday}`);
    cache.holidayCache[key] = isHoliday;
    return isHoliday;
  } catch (err) {
    log.error('Could not check holiday data', err);
  }
  return false;

}
async function isDevOnDuty() {
  const now = moment();
  const weekDay = now.isoWeekday();
  const hour = now.hour();
  const isWorkDay = weekDay < 6;
  const isWorkHour = hour > 9 && hour < 19;
  if (!isWorkDay || !isWorkHour) {
    return false;
  }
  const isHoliday = await checkIfHoliday();
  return isWorkDay && isWorkHour && !isHoliday;
}

async function getDuty(conf) {
  if (!conf.monitoringChannelId) {
    return false;
  }
  const info = await slackClient.conversations.info({
    channel: conf.monitoringChannelId,
  });
  const onDuty = info.channel.topic.value.match(/<@\w{9,11}>/gi);
  const shouldNotify = await isDevOnDuty();
  if (onDuty.length > 1 && !shouldNotify) {
    return onDuty.slice(0, 1);
  }
  return onDuty;
}

function link(error) {
  return makeKibanaLink(error.index, error.name, error.msgName, kibanaConfig.url, cache.indexes);
}

function formatDate(date) {
  return moment(date).format('MMM DD HH:mm');
}

function errorGrowthRate(error) {
  return (error.preHour === 0 ? 'N/A' : (error.count / error.preHour).toFixed(2));
}
function formatDescription(str) {
  if (str.includes('впервые')) {
    return `*${str}*`;
  }
  return str;
}

function getGrowthIcon(error) {
  const rate = error.preHour === 0 ? error.count : (error.count / error.preHour);
  if (rate > 300) {
    return ' :pants_on_fire:';
  }
  if (rate > 50) {
    return ' :alert:';
  }
  if (rate > 10) {
    return ' :rocket:';
  }
  return '';
}

function generateMessage(errors, duty, project) {
  const onDuty = duty ? `${duty.join(',')}, ` : '';
  const header = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `${onDuty}обратите внимание на ${project.index.replace('twapi-', '')}:`,
    },
  };
  const errorsFormatted = errors.map((error, index)=>{
    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${index + 1}.* <${link(error)}|${error.name}.${error.msgName}>: `
      + `${formatDescription(errorsByPriority[error.typeErr].description)}\n`
      + `сколько: ${error.count}, ранее: ${error.preHour}, первая: ${formatDate(error.firstMet)},`
      + ` последняя: ${formatDate(error.lastMet)}, рост: ${errorGrowthRate(error)}${getGrowthIcon(error)}`,
      },
    };
  });
  return [header].concat(errorsFormatted);
}

async function sendToSlack(errors, project) {
  const duty = await getDuty(project);
  project.log.info(`Duty data from slack: ${JSON.stringify(duty)}`);
  const message = generateMessage(errors, duty, project);

  await slackClient.chat.postMessage({
    channel: project.outputChannelId,
    text: '',
    as_user: true,
    blocks: message,
  });
}

/**
 * filter messages for slack, leave only those that were not sent earlier
 * @param errorsToReport
 * @param project
 * @returns {Promise<*>}
 */
async function filterBySent(errorsToReport, project) {
  const possibleDuplicates = await knex('slack_bot')
    .select('msgName', 'typeErr')
    .whereRaw(`added > DATE_SUB(NOW(), INTERVAL ${project.diffMinutesBetweenSendSlack} MINUTE)`)
    .where('projectId', project.projectId)
    .from('slack_bot');
  return errorsToReport.filter((err)=>!possibleDuplicates.some((dup)=>{
    return dup.msgName === err.msgName && dup.typeErr === err.typeErr;
  }));
}

async function processErrorMessages(errorsToReport, project) {
  const newErrorMessages = await filterBySent(errorsToReport, project);
  const errorMessagesLimited = newErrorMessages.slice(0, project.maxSlackMessages);
  if (!errorMessagesLimited.length) {
    project.log.info('no new messages to send after filtering by already sent');
    return;
  }
  project.log.info('We have', errorMessagesLimited.length, 'errors after filter by already sent');
  await sendToSlack(errorMessagesLimited, project);
  const forDatabase = errorMessagesLimited.map((err)=>({msgName: err.msgName, typeErr: err.typeErr, projectId: project.projectId}));
  await knex.insert(forDatabase).into('slack_bot');
  project.log.info(`Sent warning about ${errorMessagesLimited.length} errors`);
}

async function run(project) {
  if (!cache.indexes) {
    try {
      cache.indexes = await getIndexes();
    } catch (err) {
      log.error('Failed to get indexes data', err);
    }
  }
  const dbRequests = [
    {name: 'showTopErrors', data: { env: ['production-a', 'production-b'], period: 'hour', role: '', pid: '', index: project.index}},
    {name: 'showTopErrors', data: { env: 'staging', period: 'hour', role: '', pid: '', index: project.index}},
  ];
  const errors = (await Promise.reduce(dbRequests, async (res, el) => {
    const errorPart = await getTopErrors(knex, el);
    return res.concat(errorPart && errorPart.topErrors || []);
  }, []))
    .filter((e) => !project.blackListMsgNames || !project.blackListMsgNames.includes(e.msgName));
  project.log.info('We have', errors.length, 'errors after blacklist');

  const errorsToReport = errors.reduce((acc, error) => {
    const reportConditionIndex = errorsByPriority.findIndex(({condition}) => condition(error, project));
    if (reportConditionIndex !== -1) {
      acc.push({...error, typeErr: reportConditionIndex});
    }
    return acc;
  }, []);

  if (!errorsToReport.length) {
    project.log.info('Nothing to report after condition filter');
    return null;
  }
  project.log.info('We have', errorsToReport.length, 'errors after condition filter');
  return processErrorMessages(errorsToReport, project);
}

function randomInt(min, max) {
  return min + Math.floor((max - min) * Math.random());
}

async function schedule(projectConfig = null) {
  await knex('slack_bot')
    .whereRaw(`added < DATE_SUB(NOW(), INTERVAL ${config.updater.kibana.storeLogsFor} DAY)`)
    .del();
  if (projectConfig === null) { // first launch
    log.info('Slack-bot started');
    for (let projectId = 0; projectId < slackConfig.errorNotifyBot.length; projectId++) {
      const projectLog = log.child({index: slackConfig.errorNotifyBot[projectId].index});
      const project = {...slackConfig.errorNotifyBot[projectId], projectId, log: projectLog};
      // eslint-disable-next-line no-await-in-loop
      await run(project).catch((e) => projectLog.error(e));
      setTimeout(()=>schedule(project), project.interval + randomInt(200, 10000));
    }
    return;
  }
  await run(projectConfig).catch((e) => projectConfig.log.error(e));
  setTimeout(()=>schedule(projectConfig),  projectConfig.interval);
}

schedule().catch((e) => log.error(e));
