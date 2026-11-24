import type { CT } from './calc';
import { tradeTime } from './calc';
import { istParts, fromIST, startOfMonthIST, startOfWeekIST, DAY, fmtRange, fmtMonth } from './time';

export interface Period {
  key: string; // 'w:<ms>' or 'm:YYYY-MM'
  kind: 'week' | 'month';
  from: number;
  to: number; // exclusive
  label: string;
}

export function weekPeriod(ms: number): Period {
  const from = startOfWeekIST(ms);
  return { key: `w:${from}`, kind: 'week', from, to: from + 7 * DAY, label: fmtRange(from, from + 6 * DAY) };
}

export function monthPeriod(ms: number): Period {
  const from = startOfMonthIST(ms);
  const p = istParts(from);
  const to = fromIST(p.y, p.m + 1, 1);
  return { key: `m:${p.y}-${String(p.m + 1).padStart(2, '0')}`, kind: 'month', from, to, label: fmtMonth(from) };
}

/** Completed periods (newest first) that have at least one closed trade. */
export function periodsWithTrades(list: CT[], kind: 'week' | 'month', now = Date.now()): Period[] {
  const mk = kind === 'week' ? weekPeriod : monthPeriod;
  const map = new Map<string, Period>();
  for (const x of list) {
    if (!x.c.closed) continue;
    const p = mk(tradeTime(x.t));
    map.set(p.key, p);
  }
  // include the current (running) period as well
  const cur = mk(now);
  return [...map.values()].sort((a, b) => b.from - a.from).map((p) => (p.key === cur.key ? { ...p, label: p.label + ' (so far)' } : p));
}

/** The most recently FINISHED week / month, if it had trades. */
export function lastFinished(list: CT[], kind: 'week' | 'month', now = Date.now()): Period | undefined {
  const mk = kind === 'week' ? weekPeriod : monthPeriod;
  const cur = mk(now);
  const prev = mk(cur.from - 1);
  const has = list.some((x) => x.c.closed && tradeTime(x.t) >= prev.from && tradeTime(x.t) < prev.to);
  return has ? prev : undefined;
}

export const inPeriod = (list: CT[], p: { from: number; to: number }) =>
  list.filter((x) => {
    const t = tradeTime(x.t);
    return t >= p.from && t < p.to;
  });
