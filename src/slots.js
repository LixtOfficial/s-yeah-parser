import { DataValidationError } from './errors.js';

/**
 * @typedef {object} Interval
 * @property {number} start  minutes from 00:00, 0..1440
 * @property {number} end    minutes from 00:00, 0..1440 (exclusive)
 * @property {boolean} isOn  true = power available
 */

/** @typedef {'yes' | 'no' | 'first' | 'second'} SlotValue */

const DAY = 1440;
const HALF = 30;

/**
 * Parse "HH:MM" into minutes. "24:00" is allowed (end of day).
 * @param {string} text
 * @returns {number}
 */
export function parseClock(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) throw new DataValidationError(`Invalid time "${text}"`);
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  if (Number(m[2]) > 59 || minutes > DAY) throw new DataValidationError(`Time out of range "${text}"`);
  return minutes;
}

/**
 * Convert a strictly validated list of intervals into 24 hourly slots.
 *
 * Slot "1" = 00:00-01:00 ... "24" = 23:00-24:00.
 *   yes    — power ON the whole hour
 *   no     — power OFF the whole hour
 *   first  — OFF first half (XX:00-XX:30), ON second half
 *   second — ON first half, OFF second half (XX:30-XX+1:00)
 *
 * The input must cover the whole day without gaps or overlaps (anything else is
 * rejected rather than guessed at). Boundaries that are not on a 30-minute mark
 * are rounded mathematically to the nearest half hour (x:15 rounds up). Both
 * neighbours share the same rounded boundary, so coverage stays contiguous;
 * intervals that collapse to zero length are dropped.
 *
 * @param {Interval[]} intervals
 * @param {{ onRound?: (from: number, to: number) => void }} [options]
 * @returns {Record<string, SlotValue>}
 */
export function toHourlySlots(intervals, { onRound } = {}) {
  if (intervals.length === 0) throw new DataValidationError('No intervals');

  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  /** @type {(boolean | null)[]} */
  const halves = new Array(DAY / HALF).fill(null);

  const round = (minute) => {
    const rounded = Math.round(minute / HALF) * HALF;
    if (rounded !== minute) onRound?.(minute, rounded);
    return rounded;
  };

  let cursor = 0;
  for (const { start, end, isOn } of sorted) {
    if (!(start >= 0 && end <= DAY && start < end)) {
      throw new DataValidationError(`Invalid interval ${start}-${end}`);
    }
    if (start < cursor) throw new DataValidationError(`Overlapping interval at minute ${start}`);
    if (start > cursor) throw new DataValidationError(`Gap in schedule at minute ${cursor}-${start}`);
    // start === previous end, so only `end` is reported to avoid duplicate logs
    const from = Math.round(start / HALF) * HALF;
    const to = round(end);
    for (let m = from; m < to; m += HALF) halves[m / HALF] = isOn;
    cursor = end;
  }
  if (cursor !== DAY) throw new DataValidationError(`Schedule ends at minute ${cursor}, expected ${DAY}`);

  /** @type {Record<string, SlotValue>} */
  const slots = {};
  for (let hour = 0; hour < 24; hour++) {
    const first = halves[hour * 2];
    const second = halves[hour * 2 + 1];
    /** @type {SlotValue} */
    let value;
    if (first && second) value = 'yes';
    else if (!first && !second) value = 'no';
    else if (!first && second) value = 'first';
    else value = 'second';
    slots[String(hour + 1)] = value;
  }
  return slots;
}
