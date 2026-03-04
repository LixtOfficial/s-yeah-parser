const fs = require('fs');
const path = require('path');
const { REGIONS } = require('./config');
const { parseRegion } = require('./parser');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

async function main() {
  // Get regions from CLI args, or parse all
  const args = process.argv.slice(2);
  let regionKeys;

  if (args.length > 0) {
    regionKeys = args.filter((key) => {
      if (!REGIONS[key]) {
        console.error(`Unknown region: "${key}". Available: ${Object.keys(REGIONS).join(', ')}`);
        return false;
      }
      return true;
    });
    if (regionKeys.length === 0) {
      process.exit(1);
    }
  } else {
    regionKeys = Object.keys(REGIONS);
  }

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`Parsing ${regionKeys.length} region(s)...\n`);

  for (const key of regionKeys) {
    const region = REGIONS[key];
    console.log(`▶ ${region.name} (${key})`);

    try {
      const result = await parseRegion(region);

      const outputFile = path.join(OUTPUT_DIR, `${key}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf-8');

      const queueCount = Object.keys(Object.values(result.fact.data)[0] || {}).length;
      const dayCount = Object.keys(result.fact.data).length;
      console.log(`  ✓ Saved: ${outputFile}`);
      console.log(`    ${queueCount} queues, ${dayCount} day(s)\n`);
    } catch (err) {
      console.error(`  ✗ Error parsing ${key}: ${err.message}\n`);
    }
  }

  console.log('Done!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
