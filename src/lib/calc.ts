// All trading math lives here. Pure functions – no saving, no screens.
import type { Journal, Trade } from '../data/types';
import { istParts, startOfDayIST } from './time';

export interface CalcCtx {
  usdInr: number;
  contractSizes: Record<string, number>;
}

export type Result = 'win' | 'loss' | 'be';

export interface TradeCalc {
  dir: 1 | -1;
  contractSize: number;
  units: number; // quantity × contract size
  riskPerUnit: number;
  riskNative: number; // money at risk to the stop, in the trade's currency
  riskUsd: number;
  plannedRR?: number;
  pnlNative?: number;
  pnlUsd?: number;
  r?: number;
  result?: Result;
  holdMs?: number;
  rulesBroken: boolean;
  closed: boolean;
}

export function contractSizeFor(t: Pick<Trade, 'marketType' | 'symbol'>, ctx: CalcCtx): number {
  if (t.marketType !== 'crypto') return 1;
  const cs = ctx.contractSizes[t.symbol.trim().toUpperCase()];
  return cs && cs > 0 ? cs : 1;
}

export function toUsd(amount: number, marketType: Trade['marketType'], ctx: CalcCtx) {
  return marketType === 'stock' ? amount / ctx.usdInr : amount;
}

export function isRulesBroken(t: Pick<Trade, 'checklist'>): boolean {
  return !!t.checklist && Object.values(t.checklist).some((v) => !v);
}

export function calcTrade(t: Trade, ctx: CalcCtx): TradeCalc {
  const dir: 1 | -1 = t.side === 'long' ? 1 : -1;
  const contractSize = contractSizeFor(t, ctx);
  const units = (t.quantity || 0) * contractSize;
  const riskPerUnit = Math.abs(t.entry - t.stopLoss);
  const riskNative = riskPerUnit * units;
  const out: TradeCalc = {
    dir,
    contractSize,
    units,
    riskPerUnit,
    riskNative,
    riskUsd: toUsd(riskNative, t.marketType, ctx),
    rulesBroken: isRulesBroken(t),
    closed: false,
  };
  if (t.target != null && riskPerUnit > 0) {
    out.plannedRR = Math.abs(t.target - t.entry) / riskPerUnit;
  }
  if (t.status === 'closed' && t.exit != null && isFinite(t.exit)) {
    out.closed = true;
    const gross = (t.exit - t.entry) * units * dir;
    const pnl = gross - (t.fees || 0);
    out.pnlNative = round(pnl, 6);
    out.pnlUsd = toUsd(pnl, t.marketType, ctx);
    out.r = riskPerUnit > 0 ? (dir * (t.exit - t.entry)) / riskPerUnit : 0;
    out.result = Math.abs(pnl) < 1e-9 ? 'be' : pnl > 0 ? 'win' : 'loss';
    if (t.exitAt) out.holdMs = t.exitAt - t.entryAt;
  }
  return out;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** A trade together with its calculated numbers. */
export interface CT {
  t: Trade;
  c: TradeCalc;
}

export function withCalc(trades: Trade[], ctx: CalcCtx): CT[] {
  return trades.map((t) => ({ t, c: calcTrade(t, ctx) }));
}

/** Date used for stats: exit time for closed trades, otherwise entry time. */
export const tradeTime = (t: Trade) => (t.status === 'closed' && t.exitAt ? t.exitAt : t.entryAt);

export function closedSorted(list: CT[]): CT[] {
  return list.filter((x) => x.c.closed).sort((a, b) => tradeTime(a.t) - tradeTime(b.t));
}

export interface Stats {
  closed: number;
  open: number;
  wins: number;
  losses: number;
  be: number;
  winRate: number; // 0..1
  totalR: number;
  totalPnl: number;
  avgWinR: number;
  avgLossR: number;
  avgRR: number; // avg win R ÷ |avg loss R|
  expectancy: number; // R per trade
  expectancyUsd: number;
  currentStreak: { kind: Result | null; count: number };
  bestWinStreak: number;
  worstLossStreak: number;
  last10: Result[];
  maxDdR: number;
  maxDdUsd: number;
  avgHoldMs: number;
  equity: { r: number; usd: number; t: number }[]; // cumulative after each closed trade
  bestTrade?: CT;
  worstTrade?: CT;
}

export function computeStats(list: CT[]): Stats {
  const closed = closedSorted(list);
  const wins = closed.filter((x) => x.c.result === 'win');
  const losses = closed.filter((x) => x.c.result === 'loss');
  const be = closed.length - wins.length - losses.length;
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const totalR = sum(closed.map((x) => x.c.r ?? 0));
  const totalPnl = sum(closed.map((x) => x.c.pnlUsd ?? 0));
  const avgWinR = wins.length ? sum(wins.map((x) => x.c.r ?? 0)) / wins.length : 0;
  const avgLossR = losses.length ? sum(losses.map((x) => x.c.r ?? 0)) / losses.length : 0;

  // streaks
  let bestWin = 0;
  let worstLoss = 0;
  let run = 0;
  let runKind: Result | null = null;
  for (const x of closed) {
    const k = x.c.result!;
    if (k === runKind) run++;
    else {
      runKind = k;
      run = 1;
    }
    if (k === 'win') bestWin = Math.max(bestWin, run);
    if (k === 'loss') worstLoss = Math.max(worstLoss, run);
  }

  // equity & drawdown
  let cumR = 0;
  let cumUsd = 0;
  let peakR = 0;
  let peakUsd = 0;
  let maxDdR = 0;
  let maxDdUsd = 0;
  const equity = closed.map((x) => {
    cumR += x.c.r ?? 0;
    cumUsd += x.c.pnlUsd ?? 0;
    peakR = Math.max(peakR, cumR);
    peakUsd = Math.max(peakUsd, cumUsd);
    maxDdR = Math.min(maxDdR, cumR - peakR);
    maxDdUsd = Math.min(maxDdUsd, cumUsd - peakUsd);
    return { r: cumR, usd: cumUsd, t: tradeTime(x.t) };
  });

  const holds = closed.map((x) => x.c.holdMs).filter((h): h is number => h != null && h > 0);
  const byR = [...closed].sort((a, b) => (b.c.r ?? 0) - (a.c.r ?? 0));

  return {
    closed: closed.length,
    open: list.filter((x) => x.t.status === 'open').length,
    wins: wins.length,
    losses: losses.length,
    be,
    winRate: closed.length ? wins.length / closed.length : 0,
    totalR,
    totalPnl,
    avgWinR,
    avgLossR,
    avgRR: avgLossR !== 0 ? avgWinR / Math.abs(avgLossR) : 0,
    expectancy: closed.length ? totalR / closed.length : 0,
    expectancyUsd: closed.length ? totalPnl / closed.length : 0,
    currentStreak: { kind: runKind, count: run },
    bestWinStreak: bestWin,
    worstLossStreak: worstLoss,
    last10: closed.slice(-10).map((x) => x.c.result!),
    maxDdR,
    maxDdUsd,
    avgHoldMs: holds.length ? sum(holds) / holds.length : 0,
    equity,
    bestTrade: byR[0],
    worstTrade: byR[byR.length - 1],
  };
}

/* ---------------- Groupings ---------------- */

export interface Bucket {
  label: string;
  r: number;
  pnl: number;
  count: number;
  wins: number;
}

function bucketize(list: CT[], labels: string[], keyOf: (x: CT) => number | null): Bucket[] {
  const out = labels.map((label) => ({ label, r: 0, pnl: 0, count: 0, wins: 0 }));
  for (const x of closedSorted(list)) {
    const k = keyOf(x);
    if (k == null || !out[k]) continue;
    out[k].r += x.c.r ?? 0;
    out[k].pnl += x.c.pnlUsd ?? 0;
    out[k].count++;
    if (x.c.result === 'win') out[k].wins++;
  }
  return out;
}

export const byWeekday = (list: CT[], labels: string[]) =>
  bucketize(list, labels, (x) => istParts(x.t.entryAt).dow);

export const byTimeBlock = (list: CT[], labels: string[]) =>
  bucketize(list, labels, (x) => Math.floor(istParts(x.t.entryAt).h / 4));

export const byEmotion = (list: CT[], labels: string[]) =>
  bucketize(list, labels, (x) => (x.t.emotion ? x.t.emotion - 1 : null));

export function bestWorst(b: Bucket[]): { best?: Bucket; worst?: Bucket } {
  const used = b.filter((x) => x.count > 0);
  if (!used.length) return {};
  const sorted = [...used].sort((a, z) => z.r - a.r);
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}

export function mistakeStats(list: CT[]): { tag: string; count: number; r: number }[] {
  const map = new Map<string, { tag: string; count: number; r: number }>();
  for (const x of closedSorted(list)) {
    for (const tag of x.t.mistakes ?? []) {
      const m = map.get(tag) ?? { tag, count: 0, r: 0 };
      m.count++;
      m.r += x.c.r ?? 0;
      map.set(tag, m);
    }
  }
  return [...map.values()].sort((a, b) => a.r - b.r || b.count - a.count);
}

export interface RuleSplit {
  count: number;
  r: number;
  winRate: number;
}

export function rulesSplit(list: CT[]): { followed: RuleSplit; broken: RuleSplit } {
  const closed = closedSorted(list);
  const mk = (arr: CT[]): RuleSplit => ({
    count: arr.length,
    r: arr.reduce((s, x) => s + (x.c.r ?? 0), 0),
    winRate: arr.length ? arr.filter((x) => x.c.result === 'win').length / arr.length : 0,
  });
  return {
    followed: mk(closed.filter((x) => !x.c.rulesBroken)),
    broken: mk(closed.filter((x) => x.c.rulesBroken)),
  };
}

export function gradeCounts(list: CT[]) {
  const g = { A: 0, B: 0, C: 0 };
  for (const x of list) if (x.t.grade) g[x.t.grade]++;
  return g;
}

/* ---------------- Daily risk ---------------- */

export interface DailyRisk {
  tradesToday: number;
  maxTrades: number;
  pnlToday: number; // $
  rToday: number;
  lossUsed: number; // in the limit's unit ($ or R)
  limit: number;
  unit: '$' | 'R';
  maxTradesHit: boolean;
  lossLimitHit: boolean;
}

export function dailyRisk(list: CT[], j: Journal, now = Date.now()): DailyRisk {
  const sod = startOfDayIST(now);
  const tradesToday = list.filter((x) => x.t.entryAt >= sod).length;
  const closedToday = list.filter((x) => x.c.closed && tradeTime(x.t) >= sod);
  const pnlToday = closedToday.reduce((s, x) => s + (x.c.pnlUsd ?? 0), 0);
  const rToday = closedToday.reduce((s, x) => s + (x.c.r ?? 0), 0);
  const lossUsed = j.dailyLossUnit === 'R' ? Math.max(0, -rToday) : Math.max(0, -pnlToday);
  return {
    tradesToday,
    maxTrades: j.maxTradesPerDay,
    pnlToday,
    rToday,
    lossUsed,
    limit: j.dailyLossLimit,
    unit: j.dailyLossUnit,
    maxTradesHit: j.maxTradesPerDay > 0 && tradesToday >= j.maxTradesPerDay,
    lossLimitHit: j.dailyLossLimit > 0 && lossUsed >= j.dailyLossLimit,
  };
}

/* ---------------- Position size ---------------- */

export interface SizeInput {
  balance: number; // in trade currency
  riskPct: number;
  entry: number;
  stopLoss: number;
  leverage: number;
  contractSize: number;
}

export function positionSize(i: SizeInput) {
  const riskAmount = (i.balance * i.riskPct) / 100;
  const perUnit = Math.abs(i.entry - i.stopLoss);
  if (!(perUnit > 0) || !(i.entry > 0)) return null;
  const units = riskAmount / perUnit;
  const qty = units / (i.contractSize || 1);
  const value = units * i.entry;
  const margin = value / (i.leverage > 0 ? i.leverage : 1);
  return { riskAmount, units, qty, value, margin, slPct: (perUnit / i.entry) * 100 };
}
