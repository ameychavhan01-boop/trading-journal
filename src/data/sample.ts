// Example journals + trades so the dashboard can be previewed. Everything is
// flagged isSample so "Delete all sample data" can remove it cleanly.
import { db } from './db';
import { getSettings, uid, updateSettings } from './api';
import { STRATEGY_TEMPLATES } from './defaults';
import type { Journal, Trade } from './types';
import { DAY, fromIST, istParts } from '../lib/time';

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CRYPTO = [
  { symbol: 'BTCUSD', price: 92000, cs: 0.001 },
  { symbol: 'ETHUSD', price: 3300, cs: 0.01 },
];
const STOCKS = [
  { symbol: 'RELIANCE', price: 1510 },
  { symbol: 'HDFCBANK', price: 1720 },
  { symbol: 'TCS', price: 4150 },
  { symbol: 'INFY', price: 1890 },
];
const NOTES_WHY = ['Clean pullback to the 20 EMA with a strong close.', 'Retest of the breakout level held.', 'Rejection at VWAP in trend direction.'];
const NOTES_LESSON = ['Let winners run to target.', 'Wait for the candle to close.', 'Skip trades after two losses.'];

interface GenOpts {
  journalId: string;
  count: number;
  days: number;
  winRate: number;
  strategyIds: string[];
  riskUsd: number;
  usdInr: number;
  seed: number;
  cryptoOnly?: boolean;
  todayTrades?: number;
}

function genTrades(o: GenOpts): Trade[] {
  const r = rng(o.seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const now = Date.now();
  const today = istParts(now);
  const out: Trade[] = [];
  for (let i = 0; i < o.count; i++) {
    const isToday = o.todayTrades != null && i >= o.count - o.todayTrades;
    const crypto = o.cryptoOnly || r() < 0.7;
    const inst = crypto ? pick(CRYPTO) : pick(STOCKS);
    const side = r() < 0.55 ? 'long' : 'short';
    const dir = side === 'long' ? 1 : -1;
    const price = inst.price * (0.95 + r() * 0.1);
    const dist = price * (0.004 + r() * 0.008);
    const cs: number = 'cs' in inst ? (inst.cs as number) : 1;
    const riskNative = crypto ? o.riskUsd : o.riskUsd * o.usdInr;
    const qty = Math.max(1, Math.round(riskNative / (dist * cs)));
    // outcome in R
    const roll = r();
    let R: number;
    if (roll < o.winRate) R = 0.4 + r() * 2.6;
    else if (roll < o.winRate + 0.04) R = 0;
    else R = -(0.7 + r() * 0.35);
    const entry = +price.toFixed(crypto ? 1 : 1);
    const stopLoss = +(entry - dir * dist).toFixed(1);
    const realDist = Math.abs(entry - stopLoss);
    const exit = +(entry + dir * R * realDist).toFixed(1);
    const target = +(entry + dir * 2 * realDist).toFixed(1);
    // time
    let entryAt: number;
    if (isToday) {
      entryAt = fromIST(today.y, today.m, today.d, Math.min(today.h, 9 + i - (o.count - o.todayTrades!)) , Math.floor(r() * 50));
      if (entryAt > now) entryAt = now - (o.count - i) * 20 * 60000;
    } else {
      const dayAgo = Math.floor(((o.count - i) / o.count) * o.days) + 1;
      const d = istParts(now - dayAgo * DAY);
      const hour = crypto ? pick([1, 6, 10, 13, 15, 17, 18, 19, 21, 22]) : pick([9, 10, 11, 13, 14]);
      entryAt = fromIST(d.y, d.m, d.d, hour, Math.floor(r() * 60));
    }
    const exitAt = entryAt + (crypto ? (0.5 + r() * 8) : 0.3 + r() * 4) * 3600 * 1000;
    const strategyId = pick(o.strategyIds);
    const tpl = STRATEGY_TEMPLATES.find((s) => s.id === strategyId)!;
    const broken = R < 0 ? r() < 0.35 : r() < 0.08;
    const checklist = Object.fromEntries(tpl.checklist.map((rule, k) => [rule, !(broken && k === tpl.checklist.length - 2)]));
    const emotion = R < 0 ? Math.min(5, 2 + Math.floor(r() * 4)) : 1 + Math.floor(r() * 3);
    const mistakes: string[] = [];
    if (R > 0 && R < 1 && r() < 0.6) mistakes.push('Exited early');
    if (R < 0 && r() < 0.25) mistakes.push('Moved stop loss');
    if (R < 0 && r() < 0.2) mistakes.push('No setup / FOMO');
    if (R < 0 && r() < 0.1) mistakes.push('Revenge trade');
    const grade = broken ? 'C' : mistakes.length ? 'B' : r() < 0.75 ? 'A' : 'B';
    out.push({
      id: uid(),
      journalId: o.journalId,
      marketType: crypto ? 'crypto' : 'stock',
      symbol: inst.symbol,
      side,
      status: 'closed',
      strategyId,
      entryTf: crypto ? pick(['15m', '1H', '4H']) : pick(['5m', '15m', 'Daily']),
      htfTrend: side === 'long' ? 'up' : r() < 0.7 ? 'down' : 'range',
      entry,
      stopLoss,
      target,
      exit,
      quantity: qty,
      leverage: crypto ? pick([10, 20, 25]) : undefined,
      fees: crypto ? +(qty * cs * entry * 0.0002).toFixed(2) : +(20 + r() * 20).toFixed(0),
      entryAt,
      exitAt: isToday ? Math.min(exitAt, now - 60000) : exitAt,
      checklist,
      emotion,
      mistakes,
      grade,
      notes: r() < 0.3 ? { why: pick(NOTES_WHY), lesson: pick(NOTES_LESSON) } : {},
      isSample: true,
      createdAt: entryAt,
      updatedAt: entryAt,
    });
  }
  return out;
}

/** Creates two sample journals. Returns the id of the "live" sample journal. */
export async function loadSampleData(): Promise<string> {
  const settings = await getSettings();
  const order = await db.journals.count();
  const live: Journal = {
    id: uid(),
    name: 'Live – Real (Sample)',
    type: 'Live',
    startingBalance: 1000,
    riskPct: 1,
    dailyLossLimit: 3,
    dailyLossUnit: 'R',
    maxTradesPerDay: 3,
    isSample: true,
    order,
    createdAt: Date.now(),
  };
  const bt: Journal = {
    ...live,
    id: uid(),
    name: 'Backtest – 1H (Sample)',
    type: 'Backtest',
    dailyLossLimit: 0,
    maxTradesPerDay: 0,
    order: order + 1,
  };
  const liveTrades = genTrades({
    journalId: live.id,
    count: 42,
    days: 30,
    winRate: 0.42,
    strategyIds: ['tpl-trend-pullback', 'tpl-breakout-retest', 'tpl-vwap-pullback', 'tpl-orb'],
    riskUsd: 10,
    usdInr: settings.usdInr,
    seed: 7,
    todayTrades: 2,
  });
  const btTrades = genTrades({
    journalId: bt.id,
    count: 120,
    days: 180,
    winRate: 0.45,
    strategyIds: ['tpl-trend-pullback'],
    riskUsd: 10,
    usdInr: settings.usdInr,
    seed: 42,
    cryptoOnly: true,
  });
  const now = Date.now();
  const open: Trade[] = [
    {
      id: uid(),
      journalId: live.id,
      marketType: 'crypto',
      symbol: 'BTCUSD',
      side: 'short',
      status: 'open',
      strategyId: 'tpl-breakout-retest',
      entryTf: '1H',
      entry: 92840,
      stopLoss: 93310,
      target: 91900,
      quantity: 21,
      leverage: 20,
      entryAt: now - 2 * 3600 * 1000,
      checklist: Object.fromEntries(STRATEGY_TEMPLATES[1].checklist.map((c) => [c, true])),
      emotion: 2,
      isSample: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid(),
      journalId: live.id,
      marketType: 'stock',
      symbol: 'RELIANCE',
      side: 'long',
      status: 'open',
      strategyId: 'tpl-trend-pullback',
      entryTf: 'Daily',
      entry: 1512,
      stopLoss: 1488,
      target: 1560,
      quantity: 35,
      entryAt: now - 3 * DAY,
      checklist: Object.fromEntries(STRATEGY_TEMPLATES[0].checklist.map((c) => [c, true])),
      emotion: 1,
      isSample: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
  await db.transaction('rw', db.journals, db.trades, async () => {
    await db.journals.bulkPut([live, bt]);
    await db.trades.bulkPut([...liveTrades, ...btTrades, ...open]);
  });
  await updateSettings({ activeJournalId: live.id });
  return live.id;
}
