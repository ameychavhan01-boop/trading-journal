import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, Minus, Pencil, Undo2, ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { DateTime12, Seg } from '../components/inputs';
import { useApp } from '../state/AppContext';
import { useCalcTrades } from '../state/hooks';
import { deleteTrade, saveTrade, uid, useStrategies } from '../data/api';
import type { Grade, MarketType, Side, Trade } from '../data/types';
import { TIMEFRAMES } from '../data/defaults';
import { computeStats, contractSizeFor } from '../lib/calc';
import { fmtNum, fmtPct, fmtPrice, fmtR, parseNum, tone } from '../lib/format';
import { fmtDate, fmtTime } from '../lib/time';

/** Settings that stay the same for a whole backtest session (remembered on this device). */
interface Setup {
  journalId?: string;
  strategyId?: string;
  marketType: MarketType;
  symbol: string;
  entryTf?: string;
  targetR: string;
}

const KEY = 'tj-quick-setup';
function loadSetup(): Setup {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && typeof v === 'object') return { marketType: 'crypto', symbol: 'BTCUSD', targetR: '2', ...v };
  } catch {
    /* ignore */
  }
  return { marketType: 'crypto', symbol: 'BTCUSD', targetR: '2' };
}

type Outcome = 'target' | 'stop' | 'be' | 'other';

export default function QuickBacktest() {
  const { journals, isUnlocked, ctx, toast, settings } = useApp();
  const strategies = (useStrategies() ?? []).filter((s) => !s.hidden);
  const accessible = journals.filter(isUnlocked);
  const [setup, setSetupState] = useState<Setup>(loadSetup);
  const [showSetup, setShowSetup] = useState(false);

  // per-trade state
  const [when, setWhen] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem('tj-quick-when'));
      return v > 0 ? v : Date.now();
    } catch {
      return Date.now();
    }
  });
  const [side, setSide] = useState<Side>('long');
  const [entry, setEntry] = useState('');
  const [sl, setSl] = useState('');
  const [targetOverride, setTargetOverride] = useState('');
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherExit, setOtherExit] = useState('');
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [grade, setGrade] = useState<Grade | undefined>();
  const [note, setNote] = useState('');
  const [unticked, setUnticked] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  // default journal: the remembered one, else the first Backtest journal, else the first one
  const journal =
    accessible.find((j) => j.id === setup.journalId) ??
    accessible.find((j) => j.type.toLowerCase() === 'backtest') ??
    accessible[0];
  const strategy = strategies.find((s) => s.id === setup.strategyId);

  const setSetup = (patch: Partial<Setup>) => {
    const next = { ...setup, ...patch };
    setSetupState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem('tj-quick-when', String(when));
    } catch {
      /* ignore */
    }
  }, [when]);

  useEffect(() => setUnticked([]), [setup.strategyId]);

  const journalTrades = useCalcTrades(journal ? [journal.id] : []) ?? [];
  const session = useMemo(() => journalTrades.filter((x) => sessionIds.includes(x.t.id)), [journalTrades, sessionIds]);
  const sessionStats = computeStats(session);
  const journalStats = useMemo(() => computeStats(journalTrades), [journalTrades]);
  const recent = [...session].sort((a, b) => sessionIds.indexOf(b.t.id) - sessionIds.indexOf(a.t.id)).slice(0, 5);

  const e = parseNum(entry);
  const s = parseNum(sl);
  const dir = side === 'long' ? 1 : -1;
  const dist = e != null && s != null ? Math.abs(e - s) : 0;
  const slOk = e != null && s != null && e > 0 && s > 0 && (side === 'long' ? s < e : s > e);
  const tR = parseNum(setup.targetR) ?? 2;
  const autoTarget = slOk ? e! + dir * tR * dist : undefined;
  const target = parseNum(targetOverride) ?? autoTarget;
  const targetR = slOk && target != null ? (dir * (target - e!)) / dist : tR;
  const cur = setup.marketType === 'stock' ? '₹' : '$';

  const save = async (outcome: Outcome) => {
    setError('');
    if (!journal) return setError('Create a journal first (Settings → Journals).');
    if (!setup.symbol.trim()) return setError('Set a symbol in the session setup.');
    if (!slOk) return setError(side === 'long' ? 'Enter entry and a stop loss BELOW entry.' : 'Enter entry and a stop loss ABOVE entry.');
    let exit: number;
    if (outcome === 'target') {
      if (target == null) return setError('Set a target.');
      exit = target;
    } else if (outcome === 'stop') exit = s!;
    else if (outcome === 'be') exit = e!;
    else {
      const x = parseNum(otherExit);
      if (x == null || x <= 0) {
        setOtherOpen(true);
        return setError('Type the exit price, then tap Save.');
      }
      exit = x;
    }
    // size from the journal's risk % (fixed risk per trade, no compounding)
    const riskUsd = (journal.startingBalance * journal.riskPct) / 100;
    const riskNative = setup.marketType === 'stock' ? riskUsd * ctx.usdInr : riskUsd;
    const cs = contractSizeFor({ marketType: setup.marketType, symbol: setup.symbol }, ctx);
    const qty = +(riskNative / dist / cs).toFixed(6);
    const round = (n: number) => +n.toFixed(8);
    const t: Trade = {
      id: uid(),
      journalId: journal.id,
      marketType: setup.marketType,
      symbol: setup.symbol.trim().toUpperCase(),
      side,
      status: 'closed',
      strategyId: strategy?.id,
      entryTf: setup.entryTf,
      entry: e!,
      stopLoss: s!,
      target: target != null ? round(target) : undefined,
      exit: round(exit),
      quantity: qty,
      fees: 0,
      entryAt: when,
      exitAt: when,
      checklist: strategy?.checklist.length ? Object.fromEntries(strategy.checklist.map((r) => [r, !unticked.includes(r)])) : undefined,
      mistakes: mistakes.length ? mistakes : undefined,
      grade,
      notes: note.trim() ? { lesson: note.trim() } : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveTrade(t);
    setSessionIds((ids) => [...ids, t.id]);
    const r = (dir * (exit - e!)) / dist;
    toast(`Saved · ${fmtR(r, 2)}${unticked.length ? ' · Rules broken' : ''}`);
    // ready for the next trade: keep date/time, side and setup
    setEntry('');
    setSl('');
    setTargetOverride('');
    setOtherExit('');
    setOtherOpen(false);
    setGrade(undefined);
    setNote('');
    setUnticked([]);
    setMistakes([]);
  };

  const undo = async () => {
    const last = sessionIds[sessionIds.length - 1];
    if (!last) return;
    await deleteTrade(last);
    setSessionIds((ids) => ids.slice(0, -1));
    toast('Last trade removed');
  };

  if (!journal) return <div className="empty">Create or unlock a journal first (Settings → Journals).</div>;

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <PageHeader
        title="Quick backtest"
        subtitle="For Bar Replay: enter the trade, tap the result. Size comes from the journal's risk %."
      />

      {/* Session setup */}
      <div className="card">
        <button
          className="row"
          style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', minHeight: 44, textAlign: 'left' }}
          onClick={() => setShowSetup((v) => !v)}
        >
          <Settings2 size={18} className="faint" />
          <span className="spacer">
            <span className="bold">{journal.name}</span>
            <span className="muted small">
              {' '}
              · {strategy?.name ?? 'No strategy'} · {setup.symbol || '–'}
              {setup.entryTf ? ` · ${setup.entryTf}` : ''} · Target {setup.targetR}R · Risk {journal.riskPct}% ({cur === '₹' ? '₹' : '$'}
              {fmtNum(((journal.startingBalance * journal.riskPct) / 100) * (cur === '₹' ? settings.usdInr : 1), 0)})
            </span>
          </span>
          <span className="link-btn small">{showSetup ? 'Done' : 'Change'}</span>
        </button>
        {showSetup && (
          <div className="form-grid" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Journal</label>
              <select className="input" value={journal.id} onChange={(ev) => setSetup({ journalId: ev.target.value })}>
                {accessible.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name} ({j.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Strategy</label>
              <select className="input" value={setup.strategyId ?? ''} onChange={(ev) => setSetup({ strategyId: ev.target.value || undefined })}>
                <option value="">No strategy</option>
                {strategies.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Market</label>
              <Seg
                full
                value={setup.marketType}
                onChange={(v) => setSetup({ marketType: v })}
                options={[
                  { v: 'crypto', label: 'Crypto' },
                  { v: 'stock', label: 'Indian stock' },
                ]}
              />
            </div>
            <div className="field">
              <label>Symbol</label>
              <input className="input" value={setup.symbol} autoCapitalize="characters" onChange={(ev) => setSetup({ symbol: ev.target.value.toUpperCase() })} />
            </div>
            <div className="field">
              <label>Timeframe</label>
              <select className="input" value={setup.entryTf ?? ''} onChange={(ev) => setSetup({ entryTf: ev.target.value || undefined })}>
                <option value="">–</option>
                {TIMEFRAMES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Target (R multiple)</label>
              <input className="input" inputMode="decimal" value={setup.targetR} onChange={(ev) => setSetup({ targetR: ev.target.value })} />
            </div>
            {journal.type.toLowerCase() !== 'backtest' && (
              <div className="warning small span-all">Tip: use a journal of type “Backtest” so these trades count toward the 🟢 Tested badge.</div>
            )}
          </div>
        )}
      </div>

      {/* The trade */}
      <div className="card">
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
          <div className="field span-all">
            <label>Entry date &amp; time (IST) – stays on the last one you used</label>
            <DateTime12 value={when} onChange={(v) => v != null && setWhen(v)} />
          </div>
          <div className="field span-all">
            <Seg
              full
              value={side}
              onChange={setSide}
              options={[
                { v: 'long', label: 'Long' },
                { v: 'short', label: 'Short' },
              ]}
            />
          </div>
          <div className="field">
            <label>Entry ({cur})</label>
            <input className="input" inputMode="decimal" value={entry} onChange={(ev) => setEntry(ev.target.value)} style={{ fontSize: 20, fontWeight: 600 }} />
          </div>
          <div className="field">
            <label>Stop loss ({cur})</label>
            <input className="input" inputMode="decimal" value={sl} onChange={(ev) => setSl(ev.target.value)} style={{ fontSize: 20, fontWeight: 600 }} />
          </div>
          <div className="field span-all">
            <label>
              Target ({cur}) <span className="faint">– auto {fmtNum(tR, 1)}R, type to change</span>
            </label>
            <input
              className="input"
              inputMode="decimal"
              value={targetOverride}
              placeholder={autoTarget != null ? fmtPrice(autoTarget, setup.marketType).replace('₹', '') : 'Fill entry and stop loss'}
              onChange={(ev) => setTargetOverride(ev.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="loss small bold" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}

        <div className="grid g-2" style={{ marginTop: 16, gap: 10 }}>
          <button className="btn" style={{ minHeight: 64, background: 'var(--profit-soft)', color: 'var(--profit)', borderColor: 'transparent', fontSize: 16 }} onClick={() => save('target')}>
            <Check size={20} /> Hit target {slOk ? `(${fmtR(targetR, 1)})` : ''}
          </button>
          <button className="btn" style={{ minHeight: 64, background: 'var(--loss-soft)', color: 'var(--loss)', borderColor: 'transparent', fontSize: 16 }} onClick={() => save('stop')}>
            <X size={20} /> Hit stop (−1R)
          </button>
          <button className="btn" style={{ minHeight: 52 }} onClick={() => save('be')}>
            <Minus size={18} /> Breakeven (0R)
          </button>
          <button className="btn" style={{ minHeight: 52 }} onClick={() => setOtherOpen((v) => !v)}>
            <Pencil size={17} /> Other exit…
          </button>
        </div>
        {otherOpen && (
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <input className="input" inputMode="decimal" placeholder={`Exit price (${cur})`} value={otherExit} onChange={(ev) => setOtherExit(ev.target.value)} autoFocus />
            <button className="btn primary" onClick={() => save('other')}>
              Save
            </button>
          </div>
        )}

        <button className="link-btn small" style={{ marginTop: 8 }} onClick={() => setExtrasOpen((v) => !v)}>
          {extrasOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />} Checklist, grade, mistakes, note
          {unticked.length ? <span className="pill loss">Rules broken</span> : null}
        </button>
        {extrasOpen && (
          <div className="col" style={{ marginTop: 6 }}>
            {strategy?.checklist.length ? (
              <div>
                <div className="muted small">Checklist (all ticked – untick what you broke)</div>
                {strategy.checklist.map((r) => (
                  <label className="check" key={r}>
                    <input
                      type="checkbox"
                      checked={!unticked.includes(r)}
                      onChange={(ev) => setUnticked((u) => (ev.target.checked ? u.filter((x) => x !== r) : [...u, r]))}
                    />
                    <span>{r}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="faint small">Choose a strategy in the session setup to get its checklist.</div>
            )}
            <div className="field">
              <label>Grade</label>
              <Seg full value={grade} onChange={(v) => setGrade(grade === v ? undefined : v)} options={[{ v: 'A', label: 'A' }, { v: 'B', label: 'B' }, { v: 'C', label: 'C' }]} />
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              {settings.mistakeTags.map((m) => (
                <button key={m} className={`chip ${mistakes.includes(m) ? 'on' : ''}`} onClick={() => setMistakes((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]))}>
                  {m}
                </button>
              ))}
            </div>
            <input className="input" placeholder="Note / lesson (optional)" value={note} onChange={(ev) => setNote(ev.target.value)} />
          </div>
        )}
      </div>

      {/* Session score */}
      <div className="card">
        <div className="card-title">
          This session
          <span className="spacer" />
          <button className="btn sm" disabled={!sessionIds.length} onClick={undo}>
            <Undo2 size={15} /> Undo last
          </button>
        </div>
        <div className="row wrap" style={{ gap: 24 }}>
          <div>
            <div className="stat-label">Trades</div>
            <div className="bold" style={{ fontSize: 18 }}>{sessionStats.closed}</div>
          </div>
          <div>
            <div className="stat-label">Total</div>
            <div className={`bold ${tone(sessionStats.totalR)}`} style={{ fontSize: 18 }}>{fmtR(sessionStats.totalR)}</div>
          </div>
          <div>
            <div className="stat-label">Win rate</div>
            <div className="bold" style={{ fontSize: 18 }}>{sessionStats.closed ? fmtPct(sessionStats.winRate, 0) : '–'}</div>
          </div>
          <div>
            <div className="stat-label">Journal total</div>
            <div className="bold" style={{ fontSize: 18 }}>
              {journalStats.closed} trades · <span className={tone(journalStats.expectancy)}>{fmtR(journalStats.expectancy, 2)}</span>/trade
            </div>
          </div>
        </div>
        {recent.length > 0 && (
          <>
            <div className="divider" />
            {recent.map((x) => (
              <Link key={x.t.id} to={`/trades/${x.t.id}`} className="list-row" style={{ color: 'inherit', minHeight: 44 }}>
                <span className="faint small" style={{ width: 110 }}>
                  {fmtDate(x.t.entryAt)} {fmtTime(x.t.entryAt)}
                </span>
                <span className="bold spacer">
                  {x.t.symbol} <span className={`pill ${x.t.side === 'long' ? 'profit' : 'loss'}`}>{x.t.side === 'long' ? 'Long' : 'Short'}</span>
                  {x.c.rulesBroken && <span className="pill loss" style={{ marginLeft: 4 }}>Rules broken</span>}
                </span>
                <span className={`bold ${tone(x.c.r)}`}>{fmtR(x.c.r ?? 0, 2)}</span>
              </Link>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
