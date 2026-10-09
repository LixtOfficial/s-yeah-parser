import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addDays,
  formatSiteDateTime,
  kyivMidnightTimestamp,
  parseSiteDateTime,
  toKyivDate,
} from '../src/time.js';

describe('time', () => {
  it('midnight timestamp respects DST (summer UTC+3, winter UTC+2)', () => {
    assert.equal(kyivMidnightTimestamp({ year: 2026, month: 7, day: 1 }), Date.UTC(2026, 5, 30, 21) / 1000);
    assert.equal(kyivMidnightTimestamp({ year: 2026, month: 1, day: 15 }), Date.UTC(2026, 0, 14, 22) / 1000);
  });

  it('handles the DST switch days (2026-03-29 and 2026-10-25)', () => {
    assert.equal(kyivMidnightTimestamp({ year: 2026, month: 3, day: 29 }), Date.UTC(2026, 2, 28, 22) / 1000);
    assert.equal(kyivMidnightTimestamp({ year: 2026, month: 10, day: 25 }), Date.UTC(2026, 9, 24, 21) / 1000);
  });

  it('toKyivDate uses Kyiv calendar, not UTC', () => {
    // 22:30 UTC on Dec 31 is already Jan 1 in Kyiv (UTC+2)
    assert.deepEqual(toKyivDate(new Date('2025-12-31T22:30:00Z')), { year: 2026, month: 1, day: 1 });
  });

  it('addDays crosses month/year boundaries', () => {
    assert.deepEqual(addDays({ year: 2026, month: 12, day: 31 }, 1), { year: 2027, month: 1, day: 1 });
    assert.deepEqual(addDays({ year: 2028, month: 2, day: 28 }, 1), { year: 2028, month: 2, day: 29 });
  });

  it('parseSiteDateTime: DST-aware and validating', () => {
    assert.equal(parseSiteDateTime('Оновлено: 09.10.2026 18:52'), '2026-10-09T15:52:00.000Z');
    assert.equal(parseSiteDateTime('04.03.2026 13:02'), '2026-03-04T11:02:00.000Z');
    assert.equal(parseSiteDateTime('31.02.2026 10:00'), null);
    assert.equal(parseSiteDateTime('nonsense'), null);
  });

  it('formatSiteDateTime round-trips', () => {
    assert.equal(formatSiteDateTime('2026-10-09T15:52:00.000Z'), '09.10.2026 18:52');
  });
});
