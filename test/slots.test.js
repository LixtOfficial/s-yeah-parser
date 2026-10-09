import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DataValidationError } from '../src/errors.js';
import { parseClock, toHourlySlots } from '../src/slots.js';

const iv = (start, end, isOn) => ({ start, end, isOn });

describe('parseClock', () => {
  it('parses valid times incl. 24:00', () => {
    assert.equal(parseClock('00:00'), 0);
    assert.equal(parseClock('10:30'), 630);
    assert.equal(parseClock('24:00'), 1440);
  });
  it('rejects invalid', () => {
    for (const t of ['25:00', '10:60', 'abc', '24:30'])
      assert.throws(() => parseClock(t), DataValidationError);
  });
});

describe('toHourlySlots', () => {
  it('maps half-hour patterns to yes/no/first/second', () => {
    const slots = toHourlySlots([
      iv(0, 90, false),
      iv(90, 150, true),
      iv(150, 180, false),
      iv(180, 1440, true),
    ]);
    assert.equal(slots['1'], 'no'); // 00:00-01:00 off
    assert.equal(slots['2'], 'first'); // 01:00-01:30 off, 01:30-02:00 on
    assert.equal(slots['3'], 'second'); // 02:00-02:30 on, 02:30-03:00 off
    assert.equal(slots['4'], 'yes');
    assert.equal(slots['24'], 'yes');
    assert.equal(Object.keys(slots).length, 24);
  });

  it('accepts a full day of power', () => {
    const slots = toHourlySlots([iv(0, 1440, true)]);
    assert.ok(Object.values(slots).every((v) => v === 'yes'));
  });

  it('is order-independent', () => {
    const a = toHourlySlots([iv(720, 1440, false), iv(0, 720, true)]);
    const b = toHourlySlots([iv(0, 720, true), iv(720, 1440, false)]);
    assert.deepEqual(a, b);
  });

  it('rejects gaps, overlaps, partial coverage, empty', () => {
    assert.throws(() => toHourlySlots([iv(0, 600, true), iv(660, 1440, true)]), /Gap/);
    assert.throws(() => toHourlySlots([iv(0, 720, true), iv(690, 1440, false)]), /Overlapping/);
    assert.throws(() => toHourlySlots([iv(0, 600, true)]), /ends at/);
    assert.throws(() => toHourlySlots([iv(10, 10, true)]), /Invalid interval/);
    assert.throws(() => toHourlySlots([]), /No intervals/);
  });

  it('rounds boundaries to the nearest 30 min (half up) and reports them', () => {
    const rounded = [];
    // 11:45 -> 12:00 (half up), 16:40 -> 16:30 (nearest)
    const slots = toHourlySlots([iv(0, 705, true), iv(705, 1000, false), iv(1000, 1440, true)], {
      onRound: (from, to) => rounded.push([from, to]),
    });
    assert.deepEqual(rounded, [
      [705, 720],
      [1000, 990],
    ]);
    assert.equal(slots['12'], 'yes'); // 11:00-12:00
    assert.equal(slots['13'], 'no'); // 12:00-13:00
    assert.equal(slots['16'], 'no'); // 15:00-16:00
    assert.equal(slots['17'], 'first'); // 16:00-16:30 off, 16:30-17:00 on
  });

  it('rounding keeps neighbours contiguous and drops collapsed intervals', () => {
    // 10:05-10:10 collapses (both boundaries round to 10:00)
    const slots = toHourlySlots([iv(0, 605, true), iv(605, 610, false), iv(610, 1440, true)]);
    assert.ok(Object.values(slots).every((v) => v === 'yes'));
  });
});
