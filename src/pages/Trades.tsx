import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Filter, Plus, Search, X } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { TradeTable, type SortKey } from '../components/TradeTable';
import { useApp } from '../state/AppContext';
import { useCalcTrades, useStrategyMap } from '../state/hooks';
import { tradeTime, type CT } from '../lib/calc';
import { fromDateInput, DAY } from '../lib/time';
import { tradesCsv } from '../lib/csv';
import { saveFile, stamp } from '../lib/files';

interface Filters {
  journal: string; // id or 'all'
  q: string;
  market: '' | 'crypto' | 'stock';
  symbol: string;
  strategy: string;
  side: '' | 'long' | 'short';
  status: '' | 'open' | 'closed';
  result: '' | 'win' | 'loss' | 'be';
  tag: string;
  grade: '' | 'A' | 'B' | 'C';
  rulesBroken: '' | 'yes' | 'no';
  from: string;
  to: string;
}

const EMPTY: Omit<Filters, 'journal'> = {
  q: '',
  market: '',
  symbol: '',
  strategy: '',
  side: '',
  status: '',
  result: '',
  tag: '',
  grade: '',
  rulesBroken: '',
  from: '',
  to: '',
};

export default function Trades() {
  const { journals, active, isUnlocked, settings, toast } = useApp();
  const accessible = journals.filter(isUnlocked);
  const [f, setF] = useState<Filters>({ journal: active?.id ?? 'all', ...EMPTY });
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  const ids = f.journal === 'all' ? accessible.map((j) => j.id) : accessible.some((j) => j.id === f.journal) ? [f.journal] : [];
  const trades = useCalcTrades(ids);
  const strategies = useStrategyMap();

  const rows = useMemo(() => {
    if (!trades) return [];
    const q = f.q.trim().toLowerCase();
    const from = f.from ? fromDateInput(f.from) : undefined;
    const to = f.to ? (fromDateInput(f.to) ?? 0) + DAY : undefined;
    const out = trades.filter(({ t, c }) => {
      if (q) {
        const hay = [t.symbol, t.strategyId ? strategies.get(t.strategyId)?.name : '', t.notes?.why, t.notes?.well, t.notes?.lesson, ...(t.mistakes ?? [])]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (f.market && t.marketType !== f.market) return false;
      if (f.symbol && t.symbol !== f.symbol) return false;
      if (f.strategy && (f.strategy === 'none' ? !!t.strategyId : t.strategyId !== f.strategy)) return false;
      if (f.side && t.side !== f.side) return false;
      if (f.status && t.status !== f.status) return false;
      if (f.result && c.result !== f.result) return false;
      if (f.tag && !(t.mistakes ?? []).includes(f.tag)) return false;
      if (f.grade && t.grade !== f.grade) return false;
      if (f.rulesBroken && c.rulesBroken !== (f.rulesBroken === 'yes')) return false;
      const tt = tradeTime(t);
      if (from != null && tt < from) return false;
      if (to != null && tt >= to) return false;
      return true;
    });
    const val = (x: CT): number | string => {
      switch (sort.key) {
        case 'symbol':
          return x.t.symbol;
        case 'r':
          return x.c.r ?? -Infinity;
        case 'pnl':
          return x.c.pnlUsd ?? -Infinity;
        case 'grade':
          return x.t.grade ?? 'Z';
        default:
          return x.t.entryAt;
      }
    };
    return out.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [trades, f, sort, strategies]);

  const symbols = useMemo(() => Array.from(new Set((trades ?? []).map((x) => x.t.symbol))).sort(), [trades]);
  const activeFilterCount = Object.entries(EMPTY).filter(([k]) => k !== 'q' && f[k as keyof Filters] !== '').length;
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((cur) => ({ ...cur, [k]: v }));

  const exportCsv = async () => {
    try {
      await saveFile(tradesCsv(rows, journals, strategies, settings.usdInr), `trades-${stamp()}.csv`);
      toast(`Exported ${rows.length} trades`);
    } catch {
      /* cancelled */
    }
  };

  const sel = (k: keyof Filters, label: string, options: [string, string][]) => (
    <div className="field">
      <label>{label}</label>
      <select className="input" value={f[k]} onChange={(e) => set(k, e.target.value as never)}>
        <option value="">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="page">
      <PageHeader
        title="Trades"
        subtitle={`${rows.length} trade${rows.length === 1 ? '' : 's'}`}
        actions={
          <>
            <button className="btn" onClick={exportCsv} disabled={!rows.length}>
              <Download size={17} /> <span className="hide-mobile">Export CSV</span>
            </button>
            <Link to="/add" className="btn primary hide-mobile">
              <Plus size={17} /> Add trade
            </Link>
          </>
        }
      />

      <div className="card">
        <div className="row wrap" style={{ gap: 10 }}>
          <div className="row" style={{ flex: '1 1 260px', position: 'relative' }}>
            <Search size={17} style={{ position: 'absolute', left: 12 }} className="faint" />
            <input className="input" style={{ paddingLeft: 38 }} placeholder="Search symbol, strategy, notes, tags…" value={f.q} onChange={(e) => set('q', e.target.value)} />
          </div>
          <select className="input" style={{ flex: '0 1 220px' }} value={f.journal} onChange={(e) => set('journal', e.target.value)}>
            {accessible.length > 1 && <option value="all">All journals</option>}
            {accessible.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
          <button className={`btn ${activeFilterCount ? 'primary' : ''}`} onClick={() => setShowFilters((v) => !v)}>
            <Filter size={17} /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </button>
          {activeFilterCount > 0 && (
            <button className="btn ghost" onClick={() => setF((cur) => ({ ...cur, ...EMPTY, q: cur.q }))}>
              <X size={16} /> Clear
            </button>
          )}
        </div>
        {showFilters && (
          <div className="form-grid" style={{ marginTop: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
            {sel('market', 'Market', [
              ['crypto', 'Crypto'],
              ['stock', 'Indian stock'],
            ])}
            {sel('symbol', 'Symbol', symbols.map((s) => [s, s]))}
            {sel('strategy', 'Strategy', [['none', 'No strategy'], ...[...strategies.values()].map((s) => [s.id, s.name] as [string, string])])}
            {sel('side', 'Side', [
              ['long', 'Long'],
              ['short', 'Short'],
            ])}
            {sel('status', 'Status', [
              ['open', 'Open'],
              ['closed', 'Closed'],
            ])}
            {sel('result', 'Result', [
              ['win', 'Win'],
              ['loss', 'Loss'],
              ['be', 'Breakeven'],
            ])}
            {sel('tag', 'Mistake tag', settings.mistakeTags.map((t) => [t, t]))}
            {sel('grade', 'Grade', [
              ['A', 'A'],
              ['B', 'B'],
              ['C', 'C'],
            ])}
            {sel('rulesBroken', 'Rules', [
              ['yes', 'Rules broken'],
              ['no', 'Rules followed'],
            ])}
            <div className="field">
              <label>From date</label>
              <input type="date" className="input" value={f.from} onChange={(e) => set('from', e.target.value)} />
            </div>
            <div className="field">
              <label>To date</label>
              <input type="date" className="input" value={f.to} onChange={(e) => set('to', e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <TradeTable
          rows={rows}
          strategies={strategies}
          journals={f.journal === 'all' ? journals : undefined}
          sort={sort}
          onSort={(key) => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : -1 }))}
        />
      </div>
    </div>
  );
}
