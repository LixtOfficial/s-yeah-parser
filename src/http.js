import { BASE_URL, HTTP } from './config.js';
import { HttpError, NetworkError, ResponseError } from './errors.js';

const ALLOWED_ORIGIN = new URL(BASE_URL).origin;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {string} url */
function assertAllowed(url) {
  if (new URL(url).origin !== ALLOWED_ORIGIN) {
    throw new ResponseError(`Refusing to fetch foreign origin: ${url}`);
  }
}

/** Read body as text with a hard size cap. */
async function readCapped(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ResponseError(`Response too large (${declared} bytes)`);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let total = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ResponseError(`Response exceeded ${maxBytes} bytes`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function fetchOnce(url, { timeoutMs, maxBytes, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': HTTP.userAgent,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.5',
      },
    });

    if (response.url) assertAllowed(response.url); // redirects must stay on-site
    if (!response.ok) throw new HttpError(`HTTP ${response.status} for ${url}`, response.status);

    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('text/html')) {
      throw new ResponseError(`Unexpected content-type "${type}" for ${url}`);
    }
    return await readCapped(response, maxBytes);
  } catch (err) {
    if (err instanceof HttpError || err instanceof ResponseError) throw err;
    throw new NetworkError(`Network failure for ${url}: ${err.message}`, { cause: err });
  }
}

/**
 * Fetch an HTML page with timeout, size cap, origin check and retry with
 * exponential backoff (network errors, 429, 5xx only).
 *
 * @param {string} url
 * @param {object} [options]
 * @returns {Promise<string>}
 */
export async function fetchHtml(url, options = {}) {
  const {
    timeoutMs = HTTP.timeoutMs,
    retries = HTTP.retries,
    baseDelayMs = HTTP.baseDelayMs,
    maxBytes = HTTP.maxBytes,
    fetchImpl = globalThis.fetch,
    sleep = defaultSleep,
    logger,
  } = options;

  assertAllowed(url);

  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchOnce(url, { timeoutMs, maxBytes, fetchImpl });
    } catch (err) {
      if (!err.retryable || attempt >= retries) throw err;
      const delay = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 250);
      logger?.warn(`${err.message} — retry ${attempt + 1}/${retries} in ${delay}ms`);
      await sleep(delay);
    }
  }
}
