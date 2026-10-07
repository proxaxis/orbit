import dayjs from '@/services/dayjs.js';

/** Google Calendar shared property used for rules that RRULE cannot express. */
export const HOLIDAY_ADJUSTMENT_PROPERTY = 'X-HANDY-HOLIDAY-ADJUSTMENT';

export const WEEKDAYS = [
  { value: 'MO', label: '月' },
  { value: 'TU', label: '火' },
  { value: 'WE', label: '水' },
  { value: 'TH', label: '木' },
  { value: 'FR', label: '金' },
  { value: 'SA', label: '土' },
  { value: 'SU', label: '日' },
];

const FREQUENCIES = new Set(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

function dateToken(value) {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYYMMDD') : '';
}

function normalizeDate(value) {
  if (!value) return '';
  const normalized = String(value).replace(/\D/g, '');
  if (/^\d{8}$/.test(normalized)) return normalized;
  return dateToken(value);
}

/** @param {string[]} values @returns {string[]} */
function uniqueSortedDates(values = []) {
  return [...new Set(values.map(normalizeDate).filter(Boolean))].sort();
}

/**
 * Build the Google Calendar recurrence array from UI values.
 * @param {{frequency: string, interval?: number|string, weekdays?: string[], monthDay?: number|string, month?: number|string, count?: number|string, until?: string, exclusions?: string[], holidayAdjustment?: string, isAllDay?: boolean, timeZone?: string, startDateTime?: unknown}} settings
 * @returns {{recurrence?: string[], shared: Record<string, string>}}
 */
export function buildRecurrence(settings) {
  const shared = {};
  if (settings.holidayAdjustment) shared[HOLIDAY_ADJUSTMENT_PROPERTY] = settings.holidayAdjustment;

  if (!FREQUENCIES.has(settings.frequency)) return { shared };

  const parts = [`FREQ=${settings.frequency}`];
  const interval = Math.max(1, Number(settings.interval) || 1);
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  const weekdays = (settings.weekdays ?? []).filter((day) => WEEKDAYS.some((item) => item.value === day));
  if (weekdays.length) parts.push(`BYDAY=${weekdays.join(',')}`);
  if (settings.frequency === 'MONTHLY' && settings.monthDay) parts.push(`BYMONTHDAY=${Math.min(31, Math.max(1, Number(settings.monthDay)))}`);
  if (settings.frequency === 'YEARLY' && settings.month) parts.push(`BYMONTH=${Math.min(12, Math.max(1, Number(settings.month)))}`);

  const count = Math.max(0, Math.floor(Number(settings.count) || 0));
  if (count >= 1) parts.push(`COUNT=${count}`);
  else if (settings.until) {
    const until = dateToken(settings.until);
    if (until) parts.push(`UNTIL=${until}${settings.isAllDay ? '' : 'T235959Z'}`);
  }

  const recurrence = [`RRULE:${parts.join(';')}`];
  const exclusions = uniqueSortedDates(settings.exclusions);
  if (exclusions.length) {
    if (settings.isAllDay) recurrence.push(`EXDATE;VALUE=DATE:${exclusions.join(',')}`);
    else {
      const time = dayjs(settings.startDateTime).format('THHmmss');
      const zone = settings.timeZone ? `;TZID=${settings.timeZone}` : '';
      recurrence.push(`EXDATE${zone}:${exclusions.map((date) => `${date}${time}`).join(',')}`);
    }
  }
  return { recurrence, shared };
}

/** @param {string[]|undefined} recurrence @param {Record<string, string>|undefined} shared */
export function parseRecurrence(recurrence = [], shared = {}) {
  const rrule = recurrence.find((line) => line.startsWith('RRULE:'))?.slice(6) ?? '';
  const values = Object.fromEntries(
    rrule
      .split(';')
      .filter(Boolean)
      .map((part) => part.split('=')),
  );
  const exclusions = recurrence
    .filter((line) => line.startsWith('EXDATE'))
    .flatMap((line) => line.split(':').slice(1).join(':').split(','))
    .map((value) => value.replace(/\D/g, '').slice(0, 8))
    .filter((value) => value.length === 8);
  const until = values.UNTIL?.slice(0, 8) ?? '';
  return {
    frequency: FREQUENCIES.has(values.FREQ) ? values.FREQ : '',
    interval: Number(values.INTERVAL) || 1,
    weekdays: values.BYDAY?.split(',').filter((day) => WEEKDAYS.some((item) => item.value === day)) ?? [],
    monthDay: Number(values.BYMONTHDAY) || '',
    month: Number(values.BYMONTH) || '',
    count: Number(values.COUNT) || '',
    until: until ? `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}` : '',
    exclusions: uniqueSortedDates(exclusions).map((value) => `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`),
    holidayAdjustment: shared?.[HOLIDAY_ADJUSTMENT_PROPERTY] ?? '',
  };
}

/** Move an occurrence to the next weekday when it falls on a configured holiday. */
export function moveToNextWeekday(date, holidays = []) {
  const holidaySet = new Set(uniqueSortedDates(holidays));
  let result = dayjs(date);
  while (result.day() === 0 || result.day() === 6 || holidaySet.has(result.format('YYYYMMDD'))) result = result.add(1, 'day');
  return result;
}

/** Move an occurrence to the previous weekday when it falls on a configured holiday. */
export function moveToPreviousWeekday(date, holidays = []) {
  const holidaySet = new Set(uniqueSortedDates(holidays));
  let result = dayjs(date);
  while (result.day() === 0 || result.day() === 6 || holidaySet.has(result.format('YYYYMMDD'))) result = result.subtract(1, 'day');
  return result;
}
