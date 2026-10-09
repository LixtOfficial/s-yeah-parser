import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HTTP, REGIONS } from './config.js';
import { fetchRegion } from './schedule.js';
import { saveRegion } from './store.js';

const OUTPUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'output');

const logger = {
  info: (msg) => console.log(msg),
  warn: (msg) => console.warn(`  ⚠ ${msg}`),
  error: (msg) => console.error(`  ✗ ${msg}`),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {string[]} args @returns {string[]} */
function selectRegions(args) {
  if (args.length === 0) return Object.keys(REGIONS);
  const unknown = args.filter((key) => !Object.hasOwn(REGIONS, key));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown region(s): ${unknown.join(', ')}. Available: ${Object.keys(REGIONS).join(', ')}`,
    );
  }
  return [...new Set(args)];
}

async function main() {
  const keys = selectRegions(process.argv.slice(2));
  logger.info(`Parsing ${keys.length} region(s)...\n`);

  const failed = [];
  const skipped = [];

  for (const [index, key] of keys.entries()) {
    if (index > 0) await sleep(HTTP.requestGapMs);
    const region = REGIONS[key];
    logger.info(`▶ ${region.name} (${key})`);

    try {
      const outcome = await fetchRegion(region, { logger });
      if (outcome.status === 'not-published') {
        // Keep the previous file instead of overwriting it with empty/guessed data.
        skipped.push(key);
        logger.warn("today's schedule is not published yet — previous file kept");
        continue;
      }
      const state = await saveRegion(OUTPUT_DIR, key, outcome.result);
      const days = Object.keys(outcome.result.fact.data).length;
      logger.info(`  ✓ ${state} (${region.queues.length} queues, ${days} day(s))`);
    } catch (err) {
      failed.push(key);
      logger.error(`${key}: ${err.name}: ${err.message}`);
    }
  }

  logger.info(
    `\nDone: ${keys.length - failed.length - skipped.length} ok, ${skipped.length} skipped, ${failed.length} failed.`,
  );
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
