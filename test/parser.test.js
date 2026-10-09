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
