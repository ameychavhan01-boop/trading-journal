// Everything is shown in India time (IST = UTC+5:30, no daylight saving),
// always in 12-hour format with AM/PM.

export const IST_OFFSET = 5.5 * 60 * 60 * 1000;
export const DAY = 24 * 60 * 60 * 1000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export interface ISTParts {
  y: number;
  m: number; // 0..11
  d: number;
  h: number; // 0..23
  min: number;
  dow: number; // 0 = Monday .. 6 = Sunday
}

export function istParts(ms: number): ISTParts {
  const x = new Date(ms + IST_OFFSET);
  return {
    y: x.getUTCFullYear(),
    m: x.getUTCMonth(),
    d: x.getUTCDate(),
    h: x.getUTCHours(),
    min: x.getUTCMinutes(),
    dow: (x.getUTCDay() + 6) % 7,
  };
}

/** Epoch ms for a date/time typed in IST. */
export function fromIST(y: number, m: number, d: number, h = 0, min = 0): number {
  return Date.UTC(y, m, d, h, min) - IST_OFFSET;
}

export function startOfDayIST(ms: number): number {
  const p = istParts(ms);
  return fromIST(p.y, p.m, p.d);
}

/** Monday 12:00 AM IST of the week containing ms. */
export function startOfWeekIST(ms: number): number {
  const p = istParts(ms);
  return fromIST(p.y, p.m, p.d - p.dow);
}

export function startOfMonthIST(ms: number): number {
  const p = istParts(ms);
  return fromIST(p.y, p.m, 1);
}

export function fmtTime(ms: number): string {
  const p = istParts(ms);
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${h12}:${String(p.min).padStart(2, '0')} ${p.h < 12 ? 'AM' : 'PM'}`;
}

export function fmtDate(ms: number, withYear = false): string {
  const p = istParts(ms);
  return `${MONTHS[p.m]} ${p.d}${withYear ? `, ${p.y}` : ''}`;
}

export function fmtDateTime(ms: number): string {
  return `${fmtDate(ms, true)} · ${fmtTime(ms)}`;
}

export function fmtMonth(ms: number): string {
  const p = istParts(ms);
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][p.m]} ${p.y}`;
}

export function fmtRange(from: number, to: number): string {
  const a = istParts(from);
  const b = istParts(to);
  if (a.y === b.y) return `${fmtDate(from)} – ${fmtDate(to, true)}`;
  return `${fmtDate(from, true)} – ${fmtDate(to, true)}`;
}

/** "2h 15m", "3d 4h" */
export function fmtDuration(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return '–';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

/** 'YYYY-MM-DD' (IST) for <input type="date"> */
export function toDateInput(ms: number): string {
  const p = istParts(ms);
  return `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

export function fromDateInput(s: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return undefined;
  return fromIST(+m[1], +m[2] - 1, +m[3]);
}

/** 4-hour IST blocks used on the dashboard */
export const TIME_BLOCKS = ['12–4 AM', '4–8 AM', '8 AM–12 PM', '12–4 PM', '4–8 PM', '8 PM–12 AM'];
export const TIME_BLOCKS_LONG = ['12 AM – 4 AM', '4 AM – 8 AM', '8 AM – 12 PM', '12 PM – 4 PM', '4 PM – 8 PM', '8 PM – 12 AM'];
