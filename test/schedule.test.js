import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DataValidationError } from '../src/errors.js';
import { fetchRegion } from '../src/schedule.js';
import { saveRegion } from '../src/store.js';
import { card, emptyPage, page, SAMPLE_DAY } from './helpers.js';

const region = { key: 'test-oblast', name: 'Test', path: 'test-oblast', queues: ['1.1', '1.2'] };
const NOW = () => new Date('2026-10-09T15:55:00Z'); // 18:55 Kyiv
const TODAY_TS = Date.UTC(2026, 9, 8, 21) / 1000;
const TOMORROW_TS = Date.UTC(2026, 9, 9, 21) / 1000;

const full = (period) =>
  page({ period, body: card('1.1', SAMPLE_DAY) + card('1.2', [['00:00 – 24:00', true]]) });

const pages = (map) => async (url) => {
  const html = map[url.split('/').slice(3).join('/')];
  if (html === undefined) throw new Error(`unexpected url ${url}`);
  return html;
};

describe('fetchRegion', () => {
  it('assembles today + tomorrow', async () => {
    const fetchPage = pages({
      'test-oblast': full('today'),
      'test-oblast/grafik-na-zavtra': full('tomorrow'),
    });
    const out = await fetchRegion(region, { fetchPage, now: NOW });
    assert.equal(out.status, 'ok');
    assert.equal(out.result.fact.today, TODAY_TS);
    assert.deepEqual(Object.keys(out.result.fact.data).map(Number), [TODAY_TS, TOMORROW_TS]);
    assert.equal(out.result.fact.update, '09.10.2026 18:52');
    assert.equal(out.result.fact.data[TODAY_TS]['GPV1.1']['1'], 'no');
    assert.equal(out.result.fact.data[TODAY_TS]['GPV1.2']['1'], 'yes');
  });

  it('omits tomorrow when not published', async () => {
    const fetchPage = pages({
      'test-oblast': full('today'),
      'test-oblast/grafik-na-zavtra': emptyPage('tomorrow'),
    });
    const out = await fetchRegion(region, { fetchPage, now: NOW });
    assert.deepEqual(Object.keys(out.result.fact.data).map(Number), [TODAY_TS]);
  });

  it('keeps today when tomorrow page is broken', async () => {
    const fetchPage = pages({
      'test-oblast': full('today'),
      'test-oblast/grafik-na-zavtra': '<html>boom</html>',
    });
    const out = await fetchRegion(region, { fetchPage, now: NOW, logger: { warn() {}, info() {} } });
    assert.equal(out.status, 'ok');
    assert.equal(Object.keys(out.result.fact.data).length, 1);
  });

  it('reports not-published for today (never fabricates all-day-on)', async () => {
    const fetchPage = pages({ 'test-oblast': emptyPage('today') });
    assert.deepEqual(await fetchRegion(region, { fetchPage, now: NOW }), { status: 'not-published' });
  });

  it('fails when a queue is missing', async () => {
    const html = page({ body: card('1.1', SAMPLE_DAY) });
    await assert.rejects(
      fetchRegion(region, { fetchPage: pages({ 'test-oblast': html }), now: NOW }),
      DataValidationError,
    );
  });

  it('fails when the date rolls over mid-run', async () => {
    const times = [new Date('2026-10-09T20:59:59Z'), new Date('2026-10-09T21:00:01Z')]; // 23:59:59 -> 00:00:01
    let call = 0;
    const now = () => times[Math.min(call++, times.length - 1)];
    const fetchPage = pages({
      'test-oblast': full('today'),
      'test-oblast/grafik-na-zavtra': full('tomorrow'),
    });
    await assert.rejects(fetchRegion(region, { fetchPage, now }), /date changed/);
  });
});

describe('saveRegion', () => {
  it('writes atomically and skips unchanged content', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'parser-'));
    try {
      assert.equal(await saveRegion(dir, 'kyiv', { a: 1 }), 'written');
      assert.equal(await saveRegion(dir, 'kyiv', { a: 1 }), 'unchanged');
      assert.equal(await saveRegion(dir, 'kyiv', { a: 2 }), 'written');
      assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'kyiv.json'), 'utf8')), { a: 2 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects path-traversal keys', async () => {
    await assert.rejects(saveRegion(os.tmpdir(), '../evil', {}), /Unsafe/);
  });
});
