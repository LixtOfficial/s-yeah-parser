const BASE_URL = 'https://bezsvitla.com.ua';

const REGIONS = {
  'kyiv': {
    name: 'Київ',
    path: 'kyiv',
    // Kyiv has 60 queues, each with only subqueue .1
    queues: Array.from({ length: 60 }, (_, i) => `${i + 1}.1`),
  },
  'kirovohradska-oblast': {
    name: 'Кіровоградська область',
    path: 'kirovohradska-oblast',
    // Other regions have 6 queues × 2 subqueues = 12
    queues: Array.from({ length: 6 }, (_, i) => [`${i + 1}.1`, `${i + 1}.2`]).flat(),
  },
  'kharkivska-oblast': {
    name: 'Харківська область',
    path: 'kharkivska-oblast',
    queues: Array.from({ length: 6 }, (_, i) => [`${i + 1}.1`, `${i + 1}.2`]).flat(),
  },
  'cherkaska-oblast': {
    name: 'Черкаська область',
    path: 'cherkaska-oblast',
    queues: Array.from({ length: 6 }, (_, i) => [`${i + 1}.1`, `${i + 1}.2`]).flat(),
  },
  'volynska-oblast': {
    name: 'Волинська область',
    path: 'volynska-oblast',
    queues: Array.from({ length: 6 }, (_, i) => [`${i + 1}.1`, `${i + 1}.2`]).flat(),
  },
  'sumska-oblast': {
    name: 'Сумська область',
    path: 'sumska-oblast',
    queues: Array.from({ length: 6 }, (_, i) => [`${i + 1}.1`, `${i + 1}.2`]).flat(),
  },
  'mykolaivska-oblast': {
    name: 'Миколаївська область',
    path: 'mykolaivska-oblast',
    queues: Array.from({ length: 6 }, (_, i) => [`${i + 1}.1`, `${i + 1}.2`]).flat(),
  },
  'khersonska-oblast': {
    name: 'Херсонська область',
    path: 'khersonska-oblast',
    queues: Array.from({ length: 6 }, (_, i) => [`${i + 1}.1`, `${i + 1}.2`]).flat(),
  },
  'chernivetska-oblast': {
    name: 'Чернівецька область',
    path: 'chernivetska-oblast',
    queues: Array.from({ length: 6 }, (_, i) => [`${i + 1}.1`, `${i + 1}.2`]).flat(),
  },
  'kyivska-oblast': {
    name: 'Київська область',
    path: 'kyivska-oblast',
    queues: Array.from({ length: 6 }, (_, i) => [`${i + 1}.1`, `${i + 1}.2`]).flat(),
  },
};

module.exports = { BASE_URL, REGIONS };
