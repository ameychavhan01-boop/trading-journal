import { useMemo } from 'react';
import { useStrategies, useTrades } from '../data/api';
import { withCalc, type CT } from '../lib/calc';
import { useApp } from './AppContext';

/** Trades (with calculations) for the given journals. */
export function useCalcTrades(journalIds: string[] | undefined): CT[] | undefined {
  const { ctx } = useApp();
  const trades = useTrades(journalIds);
  return useMemo(() => (trades ? withCalc(trades, ctx) : undefined), [trades, ctx.usdInr, ctx.contractSizes]);
}

export function useActiveTrades(): CT[] | undefined {
  const { active } = useApp();
  return useCalcTrades(active ? [active.id] : []);
}

export function useStrategyMap() {
  const list = useStrategies();
  return useMemo(() => new Map((list ?? []).map((s) => [s.id, s])), [list]);
}
