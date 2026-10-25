import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LayoutChangedError } from '../src/errors.js';
import { parseSchedulePage } from '../src/parser.js';
import { card, emptyPage, page, SAMPLE_DAY } from './helpers.js';

describe('parseSchedulePage', () => {
  it('parses cards, intervals and update time', () => {
    const html = page({ body: card('1.1', SAMPLE_DAY) + card('1.2', [['00:00 – 24:00', true]]) });
    const r = parseSchedulePage(html, 'today');
    assert.equal(r.status, 'published');
    assert.deepEqual(Object.keys(r.queues), ['1.1', '1.2']);
    assert.deepEqual(r.queues['1.1'], [
      { start: 0, end: 90, isOn: false },
      { start: 90, end: 1080, isOn: true },
      { start: 1080, end: 1440, isOn: false },
    ]);
    // 09.10.2026 18:52 Kyiv = UTC+3 (DST)
    assert.equal(r.updatedAt, '2026-10-09T15:52:00.000Z');
  });

  it('parses update time from new hero freshness stamp (<time datetime="...">)', () => {
    const html = `<!DOCTYPE html>
<html><body>
  <section class="bz-schedule-hero">
    <h1 class="bz-schedule-hero__title">Графік <span class="bz-schedule-hero__period bz-schedule-hero__period--today">x</span></h1>
    <div class="bz-schedule-hero__freshness">
      <span class="bz-schedule-hero__stamp bz-schedule-hero__stamp--updated">
        <span>Оновлено:</span>
        <time datetime="2026-10-24T20:48:00+03:00">24.10 20:48</time>
      </span>
    </div>
  </section>
  ${card('1.1', SAMPLE_DAY)}
</body></html>`;
    const r = parseSchedulePage(html, 'today');
    assert.equal(r.updatedAt, '2026-10-24T17:48:00.000Z');
  });

  it('identifies queues by link when the title is "Група N" (Chernivtsi layout)', () => {
    const html = page({
      body:
        card('1.1', SAMPLE_DAY, 'Група 1') +
        card('1.2', SAMPLE_DAY, 'Група 2') +
        card('2.1', SAMPLE_DAY, 'Група 3'),
    });
    assert.deepEqual(Object.keys(parseSchedulePage(html, 'today').queues), ['1.1', '1.2', '2.1']);
  });

  it('throws when link and title name different queues', () => {
    const bad = card('1.1', SAMPLE_DAY, 'Черга 9.9');
    assert.throws(() => parseSchedulePage(page({ body: bad }), 'today'), /different queues/);
  });

  it('throws when a card has no queue id at all', () => {
    const bad = card('1.1', SAMPLE_DAY, 'Щось нове').replace('cherha-1-1', 'unknown');
    assert.throws(() => parseSchedulePage(page({ body: bad }), 'today'), /recognisable queue id/);
  });

  it('detects "not published" page', () => {
    assert.equal(parseSchedulePage(emptyPage('today'), 'today').status, 'not-published');
    assert.equal(parseSchedulePage(emptyPage('tomorrow'), 'tomorrow').status, 'not-published');
  });

  it('throws on unknown layout instead of guessing', () => {
    assert.throws(
      () => parseSchedulePage(page({ body: '<div>redesign</div>' }), 'today'),
      LayoutChangedError,
    );
    assert.throws(() => parseSchedulePage('<html></html>', 'today'), LayoutChangedError);
  });

  it('throws when served the wrong period', () => {
    const html = page({ period: 'tomorrow', body: card('1.1', SAMPLE_DAY) });
    assert.throws(() => parseSchedulePage(html, 'today'), LayoutChangedError);
  });

  it('throws on duplicate queue cards', () => {
    const html = page({ body: card('1.1', SAMPLE_DAY) + card('1.1', SAMPLE_DAY) });
    assert.throws(() => parseSchedulePage(html, 'today'), /Duplicate/);
  });

  it('throws when class and label disagree', () => {
    const bad = card('1.1', SAMPLE_DAY).replace('slot--off', 'slot--on');
    assert.throws(() => parseSchedulePage(page({ body: bad }), 'today'), /disagree/);
  });

  it('throws on unparsable slot time', () => {
    const bad = card('1.1', [['скоро', true]]);
    assert.throws(() => parseSchedulePage(page({ body: bad }), 'today'), /unparsable time/);
  });

  it('returns null updatedAt for an invalid date', () => {
    const html = page({ updated: '31.02.2026 10:00', body: card('1.1', SAMPLE_DAY) });
    assert.equal(parseSchedulePage(html, 'today').updatedAt, null);
  });
});
