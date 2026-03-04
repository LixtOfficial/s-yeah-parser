const cheerio = require('cheerio');
const fetch = require('node-fetch');
const { BASE_URL } = require('./config');

/**
 * Fetch HTML page content from URL
 * @param {string} url - Full URL to fetch
 * @returns {Promise<string>} HTML content
 */
async function fetchPage(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8',
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

/**
 * Check if "tomorrow" schedule is available on the page
 * @param {string} html - HTML content
 * @returns {boolean} true if schedule is published
 */
function isTomorrowAvailable(html) {
  const $ = cheerio.load(html);
  // When tomorrow is not published, there's an alert with this text
  const alertText = $('.alert.alert-warning').text();
  return !alertText.includes('ще не опублікований');
}

/**
 * Parse the page-level update time from the top of the page
 * @param {string} html - HTML content
 * @returns {string} Update time string like "04.03.2026 13:02"
 */
function parseUpdateTime(html) {
  const $ = cheerio.load(html);

  // Try card footer first (individual card update time)
  const footerText = $('.card-footer').first().text().trim();
  const footerMatch = footerText.match(/Оновлено[:\s️]*(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2})/);
  if (footerMatch) {
    return footerMatch[1];
  }

  // Fallback: try page-level update time
  const bodyText = $('body').text();
  const pageMatch = bodyText.match(/Оновлено[:\s️]*(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2})/);
  if (pageMatch) {
    return pageMatch[1];
  }

  return '';
}

/**
 * Parse queue cards from HTML page and extract intervals
 * @param {string} html - HTML content
 * @returns {Object} Map of queue id (e.g. "1.1") to array of intervals
 *   Each interval: { start: "HH:MM", end: "HH:MM", isOn: boolean }
 */
function parseQueues(html) {
  const $ = cheerio.load(html);
  const queues = {};

  // Use .card class — works for both Kyiv (has id="queue-*") and oblasts (no id)
  $('.card').each((_, card) => {
    const $card = $(card);

    // Extract queue number from card header text: "Черга 1.1" → "1.1"
    const headerText = $card.find('.card-header').text().trim();
    const headerMatch = headerText.match(/Черга\s+(\d+\.\d+)/);
    if (!headerMatch) return;
    const queueId = headerMatch[1];

    const intervals = [];

    $card.find('.card-body ul li, .card-body .list-group-item').each((_, li) => {
      const $li = $(li);

      // Extract time text like "00:00 – 10:30"
      const timeText = $li.text().trim();
      const timeMatch = timeText.match(/(\d{2}:\d{2})\s*[–—-]\s*(\d{2}:\d{2})/);
      if (!timeMatch) return;

      const start = timeMatch[1];
      const end = timeMatch[2];

      // Check status from icon title attribute
      // title="Вимкнено" = OFF, title="Включено" = ON
      const icon = $li.find('span[title], i[title], svg[title], img[title]');
      let isOn = true; // default to ON if no icon found

      if (icon.length > 0) {
        const title = icon.attr('title') || '';
        isOn = !title.includes('Вимкнено');
      }

      intervals.push({ start, end, isOn });
    });

    queues[queueId] = intervals;
  });

  return queues;
}

/**
 * Convert intervals to 24 hourly slots
 *
 * Slot "1" = 00:00-01:00, "2" = 01:00-02:00, ..., "24" = 23:00-24:00
 *
 * Values:
 *   "yes"    = power ON for full hour
 *   "no"     = power OFF for full hour
 *   "first"  = power OFF first 30 min (XX:00-XX:30), ON second 30 min (XX:30-XX+1:00)
 *   "second" = power ON first 30 min (XX:00-XX:30), OFF second 30 min (XX:30-XX+1:00)
 *
 * @param {Array} intervals - Array of { start, end, isOn }
 * @returns {Object} Hourly slots { "1": "yes", "2": "no", ... "24": "yes" }
 */
function convertToHourlySlots(intervals) {
  // Build a minute-by-minute status map (0-1439 for 24 hours)
  // true = ON, false = OFF. Default to ON if no data.
  const minutes = new Array(1440).fill(null);

  for (const interval of intervals) {
    const startMin = parseTimeToMinutes(interval.start);
    const endMin = parseTimeToMinutes(interval.end);

    for (let m = startMin; m < endMin; m++) {
      minutes[m] = interval.isOn;
    }
  }

  // Fill any null gaps with false (OFF) as a safe default
  for (let m = 0; m < 1440; m++) {
    if (minutes[m] === null) minutes[m] = false;
  }

  // Convert to hourly slots
  const slots = {};
  for (let hour = 0; hour < 24; hour++) {
    const slotKey = String(hour + 1); // "1" through "24"
    const firstHalfStart = hour * 60;       // XX:00
    const halfPoint = hour * 60 + 30;       // XX:30
    const secondHalfEnd = (hour + 1) * 60;  // XX+1:00

    // Check if first half (00-30) is all ON or all OFF
    const firstHalfOn = isAllStatus(minutes, firstHalfStart, halfPoint, true);
    const firstHalfOff = isAllStatus(minutes, firstHalfStart, halfPoint, false);

    // Check if second half (30-00) is all ON or all OFF
    const secondHalfOn = isAllStatus(minutes, halfPoint, secondHalfEnd, true);
    const secondHalfOff = isAllStatus(minutes, halfPoint, secondHalfEnd, false);

    if (firstHalfOn && secondHalfOn) {
      slots[slotKey] = 'yes';
    } else if (firstHalfOff && secondHalfOff) {
      slots[slotKey] = 'no';
    } else if (firstHalfOff && secondHalfOn) {
      // OFF first half, ON second half → "first" (no power first half)
      slots[slotKey] = 'first';
    } else if (firstHalfOn && secondHalfOff) {
      // ON first half, OFF second half → "second" (no power second half)
      slots[slotKey] = 'second';
    } else {
      // Mixed within a half — shouldn't happen with 30-min boundaries
      // Fall back to whichever has more OFF minutes
      const offCount = countStatus(minutes, firstHalfStart, secondHalfEnd, false);
      slots[slotKey] = offCount >= 30 ? 'no' : 'yes';
    }
  }

  return slots;
}

/**
 * Parse "HH:MM" to minutes from midnight
 */
function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  // Handle "24:00" as 1440
  return h * 60 + m;
}

/**
 * Check if all minutes in range [start, end) have the given status
 */
function isAllStatus(minutes, start, end, status) {
  for (let m = start; m < end; m++) {
    if (minutes[m] !== status) return false;
  }
  return true;
}

/**
 * Count minutes with given status in range [start, end)
 */
function countStatus(minutes, start, end, status) {
  let count = 0;
  for (let m = start; m < end; m++) {
    if (minutes[m] === status) count++;
  }
  return count;
}

/**
 * Get Unix timestamp for midnight of a given date in Kyiv timezone (UTC+2/UTC+3)
 * @param {Date} date
 * @returns {number} Unix timestamp in seconds
 */
function getDateTimestamp(date) {
  // Create a date at midnight UTC for the given date parts
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  // Midnight UTC for this date
  const utcMidnight = Date.UTC(year, month, day, 0, 0, 0, 0);
  return Math.floor(utcMidnight / 1000);
}

/**
 * Get today's and tomorrow's date strings
 * @returns {{ today: Date, tomorrow: Date }}
 */
function getDates() {
  // Use Kyiv timezone
  const now = new Date();
  const kyivNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));

  const today = new Date(kyivNow.getFullYear(), kyivNow.getMonth(), kyivNow.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return { today, tomorrow };
}

/**
 * Parse update time string "DD.MM.YYYY HH:MM" to ISO string
 * @param {string} updateStr - e.g. "04.03.2026 13:02"
 * @returns {string} ISO string
 */
function parseUpdateToISO(updateStr) {
  if (!updateStr) return new Date().toISOString();
  const match = updateStr.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
  if (!match) return new Date().toISOString();
  const [, day, month, year, hours, minutes] = match;
  // Create date in UTC+2 (Kyiv standard time)
  const date = new Date(`${year}-${month}-${day}T${hours}:${minutes}:00.000+02:00`);
  return date.toISOString();
}

/**
 * Full parse pipeline for a region
 */
async function parseRegion(regionConfig) {
  const regionId = regionConfig.path;
  const todayUrl = `${BASE_URL}/${regionConfig.path}`;
  const tomorrowUrl = `${BASE_URL}/${regionConfig.path}/grafik-na-zavtra`;

  console.log(`  Fetching today's schedule...`);
  const todayHtml = await fetchPage(todayUrl);
  const todayQueues = parseQueues(todayHtml);
  const updateTime = parseUpdateTime(todayHtml);

  const { today, tomorrow } = getDates();
  const todayTimestamp = getDateTimestamp(today);
  const tomorrowTimestamp = getDateTimestamp(tomorrow);

  // Convert today's queues to hourly format
  const todayData = {};
  for (const [queueId, intervals] of Object.entries(todayQueues)) {
    const gpvKey = `GPV${queueId}`;
    todayData[gpvKey] = convertToHourlySlots(intervals);
  }

  // Build result
  const result = {
    regionId,
    lastUpdated: parseUpdateToISO(updateTime),
    fact: {
      data: {
        [String(todayTimestamp)]: todayData,
      },
      update: updateTime,
      today: todayTimestamp,
    },
  };

  // Try to get tomorrow's schedule
  console.log(`  Fetching tomorrow's schedule...`);
  try {
    const tomorrowHtml = await fetchPage(tomorrowUrl);

    if (isTomorrowAvailable(tomorrowHtml)) {
      const tomorrowQueues = parseQueues(tomorrowHtml);
      const tomorrowData = {};
      for (const [queueId, intervals] of Object.entries(tomorrowQueues)) {
        const gpvKey = `GPV${queueId}`;
        tomorrowData[gpvKey] = convertToHourlySlots(intervals);
      }
      result.fact.data[String(tomorrowTimestamp)] = tomorrowData;
      console.log(`  ✓ Tomorrow's schedule found`);
    } else {
      console.log(`  ⚠ Tomorrow's schedule not published yet`);
    }
  } catch (err) {
    console.log(`  ⚠ Could not fetch tomorrow's schedule: ${err.message}`);
  }

  return result;
}

module.exports = {
  fetchPage,
  isTomorrowAvailable,
  parseUpdateTime,
  parseQueues,
  convertToHourlySlots,
  parseRegion,
  getDates,
  getDateTimestamp,
};
