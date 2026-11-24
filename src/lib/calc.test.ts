import { describe, expect, it } from 'vitest';
import { calcTrade, computeStats, dailyRisk, positionSize, withCalc } from './calc';
import { fmtTime, fromIST, istParts } from './time';
import type { Journal, Trade } from '../data/types';

const ctx = { usdInr: 85, contractSizes: { BTCUSD: 0.001 } };

const base: Trade = {
  id: '1',
  journalId: 'j',
  marketType: 'crypto',
  symbol: 'BTCUSD',
  side: 'long',
  status: 'closed',
  entry: 100,
  stopLoss: 90,
  quantity: 10,
  exit: 120,
  entryAt: 0,
  exitAt: 3600_000,
  createdAt: 0,
  updatedAt: 0,
};

describe('trade calculations', () => {
  it('long: P&L, R and planned R:R', () => {
    const c = calcTrade({ ...base, symbol: 'ETH', target: 130, fees: 5 }, ctx);
    expect(c.pnlNative).toBe((120 - 100) * 10 - 5);
    expect(c.r).toBe(2);
    expect(c.plannedRR).toBe(3);
    expect(c.result).toBe('win');
  });

  it('short: reverse direction', () => {
    const c = calcTrade({ ...base, symbol: 'ETH', side: 'short', entry: 100, stopLoss: 110, exit: 95 }, ctx);
    expect(c.pnlNative).toBe(50);
    expect(c.r).toBe(0.5);
  });

  it('uses Delta contract size', () => {
    const c = calcTrade({ ...base, entry: 90000, stopLoss: 89500, exit: 91000, quantity: 20 }, ctx);
    expect(c.pnlUsd).toBeCloseTo(1000 * 20 * 0.001);
    expect(c.riskUsd).toBeCloseTo(500 * 20 * 0.001);
  });

  it('stocks are converted from ₹ to $', () => {
    const c = calcTrade({ ...base, marketType: 'stock', symbol: 'TCS', entry: 1000, stopLoss: 990, exit: 1017, quantity: 50 }, ctx);
    expect(c.pnlNative).toBe(850);
    expect(c.pnlUsd).toBeCloseTo(10);
  });

  it('unticked checklist = rules broken', () => {
    expect(calcTrade({ ...base, checklist: { a: true, b: false } }, ctx).rulesBroken).toBe(true);
    expect(calcTrade({ ...base, checklist: { a: true } }, ctx).rulesBroken).toBe(false);
  });

  it('open trades have no P&L', () => {
    const c = calcTrade({ ...base, status: 'open', exit: undefined }, ctx);
    expect(c.closed).toBe(false);
    expect(c.pnlUsd).toBeUndefined();
  });
});

describe('stats', () => {
  const t = (r: number, i: number): Trade => ({ ...base, id: String(i), symbol: 'X', exit: 100 + r * 10, exitAt: i * 1000 });
  const list = withCalc([t(2, 1), t(-1, 2), t(-1, 3), t(3, 4), t(1, 5)], ctx);
  const s = computeStats(list);
  it('win rate, expectancy, streaks, drawdown', () => {
    expect(s.wins).toBe(3);
    expect(s.losses).toBe(2);
    expect(s.winRate).toBeCloseTo(0.6);
    expect(s.totalR).toBeCloseTo(4);
    expect(s.expectancy).toBeCloseTo(0.8);
    expect(s.avgWinR).toBeCloseTo(2);
    expect(s.avgLossR).toBeCloseTo(-1);
    expect(s.avgRR).toBeCloseTo(2);
    expect(s.currentStreak).toEqual({ kind: 'win', count: 2 });
    expect(s.worstLossStreak).toBe(2);
    expect(s.maxDdR).toBeCloseTo(-2);
  });
});

describe('daily risk', () => {
  it('counts today trades and loss in R', () => {
    const now = Date.now();
    const j = { dailyLossLimit: 3, dailyLossUnit: 'R', maxTradesPerDay: 2 } as Journal;
    const list = withCalc(
      [
        { ...base, symbol: 'X', entryAt: now - 1000, exitAt: now - 500, exit: 90 },
        { ...base, id: '2', symbol: 'X', entryAt: now - 900, exitAt: now - 400, exit: 80 },
      ],
      ctx,
    );
    const d = dailyRisk(list, j, now);
    expect(d.tradesToday).toBe(2);
    expect(d.maxTradesHit).toBe(true);
    expect(d.lossUsed).toBeCloseTo(3);
    expect(d.lossLimitHit).toBe(true);
  });
});

describe('position size', () => {
  it('risk 1% of $1000 with $10 stop = 1 unit', () => {
    const r = positionSize({ balance: 1000, riskPct: 1, entry: 100, stopLoss: 90, leverage: 10, contractSize: 1 })!;
    expect(r.qty).toBeCloseTo(1);
    expect(r.value).toBeCloseTo(100);
    expect(r.margin).toBeCloseTo(10);
  });
});

describe('IST time', () => {
  it('formats in 12-hour IST', () => {
    const ms = fromIST(2026, 10, 23, 18, 15);
    expect(fmtTime(ms)).toBe('6:15 PM');
    expect(fmtTime(fromIST(2026, 10, 23, 0, 5))).toBe('12:05 AM');
    expect(istParts(ms).dow).toBe(0); // Nov 23 2026 is a Monday
  });
});
