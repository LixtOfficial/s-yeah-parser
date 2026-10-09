/** Build minimal HTML that mirrors the real bezsvitla.com.ua markup (2026-10). */

const slot = ([time, on]) => `
  <div class="bz-schedule-slot bz-schedule-slot--${on ? 'on' : 'off'} bz-schedule-slot--past">
    <span class="bz-schedule-slot__time">${time}</span>
    <span class="bz-schedule-slot__badge" role="img" aria-label="${on ? 'Є світло' : 'Без світла'}" title="${on ? 'Є світло' : 'Без світла'}"><svg></svg></span>
  </div>`;

export const card = (queue, slots) => `
  <article class="bz-schedule-card">
    <a href="/x" class="bz-schedule-card__head">
      <span class="bz-schedule-card__heading"><span class="bz-schedule-card__label">Графік</span><strong>Черга ${queue}</strong></span>
    </a>
    <div class="bz-schedule-card__body">${slots.map(slot).join('')}</div>
    <footer><span class="bz-schedule-card__updated"><span>Оновлено 09.10.2026 01:39</span></span></footer>
  </article>`;

export const page = ({ period = 'today', updated = '09.10.2026 18:52', body = '' } = {}) => `<!DOCTYPE html>
<html><body>
  <h1 class="bz-schedule-hero__title">Графік <span class="bz-schedule-hero__period bz-schedule-hero__period--${period}">x</span></h1>
  <p class="bz-schedule-hero__updated"><span>icon</span> Оновлено: <span class="text-nowrap">${updated}</span></p>
  ${body}
</body></html>`;

export const emptyPage = (period) =>
  page({
    period,
    body: `<div class="bz-schedule-empty"><div class="bz-schedule-empty__copy"><strong>Графік відключень на ${period === 'today' ? 'сьогодні' : 'завтра'} ще не опублікований.</strong></div></div>`,
  });

export const FULL_DAY_ON = [['00:00 – 24:00', true]];
export const SAMPLE_DAY = [
  ['00:00 – 01:30', false],
  ['01:30 – 18:00', true],
  ['18:00 – 24:00', false],
];
