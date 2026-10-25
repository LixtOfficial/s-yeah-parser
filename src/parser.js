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
  cardLink: '.bz-schedule-card__head a[href*="cherha-"], a.bz-schedule-card__head[href*="cherha-"]',
  slot: '.bz-schedule-slot',
  slotTime: '.bz-schedule-slot__time',
  slotBadge: '.bz-schedule-slot__badge',
  slotOn: 'bz-schedule-slot--on',
  slotOff: 'bz-schedule-slot--off',
  empty: '.bz-schedule-empty',
  heroUpdated: '.bz-schedule-hero__stamp--updated, .bz-schedule-hero__updated',
  periodToday: '.bz-schedule-hero__period--today',
  periodTomorrow: '.bz-schedule-hero__period--tomorrow',
});

const NOT_PUBLISHED_RE = /ще не опублікован/i;
const QUEUE_RE = /Черга\s+(\d+\.\d+)/;
const QUEUE_HREF_RE = /\/cherha-(\d+)-(\d+)(?:[/?#]|$)/;
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
 * Determine the queue id (e.g. "1.1") of a card.
 *
 * The card link (".../cherha-1-1") is the source of truth because it is the same in
 * every region, while the visible title differs ("Черга 1.1" vs "Група 1" in
 * Chernivtsi). If the title does carry an id it must agree with the link.
 */
function readQueueId($card) {
  const href = $card.find(SELECTORS.cardLink).first().attr('href') ?? '';
  const hrefMatch = QUEUE_HREF_RE.exec(href);
  const title = $card.find(SELECTORS.cardTitle).first().text().trim();
  const titleMatch = QUEUE_RE.exec(title);

  const fromHref = hrefMatch ? `${hrefMatch[1]}.${hrefMatch[2]}` : null;
  const fromTitle = titleMatch ? titleMatch[1] : null;

  if (fromHref && fromTitle && fromHref !== fromTitle) {
    throw new LayoutChangedError(`Card link "${href}" and title "${title}" refer to different queues`);
  }
  const id = fromHref ?? fromTitle;
  if (!id)
    throw new LayoutChangedError(`Card without recognisable queue id (title "${title}", link "${href}")`);
  return id;
}

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
 * Read the update timestamp from the page header or card footer.
 * Supports both the new freshness stamp with semantic <time> and the legacy header text.
 */
function readUpdateTime($) {
  const heroStamp = $(SELECTORS.heroUpdated).first();
  if (heroStamp.length > 0) {
    const timeEl = heroStamp.find('time');
    const dt = timeEl.attr('datetime');
    if (dt) {
      const d = new Date(dt);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    const title = timeEl.attr('title');
    if (title) {
      const fromTitle = parseSiteDateTime(title);
      if (fromTitle) return fromTitle;
    }
    return parseSiteDateTime(heroStamp.text());
  }

  const cardUpdated = $('.bz-schedule-card__updated').first().text();
  if (cardUpdated) {
    const fromCard = parseSiteDateTime(cardUpdated);
    if (fromCard) return fromCard;
  }

  const bodyText = $('.bz-schedule-hero').text() || $('body').text();
  return parseSiteDateTime(bodyText);
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
    const queueId = readQueueId($card);
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

  const updatedAt = readUpdateTime($);
  return { status: 'published', updatedAt, queues };
}
