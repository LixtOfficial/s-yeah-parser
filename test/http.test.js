import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError, ResponseError } from '../src/errors.js';
import { fetchHtml } from '../src/http.js';

const URL_OK = 'https://bezsvitla.com.ua/kyiv';
const noSleep = () => Promise.resolve();

const htmlResponse = (body = '<html></html>', init = {}) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=UTF-8' }, ...init });

describe('fetchHtml', () => {
  it('returns body on success', async () => {
    const body = await fetchHtml(URL_OK, {
      fetchImpl: async () => htmlResponse('<p>ok</p>'),
      sleep: noSleep,
    });
    assert.equal(body, '<p>ok</p>');
  });

  it('retries 5xx and then succeeds', async () => {
    let calls = 0;
    const fetchImpl = async () => (++calls < 3 ? new Response('x', { status: 503 }) : htmlResponse());
    await fetchHtml(URL_OK, { fetchImpl, sleep: noSleep });
    assert.equal(calls, 3);
  });

  it('retries network errors and gives up after the limit', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      throw new TypeError('fetch failed');
    };
    await assert.rejects(fetchHtml(URL_OK, { fetchImpl, sleep: noSleep, retries: 2 }), /Network failure/);
    assert.equal(calls, 3);
  });

  it('does not retry 404', async () => {
    let calls = 0;
    const fetchImpl = async () => (calls++, new Response('', { status: 404 }));
    await assert.rejects(fetchHtml(URL_OK, { fetchImpl, sleep: noSleep }), HttpError);
    assert.equal(calls, 1);
  });

  it('rejects non-HTML content', async () => {
    const fetchImpl = async () =>
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    await assert.rejects(fetchHtml(URL_OK, { fetchImpl, sleep: noSleep }), ResponseError);
  });

  it('rejects oversized bodies', async () => {
    const fetchImpl = async () => htmlResponse('x'.repeat(1000));
    await assert.rejects(
      fetchHtml(URL_OK, { fetchImpl, sleep: noSleep, maxBytes: 100 }),
      /exceeded|too large/,
    );
  });

  it('refuses foreign origins', async () => {
    await assert.rejects(
      fetchHtml('https://evil.example/x', { fetchImpl: async () => htmlResponse() }),
      ResponseError,
    );
  });
});
