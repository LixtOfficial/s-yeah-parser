import { mkdir, rename, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

/**
 * Write JSON atomically (temp file + rename) so a crash never leaves a
 * half-written file, and skip the write when nothing changed (no noisy commits).
 *
 * @param {string} dir
 * @param {string} key  validated region key (used as file name)
 * @param {unknown} data
 * @returns {Promise<'written' | 'unchanged'>}
 */
export async function saveRegion(dir, key, data) {
  if (!/^[a-z0-9-]+$/.test(key)) throw new Error(`Unsafe output key: ${key}`);

  const target = path.join(dir, `${key}.json`);
  const json = `${JSON.stringify(data, null, 2)}\n`;

  try {
    if ((await readFile(target, 'utf8')) === json) return 'unchanged';
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  await mkdir(dir, { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(tmp, json, 'utf8');
    await rename(tmp, target);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
  return 'written';
}
