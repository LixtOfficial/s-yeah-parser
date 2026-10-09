export const BASE_URL = 'https://bezsvitla.com.ua';
export const TIMEZONE = 'Europe/Kyiv';
export const TOMORROW_PATH = 'grafik-na-zavtra';

/**
 * @typedef {object} Region
 * @property {string} key       CLI/output key (also the URL path segment)
 * @property {string} name      Human-readable name
 * @property {string} path      URL path segment on the site
 * @property {string[]} queues  Queue ids that MUST be present on a published page
 */

/** Queue ids like "1.1", "1.2", ... "N.2" */
const subqueues = (count) =>
  Array.from({ length: count * 2 }, (_, i) => `${Math.floor(i / 2) + 1}.${(i % 2) + 1}`);

/** Kyiv city: 60 queues, each with only subqueue ".1" */
const kyivQueues = () => Array.from({ length: 60 }, (_, i) => `${i + 1}.1`);

/** @returns {Region} */
const region = (key, name, queues = subqueues(6)) => ({ key, name, path: key, queues });

const list = [
  region('kyiv', 'Київ', kyivQueues()),
  region('kirovohradska-oblast', 'Кіровоградська область'),
  region('kharkivska-oblast', 'Харківська область'),
  region('cherkaska-oblast', 'Черкаська область'),
  region('volynska-oblast', 'Волинська область'),
  region('sumska-oblast', 'Сумська область'),
  region('mykolaivska-oblast', 'Миколаївська область'),
  region('khersonska-oblast', 'Херсонська область'),
  region('chernivetska-oblast', 'Чернівецька область'),
  region('kyivska-oblast', 'Київська область'),
  region('vinnytska-oblast', 'Вінницька область'),
  region('dnipropetrovska-oblast', 'Дніпропетровська область'),
  region('zhytomyrska-oblast', 'Житомирська область'),
  region('zakarpatska-oblast', 'Закарпатська область'),
  region('zaporizka-oblast', 'Запорізька область'),
  region('ivano-frankivska-oblast', 'Івано-Франківська область'),
  region('lvivska-oblast', 'Львівська область'),
  region('odeska-oblast', 'Одеська область'),
  region('poltavska-oblast', 'Полтавська область'),
  region('rivnenska-oblast', 'Рівненська область'),
  region('ternopilska-oblast', 'Тернопільська область'),
  region('khmelnytska-oblast', 'Хмельницька область'),
  region('chernihivska-oblast', 'Чернігівська область'),
];

/** @type {Readonly<Record<string, Region>>} */
export const REGIONS = Object.freeze(Object.fromEntries(list.map((r) => [r.key, Object.freeze(r)])));

/** Network behaviour */
export const HTTP = Object.freeze({
  timeoutMs: 15_000,
  retries: 3,
  baseDelayMs: 1_000,
  maxBytes: 5 * 1024 * 1024,
  /** Pause between requests to be polite to the site */
  requestGapMs: 500,
  userAgent: 'Mozilla/5.0 (compatible; dtek-kyiv-parser/2.0; +https://github.com/LixtOfficial/s-yeah-parser)',
});
