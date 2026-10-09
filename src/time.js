import { TIMEZONE } from './config.js';

/**
 * @typedef {{ year: number, month: number, day: number }} DateParts  month is 1-12
 */

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function partsAt(ms) {
  const out = {};
  for (const { type, value } of formatter.formatToParts(ms)) {
    if (type !== 'literal') out[type] = Number(value);
  }
  return out;
}

/** Kyiv UTC offset (ms) at the given instant — DST-aware. */
function offsetAt(ms) {
  const p = partsAt(ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Convert a Kyiv wall-clock time to a UTC epoch (ms). */
function localToUtcMs({ year, month, day, hour = 0, minute = 0 }) {
  const local = Date.UTC(year, month - 1, day, hour, minute);
  const guess = local - offsetAt(local);
  return local - offsetAt(guess);
}

/** @param {Date} date @returns {DateParts} calendar date in Kyiv */
export function toKyivDate(date) {
  const { year, month, day } = partsAt(date.getTime());
  return { year, month, day };
}

/** @param {DateParts} date @param {number} days @returns {DateParts} */
export function addDays({ year, month, day }, days) {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** @param {DateParts} a @param {DateParts} b */
export function sameDate(a, b) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** Unix timestamp (seconds) of 00:00 Kyiv time on the given date. */
export function kyivMidnightTimestamp(date) {
  return Math.floor(localToUtcMs(date) / 1000);
}

/**
 * Parse "DD.MM.YYYY HH:MM" (Kyiv wall-clock) into an ISO-8601 UTC string.
 * @param {string} text
 * @returns {string | null} null if the text is not a valid date-time
 */
export function parseSiteDateTime(text) {
  const m = /(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/.exec(text ?? '');
  if (!m) return null;
  const [day, month, year, hour, minute] = m.slice(1).map(Number);
  const ms = localToUtcMs({ year, month, day, hour, minute });
  const back = partsAt(ms);
  const valid =
    back.year === year &&
    back.month === month &&
    back.day === day &&
    back.hour === hour &&
    back.minute === minute;
  return valid ? new Date(ms).toISOString() : null;
}

/** Format an instant as the site's "DD.MM.YYYY HH:MM" in Kyiv wall-clock time. */
export function formatSiteDateTime(iso) {
  const p = partsAt(new Date(iso).getTime());
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(p.day)}.${pad(p.month)}.${p.year} ${pad(p.hour)}:${pad(p.minute)}`;
}
