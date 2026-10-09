import { BASE_URL, TOMORROW_PATH } from './config.js';
import { DataValidationError } from './errors.js';
import { fetchHtml } from './http.js';
import { parseSchedulePage } from './parser.js';
import { toHourlySlots } from './slots.js';
import { addDays, formatSiteDateTime, kyivMidnightTimestamp, sameDate, toKyivDate } from './time.js';

const pad2 = (n) => String(n).padStart(2, '0');
/** Minutes from midnight -> "HH:MM" */
const fmt = (minutes) => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;

/**
 * @typedef {import('./config.js').Region} Region
 * @typedef {import('./slots.js').SlotValue} SlotValue
 * @typedef {Record<string, Record<string, SlotValue>>} DayData  GPV<queue> -> hour -> value
 *
 * @typedef {object} RegionResult
 * @property {string} regionId
 * @property {string} lastUpdated
 * @property {{ data: Record<string, DayData>, update: string, today: number }} fact
 */

/**
 * Convert parsed queues to the output shape and verify them against the
 * region's expected queues. Missing queues are an ERROR (never silently
 * assumed to have power); unexpected extra queues are reported as warnings.
 *
 * @param {ReturnType<typeof parseSchedulePage>['queues']} queues
 * @param {Region} region
 * @param {{ warn: (msg: string) => void }} [logger]
 * @returns {DayData}
 */
export function buildDayData(queues, region, logger) {
  const missing = region.queues.filter((id) => !queues[id]);
  if (missing.length > 0) {
    throw new DataValidationError(
      `${region.key}: missing queue(s) ${missing.join(', ')} (got ${Object.keys(queues).length}/${region.queues.length})`,
    );
  }

  const extra = Object.keys(queues).filter((id) => !region.queues.includes(id));
  if (extra.length > 0) logger?.warn(`${region.key}: ignoring unexpected queue(s) ${extra.join(', ')}`);

  /** @type {DayData} */
  const data = {};
  for (const id of region.queues) {
    try {
      data[`GPV${id}`] = toHourlySlots(queues[id], {
        onRound: (from, to) =>
          logger?.warn(`${region.key} queue ${id}: ${fmt(from)} rounded to ${fmt(to)} (30-min granularity)`),
      });
    } catch (err) {
      throw new DataValidationError(`${region.key} queue ${id}: ${err.message}`, { cause: err });
    }
  }
  return data;
}

/**
 * Download and assemble the schedule for one region.
 *
 * @param {Region} region
 * @param {object} [deps]
 * @param {typeof fetchHtml} [deps.fetchPage]
 * @param {() => Date} [deps.now]
 * @param {{ info: Function, warn: Function }} [deps.logger]
 * @returns {Promise<{ status: 'ok', result: RegionResult, tomorrow: boolean } | { status: 'not-published' }>}
 */
export async function fetchRegion(region, deps = {}) {
  const { fetchPage = fetchHtml, now = () => new Date(), logger } = deps;

  const startDate = toKyivDate(now());
  const todayUrl = `${BASE_URL}/${region.path}`;
  const tomorrowUrl = `${todayUrl}/${TOMORROW_PATH}`;

  const todayPage = parseSchedulePage(await fetchPage(todayUrl, { logger }), 'today');
  if (todayPage.status === 'not-published') return { status: 'not-published' };
  if (!todayPage.updatedAt) throw new DataValidationError(`${region.key}: page has no readable update time`);

  const todayData = buildDayData(todayPage.queues, region, logger);

  /** @type {Record<string, DayData>} */
  const days = { [kyivMidnightTimestamp(startDate)]: todayData };

  // Tomorrow is optional: a failure here must not discard valid data for today.
  let tomorrowIncluded = false;
  try {
    const tomorrowPage = parseSchedulePage(await fetchPage(tomorrowUrl, { logger }), 'tomorrow');
    if (tomorrowPage.status === 'published') {
      days[kyivMidnightTimestamp(addDays(startDate, 1))] = buildDayData(tomorrowPage.queues, region, logger);
      tomorrowIncluded = true;
    }
  } catch (err) {
    logger?.warn(`${region.key}: tomorrow's schedule skipped: ${err.message}`);
  }

  // If midnight passed while we were fetching, "today" is no longer what we labelled it.
  if (!sameDate(startDate, toKyivDate(now()))) {
    throw new DataValidationError(`${region.key}: date changed while fetching, will retry on next run`);
  }

  return {
    status: 'ok',
    tomorrow: tomorrowIncluded,
    result: {
      regionId: region.path,
      lastUpdated: todayPage.updatedAt,
      fact: {
        data: days,
        update: formatSiteDateTime(todayPage.updatedAt),
        today: kyivMidnightTimestamp(startDate),
      },
    },
  };
}
