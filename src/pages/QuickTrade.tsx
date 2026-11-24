// Quick trade: fixed-money backtesting. One-time setup, then per trade only
// asset, entry, target, entry/exit date & time and the result.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, Pencil, Plus, Settings2, AlertTriangle } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { Seg } from '../components/inputs';
import { DateStrip, TimeGrid, combine, type TimeValue } from '../components/QuickTime';
import { useApp } from '../state/AppContext';
import { useCalcTrades } from '../state/hooks';
import { saveJournal, saveTrade, uid, updateSettings, useStrategies } from '../data/api';
import type { MarketType, QuickSetup, Trade } from '../data/types';
import { TIMEFRAMES } from '../data/defaults';
import { contractSizeFor } from '../lib/calc';
import { fmtInr, fmtNum, fmtUsd, parseNum } from '../lib/format';
import { DAY, fmtDate, fmtTime, istParts, startOfDayIST } from '../lib/time';

const DEFAULT_QUICK: QuickSetup = {
  done: false,
  targetInr: 5000,
  rrList: [2, 2.5, 3],
  rr: 2.5,
  timeframe: '1H',
  assets: [
    { symbol: 'BTCUSD', market: 'crypto' },
    { symbol: 'ETHUSD', market: 'crypto' },
  ],
  asset: 'BTCUSD',
  dir: 'fwd',
};

const rrLabel = (rr: number) => `1:${+rr.toFixed(2)}`;

export default function QuickTrade() {
  const { settings } = useApp();
  const setup: QuickSetup = { ...DEFAULT_QUICK, ...(settings.quick ?? {}) };
  const [editing, setEditing] = useState(false);
  if (!setup.done || editing) return <SetupPage setup={setup} onDone={() => setEditing(false)} />;
  return <TradeScreen setup={setup} onEditSetup={() => setEditing(true)} />;
}

/* ====================== Setup (one time) ====================== */

function SetupPage({ setup, onDone }: { setup: QuickSetup; onDone: () => void }) {
  const { journals, isUnlocked, settings, toast } = useApp();
  const strategies = (useStrategies() ?? []).filter((s) => !s.hidden);
  const accessible = journals.filter(isUnlocked);
  const defaultJournal =
    accessible.find((j) => j.id === setup.journalId) ?? accessible.find((j) => j.type.toLowerCase() === 'backtest') ?? accessible[0];
  const [journalId, setJournalId] = useState(defaultJournal?.id ?? '');
  const journal = accessible.find((j) => j.id === journalId);
  const [target, setTarget] = useState(String(setup.targetInr));
  const [rrList, setRrList] = useState<number[]>(setup.rrList);
  const [rr, setRr] = useState(setup.rr);
  const [newRr, setNewRr] = useState('');
  const [tf, setTf] = useState(setup.timeframe ?? '');
  const [strategyId, setStrategyId] = useState(setup.strategyId ?? '');
  const [assets, setAssets] = useState(setup.assets);
  const [newSym, setNewSym] = useState('');
  const [newMarket, setNewMarket] = useState<MarketType>('crypto');
  const [dailyLimit, setDailyLimit] = useState(() =>
    journal && journal.dailyLossUnit === '$' && journal.dailyLossLimit ? String(Math.round(journal.dailyLossLimit * settings.usdInr)) : '',
  );

  const save = async () => {
    const t = parseNum(target);
    if (!journal) return toast('Choose a journal (create one in Settings first)');
    if (!t || t <= 0) return toast('Enter your target profit in ₹');
    if (!rrList.length) return toast('Add at least one R:R');
    if (!assets.length) return toast('Add at least one asset');
    const limitInr = parseNum(dailyLimit) ?? 0;
    await saveJournal({ ...journal, dailyLossLimit: limitInr > 0 ? +(limitInr / settings.usdInr).toFixed(2) : 0, dailyLossUnit: '$' });
    await updateSettings({
      quick: {
        ...setup,
        done: true,
        journalId: journal.id,
        targetInr: t,
        rrList,
        rr: rrList.includes(rr) ? rr : rrList[0],
        timeframe: tf || undefined,
        strategyId: strategyId || undefined,
        assets,
        asset: assets.some((a) => a.symbol === setup.asset) ? setup.asset : assets[0].symbol,
      },
    });
    toast('Setup saved');
    onDone();
  };

  const tNum = parseNum(target) ?? 0;

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <PageHeader title="Quick trade setup" subtitle="Fill this once. You can change it any time with “Edit setup”." />
      <div className="card">
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
          <div className="field">
            <label>Journal</label>
            <select className="input" value={journalId} onChange={(e) => setJournalId(e.target.value)}>
              {accessible.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name} ({j.type})
                </option>
              ))}
            </select>
            {journal && journal.type.toLowerCase() !== 'backtest' && (
              <span className="warning tiny">Tip: a journal of type “Backtest” makes these trades count toward the 🟢 Tested badge.</span>
            )}
          </div>
          <div className="field">
            <label>Timeframe (decides the minute buttons)</label>
            <select className="input" value={tf} onChange={(e) => setTf(e.target.value)}>
              <option value="">Any (5-minute steps)</option>
              {TIMEFRAMES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Target profit per trade (₹) – fixed</label>
            <input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} style={{ fontWeight: 600 }} />
          </div>
          <div className="field">
            <label>Daily loss limit (₹) – 0 = no limit</label>
            <input className="input" inputMode="decimal" value={dailyLimit} placeholder="e.g. 6000" onChange={(e) => setDailyLimit(e.target.value)} />
          </div>
          <div className="field span-all">
            <label>Risk to reward choices – tap one to make it the default</label>
            <div className="row wrap" style={{ gap: 8 }}>
              {rrList.map((x) => (
                <span key={x} className={`chip ${rr === x ? 'on' : ''}`} onClick={() => setRr(x)}>
                  {rrLabel(x)}
                  <span className="faint small">loss {fmtInr(-(tNum / x))}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${rrLabel(x)}`}
                    style={{ background: 'none', border: 'none', color: 'inherit', padding: 4, cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRrList(rrList.filter((y) => y !== x));
                    }}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
              <span className="row" style={{ gap: 6 }}>
                <span className="muted">1 :</span>
                <input className="input" style={{ width: 80 }} inputMode="decimal" placeholder="4" value={newRr} onChange={(e) => setNewRr(e.target.value)} />
                <button
                  type="button"
                  className="btn icon"
                  aria-label="Add R:R"
                  onClick={() => {
                    const v = parseNum(newRr);
                    if (v && v > 0 && !rrList.includes(v)) setRrList([...rrList, v].sort((a, b) => a - b));
                    setNewRr('');
                  }}
                >
                  <Plus size={18} />
                </button>
              </span>
            </div>
          </div>
          <div className="field span-all">
            <label>Assets</label>
            <div className="row wrap" style={{ gap: 8 }}>
              {assets.map((a) => (
                <span key={a.symbol} className="chip">
                  {a.symbol} <span className="faint small">{a.market === 'crypto' ? 'Crypto' : 'Stock'}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${a.symbol}`}
                    style={{ background: 'none', border: 'none', color: 'inherit', padding: 4, cursor: 'pointer' }}
                    onClick={() => setAssets(assets.filter((x) => x.symbol !== a.symbol))}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
              <input
                className="input"
                style={{ flex: '1 1 140px' }}
                placeholder="Add asset, e.g. SOLUSD or RELIANCE"
                autoCapitalize="characters"
                value={newSym}
                onChange={(e) => setNewSym(e.target.value.toUpperCase())}
              />
              <Seg value={newMarket} onChange={setNewMarket} options={[{ v: 'crypto', label: 'Crypto' }, { v: 'stock', label: 'Indian stock' }]} />
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const s = newSym.trim();
                  if (s && !assets.some((a) => a.symbol === s)) setAssets([...assets, { symbol: s, market: newMarket }]);
                  setNewSym('');
                }}
              >
                <Plus size={16} /> Add
              </button>
            </div>
          </div>
          <div className="field span-all">
            <label>Strategy (optional – its checklist is ticked automatically)</label>
            <select className="input" value={strategyId} onChange={(e) => setStrategyId(e.target.value)}>
              <option value="">No strategy</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {setup.done && (
          <button className="btn" onClick={onDone}>
            Cancel
          </button>
        )}
        <button className="btn primary" onClick={save}>
          <Check size={17} /> Save setup
        </button>
      </div>
    </div>
  );
}

/* ====================== Trade screen ====================== */

const emptyTime = (ampm: 'AM' | 'PM' = 'AM'): TimeValue => ({ ampm });
const DURATIONS: [string, number][] = [
  ['+15m', 15],
  ['+30m', 30],
  ['+1h', 60],
  ['+2h', 120],
  ['+4h', 240],
  ['+1 day', 1440],
];

function TradeScreen({ setup, onEditSetup }: { setup: QuickSetup; onEditSetup: () => void }) {
  const { journals, isUnlocked, settings, ctx, toast } = useApp();
  const strategies = useStrategies() ?? [];
  const accessible = journals.filter(isUnlocked);
  const journal = accessible.find((j) => j.id === setup.journalId) ?? accessible[0];
  const all = useCalcTrades(journal ? [journal.id] : undefined);
  const strategy = strategies.find((s) => s.id === setup.strategyId);
  const asset = setup.assets.find((a) => a.symbol === setup.asset) ?? setup.assets[0];
  const rate = settings.usdInr;

  const [entry, setEntry] = useState('');
  const [target, setTarget] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customExit, setCustomExit] = useState('');
  const [anchor, setAnchor] = useState<number | null>(null);
  const [entryDay, setEntryDay] = useState<number | undefined>();
  const [entryTime, setEntryTime] = useState<TimeValue>(emptyTime());
  const [exitAnchor, setExitAnchor] = useState<number | undefined>();
  const [exitDay, setExitDay] = useState<number | undefined>();
  const [exitTime, setExitTime] = useState<TimeValue>(emptyTime());
  const [error, setError] = useState('');
  const [last, setLast] = useState<Trade | null>(null);

  // Start the date strip from the last trade you saved in this journal
  useEffect(() => {
    if (anchor != null || !all) return;
    const lastSaved = [...all].sort((a, b) => b.t.createdAt - a.t.createdAt)[0];
    const day = startOfDayIST(lastSaved ? lastSaved.t.entryAt : Date.now());
    setAnchor(day);
    setEntryDay(day);
    setExitAnchor(day);
    setExitDay(day);
  }, [all, anchor]);

  const patch = (p: Partial<QuickSetup>) => updateSettings({ quick: { ...setup, ...p } });

  // ---- calculations ----
  const e = parseNum(entry);
  const tg = parseNum(target);
  const valid = e != null && tg != null && e > 0 && tg > 0 && tg !== e;
  const side = valid ? (tg! > e! ? 'long' : 'short') : undefined;
  const dir = side === 'short' ? -1 : 1;
  const dist = valid ? Math.abs(tg! - e!) : 0;
  const sl = valid ? e! - (dir * dist) / setup.rr : undefined;
  const slOk = sl != null && sl > 0;
  const targetNative = asset?.market === 'stock' ? setup.targetInr : setup.targetInr / rate; // profit in trade currency
  const units = valid ? targetNative / dist : 0;
  const cs = asset ? contractSizeFor({ marketType: asset.market, symbol: asset.symbol }, ctx) : 1;
  const qty = units / cs;
  const lossInr = setup.targetInr / setup.rr;
  const cur = asset?.market === 'stock' ? '₹' : '$';
  const pnlInrAt = (x: number) => {
    const native = (x - e!) * units * dir;
    return asset?.market === 'stock' ? native : native * rate;
  };
  const custom = parseNum(customExit);

  const entryMs = combine(entryDay, entryTime);
  const exitMs = combine(exitDay, exitTime);

  // loss already booked on the selected day (for the daily limit)
  const dayStats = useMemo(() => {
    if (!all || entryDay == null) return { pnlInr: 0, count: 0 };
    const list = all.filter((x) => x.c.closed && startOfDayIST(x.t.entryAt) === entryDay);
    return { pnlInr: list.reduce((s, x) => s + (x.c.pnlUsd ?? 0), 0) * rate, count: list.length };
  }, [all, entryDay, rate]);
  const limitInr = journal && journal.dailyLossUnit === '$' ? journal.dailyLossLimit * rate : 0;
  const limitHit = limitInr > 0 && -dayStats.pnlInr >= limitInr;

  if (!journal) return <div className="empty">Create or unlock a journal first (Settings → Journals).</div>;
  if (anchor == null) return <div className="empty">Loading…</div>;

  const pickEntryDay = (d: number) => {
    setEntryDay(d);
    if (exitDay == null || exitDay < d || exitDay - d > 4 * DAY) {
      setExitDay(d);
      setExitAnchor(d);
    }
  };

  const applyDuration = (mins: number) => {
    if (entryMs == null) return setError('Pick the entry time first.');
    const ms = entryMs + mins * 60000;
    const d = startOfDayIST(ms);
    const p = istParts(ms);
    setExitDay(d);
    if (exitAnchor == null || d < exitAnchor || d > exitAnchor + 4 * DAY) setExitAnchor(d);
    setExitTime({ h12: p.h % 12 === 0 ? 12 : p.h % 12, ampm: p.h < 12 ? 'AM' : 'PM', min: p.min });
    setError('');
  };

  const save = async (mode: 'target' | 'stop' | 'custom') => {
    setError('');
    if (!valid) return setError('Type the entry price and the target price.');
    if (!slOk) return setError('Stop loss would be below 0 – check the prices.');
    if (entryMs == null) return setError('Pick the entry date and time (hour and minute).');
    if (exitMs == null) return setError('Pick the exit date and time.');
    if (exitMs < entryMs) return setError('Exit time is before the entry time.');
    let exit: number;
    if (mode === 'target') exit = tg!;
    else if (mode === 'stop') exit = sl!;
    else {
      if (custom == null || custom <= 0) {
        setCustomOpen(true);
        return setError('Type the exit price, then tap Save.');
      }
      exit = custom;
    }
    const r8 = (n: number) => +n.toFixed(8);
    const t: Trade = {
      id: uid(),
      journalId: journal.id,
      marketType: asset.market,
      symbol: asset.symbol,
      side: side!,
      status: 'closed',
      strategyId: strategy?.id,
      entryTf: setup.timeframe,
      entry: e!,
      stopLoss: r8(sl!),
      target: tg!,
      exit: r8(exit),
      quantity: r8(qty),
      fees: 0,
      entryAt: entryMs,
      exitAt: exitMs,
      checklist: strategy?.checklist.length ? Object.fromEntries(strategy.checklist.map((r) => [r, true])) : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveTrade(t);
    setLast(t);
    const pnl = mode === 'target' ? setup.targetInr : mode === 'stop' ? -lossInr : pnlInrAt(exit);
    toast(`Saved · ${fmtInr(pnl, true)}`);
    // ready for the next trade: dates stay, everything else clears
    setAnchor(entryDay!);
    setEntry('');
    setTarget('');
    setCustomExit('');
    setCustomOpen(false);
    setEntryTime(emptyTime(entryTime.ampm));
    setExitTime(emptyTime(exitTime.ampm));
    setExitDay(entryDay);
    setExitAnchor(entryDay);
  };

  const money = (inr: number, cls = '') => (
    <span className={cls}>
      {fmtInr(inr, true)} <span className="faint small">{fmtUsd(inr / rate, true)}</span>
    </span>
  );

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <PageHeader
        title="Quick trade"
        subtitle={`${journal.name} · Target ${fmtInr(setup.targetInr)} per trade${setup.timeframe ? ` · ${setup.timeframe}` : ''}${strategy ? ` · ${strategy.name}` : ''}`}
        actions={
          <button className="btn" onClick={onEditSetup}>
            <Settings2 size={17} /> Edit setup
          </button>
        }
      />

      {/* Asset + R:R */}
      <div className="card col" style={{ gap: 12 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="muted small" style={{ width: 54 }}>Asset</span>
          {setup.assets.map((a) => (
            <button key={a.symbol} className={`chip ${asset?.symbol === a.symbol ? 'on' : ''}`} onClick={() => patch({ asset: a.symbol })}>
              {a.symbol}
            </button>
          ))}
          <button className="chip" onClick={onEditSetup} aria-label="Add asset">
            <Plus size={15} />
          </button>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="muted small" style={{ width: 54 }}>R:R</span>
          {setup.rrList.map((x) => (
            <button key={x} className={`chip ${setup.rr === x ? 'on' : ''}`} onClick={() => patch({ rr: x })}>
              {rrLabel(x)}
            </button>
          ))}
          <span className="faint small">
            Target {fmtInr(setup.targetInr, true)} · Stop {fmtInr(-lossInr)}
          </span>
        </div>
      </div>

      {/* Prices */}
      <div className="card">
        <div className="grid g-2" style={{ gap: 12 }}>
          <div className="field">
            <label>Entry price ({cur})</label>
            <input className="input" inputMode="decimal" value={entry} onChange={(ev) => setEntry(ev.target.value)} style={{ fontSize: 20, fontWeight: 600 }} />
          </div>
          <div className="field">
            <label>Target price ({cur})</label>
            <input className="input" inputMode="decimal" value={target} onChange={(ev) => setTarget(ev.target.value)} style={{ fontSize: 20, fontWeight: 600 }} />
          </div>
        </div>
        <div className="row wrap small" style={{ gap: 18, marginTop: 12, minHeight: 24 }}>
          {valid && slOk ? (
            <>
              <span className={`pill ${side === 'long' ? 'profit' : 'loss'}`}>{side === 'long' ? 'Long' : 'Short'}</span>
              <span>
                <span className="muted">Stop loss </span>
                <b>
                  {cur === '₹' ? '₹' : ''}
                  {fmtNum(sl!, sl! < 10 ? 4 : 2)}
                </b>
              </span>
              <span>
                <span className="muted">R:R </span>
                <b>{rrLabel(setup.rr)}</b>
              </span>
              <span>
                <span className="muted">Size </span>
                <b>
                  {asset.market === 'stock' ? `${fmtNum(qty, qty < 10 ? 2 : 0)} shares` : cs !== 1 ? `${fmtNum(qty, 1)} contracts` : fmtNum(qty, 4)}
                </b>
              </span>
            </>
          ) : valid ? (
            <span className="loss">Stop loss would be below 0 – check the prices.</span>
          ) : (
            <span className="faint">Type entry and target – side, stop loss and size are calculated for you.</span>
          )}
        </div>
      </div>

      {/* Entry date & time */}
      <div className="card col" style={{ gap: 10 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          Entry <span className="faint small" style={{ fontWeight: 400 }}>{entryMs != null ? `${fmtDate(entryMs, true)} · ${fmtTime(entryMs)}` : ''}</span>
        </div>
        <DateStrip
          anchor={anchor}
          dir={setup.dir}
          value={entryDay}
          onPick={pickEntryDay}
          onShift={setAnchor}
          onToggleDir={() => patch({ dir: setup.dir === 'fwd' ? 'back' : 'fwd' })}
        />
        <TimeGrid value={entryTime} onChange={setEntryTime} tf={setup.timeframe} />
      </div>

      {/* Exit date & time */}
      <div className="card col" style={{ gap: 10 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          Exit <span className="faint small" style={{ fontWeight: 400 }}>{exitMs != null ? `${fmtDate(exitMs, true)} · ${fmtTime(exitMs)}` : ''}</span>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="muted small">After entry:</span>
          {DURATIONS.map(([l, m]) => (
            <button key={l} className="chip" style={{ minHeight: 36 }} onClick={() => applyDuration(m)}>
              {l}
            </button>
          ))}
        </div>
        <DateStrip
          anchor={exitAnchor ?? entryDay ?? anchor}
          dir="fwd"
          value={exitDay}
          min={entryDay}
          onPick={setExitDay}
          onShift={setExitAnchor}
        />
        <TimeGrid value={exitTime} onChange={setExitTime} tf={setup.timeframe} />
      </div>

      {/* Result */}
      <div className="card">
        {limitInr > 0 && (
          <div className={`small ${limitHit ? 'warning bold' : 'muted'}`} style={{ marginBottom: 10 }}>
            {limitHit && <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 4 }} />}
            This day: {fmtInr(dayStats.pnlInr, true)} in {dayStats.count} trade{dayStats.count === 1 ? '' : 's'} · loss limit {fmtInr(limitInr)}
            {limitHit ? ' – limit reached (you can still save)' : ''}
          </div>
        )}
        {error && (
          <div className="loss small bold" style={{ marginBottom: 10 }}>
            {error}
          </div>
        )}
        <div className="grid g-3" style={{ gap: 10 }}>
          <button className="btn result-btn win" onClick={() => save('target')}>
            <span className="row" style={{ gap: 6 }}>
              <Check size={20} /> Target hit
            </span>
            <span className="small">{fmtInr(setup.targetInr, true)}</span>
          </button>
          <button className="btn result-btn lose" onClick={() => save('stop')}>
            <span className="row" style={{ gap: 6 }}>
              <X size={20} /> Stop loss hit
            </span>
            <span className="small">{fmtInr(-lossInr)}</span>
          </button>
          <button className="btn result-btn" onClick={() => setCustomOpen((v) => !v)}>
            <span className="row" style={{ gap: 6 }}>
              <Pencil size={18} /> Exited in between
            </span>
            <span className="small muted">type exit price</span>
          </button>
        </div>
        {customOpen && (
          <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
            <input
              className="input"
              style={{ flex: '1 1 160px' }}
              inputMode="decimal"
              placeholder={`Exit price (${cur})`}
              value={customExit}
              onChange={(ev) => setCustomExit(ev.target.value)}
              autoFocus
            />
            {valid && custom != null && custom > 0 && money(pnlInrAt(custom), pnlInrAt(custom) >= 0 ? 'profit bold' : 'loss bold')}
            <button className="btn primary" onClick={() => save('custom')}>
              Save
            </button>
          </div>
        )}
      </div>

      {last && (
        <div className="muted small row wrap" style={{ gap: 8 }}>
          Last saved: <b style={{ color: 'var(--text)' }}>{last.symbol}</b> {last.side === 'long' ? 'Long' : 'Short'} · {fmtDate(last.entryAt)} {fmtTime(last.entryAt)} →{' '}
          {fmtTime(last.exitAt!)}
          <Link to={`/trades/${last.id}`} className="link-btn small" style={{ minHeight: 0 }}>
            View / edit
          </Link>
        </div>
      )}
    </div>
  );
}
