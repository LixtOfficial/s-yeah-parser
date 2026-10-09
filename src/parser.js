import * as cheerio from 'cheerio';
import { LayoutChangedError } from './errors.js';
import { parseClock } from './slots.js';
import { parseSiteDateTime } from './time.js';

/**
 * Selectors and texts tied to the site markup. Keep them ALL here so a layout
 * change is a one-file fix.
 */
export const SELECTORS = Object.freeze({
  card: 'article.bz-schedule-card',
  cardTitle: '.bz-schedule-card__head strong',
  slot: '.bz-schedule-slot',
  slotTime: '.bz-schedule-slot__time',
  slotBadge: '.bz-schedule-slot__badge',
  slotOn: 'bz-schedule-slot--on',
  slotOff: 'bz-schedule-slot--off',
  empty: '.bz-schedule-empty',
  heroUpdated: '.bz-schedule-hero__updated',
  periodToday: '.bz-schedule-hero__period--today',
  periodTomorrow: '.bz-schedule-hero__period--tomorrow',
});

const NOT_PUBLISHED_RE = /ще не опублікован/i;
const QUEUE_RE = /Черга\s+(\d+\.\d+)/;
const TIME_RE = /(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})/;
const OFF_LABEL_RE = /без\s+світла/i;
const ON_LABEL_RE = /є\s+світло/i;

/**
 * @typedef {import('./slots.js').Interval} Interval
 * @typedef {'today' | 'tomorrow'} Period
 *
 * @typedef {object} ParsedPage
 * @property {'published' | 'not-published'} status
 * @property {string | null} updatedAt   ISO UTC, from the page header
 * @property {Record<string, Interval[]>} queues
 */

/**
 * Determine on/off state of a slot. Class and accessible label must agree,
 * otherwise the markup changed in a way we do not understand.
 */
function readSlotState($, slotEl, context) {
  const $slot = $(slotEl);
  const byClass = $slot.hasClass(SELECTORS.slotOn) ? true : $slot.hasClass(SELECTORS.slotOff) ? false : null;

  const badge = $slot.find(SELECTORS.slotBadge).first();
  const label = `${badge.attr('aria-label') ?? ''} ${badge.attr('title') ?? ''}`;
  const byLabel = OFF_LABEL_RE.test(label) ? false : ON_LABEL_RE.test(label) ? true : null;

  if (byClass === null && byLabel === null) {
    throw new LayoutChangedError(`${context}: cannot determine slot state`);
  }
  if (byClass !== null && byLabel !== null && byClass !== byLabel) {
    throw new LayoutChangedError(`${context}: slot class and label disagree`);
  }
  return byClass ?? byLabel;
}

/**
 * Parse a bezsvitla.com.ua schedule page. Pure function: no I/O, no clock.
 *
 * Throws {@link LayoutChangedError} whenever the page is neither a recognisable
 * schedule nor a recognisable "not published yet" page — never returns a guess.
 *
 * @param {string} html
 * @param {Period} expectedPeriod  which page we think we downloaded
 * @returns {ParsedPage}
 */
export function parseSchedulePage(html, expectedPeriod) {
  const $ = cheerio.load(html);

  // Guard against being served the wrong page (redirect, cache, site change).
  const periodSelector = expectedPeriod === 'today' ? SELECTORS.periodToday : SELECTORS.periodTomorrow;
  const otherSelector = expectedPeriod === 'today' ? SELECTORS.periodTomorrow : SELECTORS.periodToday;
  if ($(periodSelector).length === 0 || $(otherSelector).length > 0) {
    throw new LayoutChangedError(`Page is not the "${expectedPeriod}" schedule page`);
  }

  const cards = $(SELECTORS.card).toArray();

  if (cards.length === 0) {
    if (NOT_PUBLISHED_RE.test($(SELECTORS.empty).text())) {
      return { status: 'not-published', updatedAt: null, queues: {} };
    }
    throw new LayoutChangedError('No schedule cards and no "not published" notice found');
  }

  /** @type {Record<string, Interval[]>} */
  const queues = {};
  for (const card of cards) {
    const $card = $(card);
    const title = $card.find(SELECTORS.cardTitle).first().text();
    const queueMatch = QUEUE_RE.exec(title);
    if (!queueMatch) throw new LayoutChangedError(`Card without recognisable queue title: "${title.trim()}"`);
    const queueId = queueMatch[1];
    if (queues[queueId]) throw new LayoutChangedError(`Duplicate card for queue ${queueId}`);

    const slotEls = $card.find(SELECTORS.slot).toArray();
    if (slotEls.length === 0) throw new LayoutChangedError(`Queue ${queueId}: no time slots`);

    queues[queueId] = slotEls.map((slotEl, index) => {
      const context = `Queue ${queueId} slot #${index + 1}`;
      const timeText = $(slotEl).find(SELECTORS.slotTime).first().text();
      const m = TIME_RE.exec(timeText);
      if (!m) throw new LayoutChangedError(`${context}: unparsable time "${timeText.trim()}"`);
      return {
        start: parseClock(m[1]),
        end: parseClock(m[2]),
        isOn: readSlotState($, slotEl, context),
      };
    });
  }

  const updatedText = $(SELECTORS.heroUpdated).first().text();
  return { status: 'published', updatedAt: parseSiteDateTime(updatedText), queues };
}
