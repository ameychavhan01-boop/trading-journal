import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Calculator, Camera, Download, FileText, Plus, ArrowRight, Lock } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { Modal } from '../components/Modal';
import { Money } from '../components/Money';
import { BarChart, LineChart } from '../components/charts';
import { EmotionCard, MistakesCard, RulesCard } from '../components/Psychology';
import { Banners } from '../components/Banners';
import { PositionSizeModal } from '../components/PositionSize';
import { TradeTable, SidePill } from '../components/TradeTable';
import { useApp } from '../state/AppContext';
import { useActiveTrades, useStrategyMap } from '../state/hooks';
import { bestWorst, byTimeBlock, byWeekday, computeStats, dailyRisk, tradeTime, type CT } from '../lib/calc';
import { DAY, fmtDate, fmtRange, fmtTime, fromDateInput, startOfDayIST, toDateInput, TIME_BLOCKS, TIME_BLOCKS_LONG, WEEKDAYS, WEEKDAYS_LONG } from '../lib/time';
import { fmtInr, fmtNum, fmtPct, fmtPrice, fmtR, fmtUsd, tone } from '../lib/format';
import { tradesCsv } from '../lib/csv';
import { saveFile, stamp } from '../lib/files';

const TIME_SHORT = ['12a', '4a', '8a', '12p', '4p', '8p'];

type RangeKey = '1W' | '1M' | '3M' | 'All' | 'Custom';

function loadRange(): RangeKey {
  try {
    return (localStorage.getItem('tj-range') as RangeKey) || '1M';
  } catch {
    return '1M';
  }
}

export default function Dashboard() {
  const { active, settings, journals, unlockJournal, comingSoon, toast } = useApp();
  const navigate = useNavigate();
  const all = useActiveTrades();
  const strategies = useStrategyMap();
  const [range, setRange] = useState<RangeKey>(loadRange);
  const [custom, setCustom] = useState<{ from: number; to: number }>(() => ({ from: startOfDayIST(Date.now() - 30 * DAY), to: Date.now() }));
  const [customOpen, setCustomOpen] = useState(false);
  const [unit, setUnit] = useState<'R' | '$'>('R');
  const [sizeOpen, setSizeOpen] = useState(false);

  const period = useMemo(() => {
    const now = Date.now();
    const sod = startOfDayIST(now);
    switch (range) {
      case '1W':
        return { from: sod - 6 * DAY, to: now };
      case '1M':
        return { from: sod - 29 * DAY, to: now };
      case '3M':
        return { from: sod - 89 * DAY, to: now };
      case 'Custom':
        return custom;
      default: {
        const first = all?.length ? Math.min(...all.map((x) => x.t.entryAt)) : now;
        return { from: startOfDayIST(first), to: now };
      }
    }
  }, [range, custom, all]);

  const list = useMemo(
    () => (all ?? []).filter((x) => x.t.status === 'open' || (tradeTime(x.t) >= period.from && tradeTime(x.t) <= period.to)),
    [all, period],
  );
  const stats = useMemo(() => computeStats(list), [list]);
  const before = useMemo(() => (all ?? []).filter((x) => x.c.closed && tradeTime(x.t) < period.from).reduce((s, x) => s + (x.c.pnlUsd ?? 0), 0), [all, period]);
  const allStats = useMemo(() => computeStats(all ?? []), [all]);

  if (!active) {
    const locked = journals.find((j) => j.pinHash);
    return (
      <div className="page">
        <PageHeader title="Dashboard" />
        <div className="card empty">
          <Lock size={28} />
          <div className="bold" style={{ marginTop: 8 }}>This journal is locked</div>
          {locked && (
            <button className="btn primary" style={{ marginTop: 12 }} onClick={() => unlockJournal(locked)}>
              Enter PIN
            </button>
          )}
        </div>
      </div>
    );
  }
  if (!all) return <div className="empty">Loading…</div>;

  const risk = dailyRisk(all, active);
  const startBal = active.startingBalance + before;
  const nowBal = startBal + stats.totalPnl;
  const currentBalance = active.startingBalance + allStats.totalPnl;
  const isSample = active.isSample || all.some((x) => x.t.isSample);
  const day = byWeekday(list, WEEKDAYS);
  const time = byTimeBlock(list, TIME_BLOCKS);
  const dayBW = bestWorst(byWeekday(list, WEEKDAYS_LONG));
  const timeBW = bestWorst(byTimeBlock(list, TIME_BLOCKS_LONG));
  const open = all.filter((x) => x.t.status === 'open').sort((a, b) => b.t.entryAt - a.t.entryAt);
  const recent = [...list].filter((x) => x.c.closed).sort((a, b) => tradeTime(b.t) - tradeTime(a.t)).slice(0, 5);
  const closedInRange = list.filter((x) => x.c.closed);
  const periodLabel = fmtRange(period.from, Math.min(period.to, Date.now()));

  const pick = (r: RangeKey) => {
    if (r === 'Custom') return setCustomOpen(true);
    setRange(r);
    try {
      localStorage.setItem('tj-range', r);
    } catch {
      /* ignore */
    }
  };

  const exportCsv = async () => {
    try {
      await saveFile(tradesCsv(closedInRange.concat(open), journals, strategies, settings.usdInr), `trades-${stamp()}.csv`);
    } catch {
      /* cancelled */
    }
  };
  const exportPdf = async () => {
    try {
      toast('Creating PDF…');
      const { buildPdfReport } = await import('../lib/pdf');
      const blob = buildPdfReport({ journal: active, list: closedInRange, periodLabel, usdInr: settings.usdInr, strategies });
      await saveFile(blob, `report-${active.name.replace(/[^\w-]+/g, '-')}-${stamp()}.pdf`);
    } catch {
      /* cancelled */
    }
  };

  const lossPct = risk.limit > 0 ? Math.min(1, risk.lossUsed / risk.limit) : 0;

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        badge={isSample ? <span className="pill">Sample data</span> : undefined}
        subtitle={`${active.name} · ${periodLabel}`}
        actions={
          <>
            <div className="seg">
              {(['1W', '1M', '3M', 'All', 'Custom'] as RangeKey[]).map((r) => (
                <button key={r} className={range === r ? 'on' : ''} onClick={() => pick(r)}>
                  {r}
                </button>
              ))}
            </div>
            <button className="btn" onClick={comingSoon}>
              <Camera size={17} /> <span className="hide-mobile">Upload screenshot</span>
            </button>
            <Link to="/add" className="btn primary hide-mobile">
              <Plus size={17} /> Add trade
            </Link>
          </>
        }
      />

      {/* Today's risk strip */}
      <div className="card">
        <div className="risk-strip">
          <div>
            <div className="stat-label">Trades today</div>
            <div className="row" style={{ marginTop: 4 }}>
              <span className="big">
                {risk.tradesToday}
                {risk.maxTrades ? ` of ${risk.maxTrades}` : ''}
              </span>
              {risk.maxTrades > 0 && risk.maxTrades <= 10 && (
                <span className="dots">
                  {Array.from({ length: risk.maxTrades }).map((_, i) => (
                    <span key={i} className={i < risk.tradesToday ? 'on' : ''} />
                  ))}
                </span>
              )}
            </div>
          </div>
          <div style={{ minWidth: 180 }}>
            <div className="stat-label">Daily loss used</div>
            <div style={{ marginTop: 4 }}>
              <span className="big">{risk.unit === 'R' ? `${fmtNum(risk.lossUsed, 1)}R` : fmtUsd(risk.lossUsed)}</span>{' '}
              <span className="muted small">
                {risk.limit > 0
                  ? `of ${risk.unit === 'R' ? `${risk.limit}R` : fmtUsd(risk.limit)} limit · ${risk.unit === 'R' ? `${fmtNum(Math.max(0, risk.limit - risk.lossUsed), 1)}R` : fmtUsd(Math.max(0, risk.limit - risk.lossUsed))} left`
                  : 'no limit set'}
              </span>
            </div>
            {risk.limit > 0 && (
              <div className="progress" style={{ marginTop: 6 }}>
                <div className={lossPct >= 1 ? 'bad' : lossPct >= 0.66 ? 'warn' : ''} style={{ width: `${Math.max(lossPct * 100, 2)}%` }} />
              </div>
            )}
          </div>
          <div>
            <div className="stat-label">Today's P&amp;L</div>
            <Money usd={risk.pnlToday} className="big" style={{ marginTop: 4 }} />
          </div>
          {(risk.maxTradesHit || risk.lossLimitHit) && (
            <div className="banner warning" style={{ padding: '8px 14px', minHeight: 0 }}>
              <AlertTriangle size={16} />
              <span className="small bold">
                {risk.lossLimitHit ? 'Daily loss limit reached – stop trading today' : 'Max trades reached – no new trades today'}
              </span>
            </div>
          )}
          <span className="spacer" />
          <button className="btn" onClick={() => setSizeOpen(true)}>
            <Calculator size={17} /> Position size
          </button>
        </div>
      </div>

      <Banners list={all} />

      {/* Stat cards */}
      <div className="grid g-5">
        <div className="card">
          <div className="stat-label">Total P&amp;L</div>
          <div className={`stat-value ${tone(stats.totalPnl)}`}>{fmtUsd(stats.totalPnl, true)}</div>
          <div className="stat-sub">
            <div className="faint">{fmtInr(stats.totalPnl * settings.usdInr, true)}</div>
            {fmtR(stats.totalR)} · {stats.closed} closed trades
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Win rate</div>
          <div className="stat-value">{fmtPct(stats.winRate)}</div>
          <div className="stat-sub">
            {stats.wins} wins · {stats.losses} losses{stats.be ? ` · ${stats.be} BE` : ''}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Average R:R</div>
          <div className="stat-value">1 : {fmtNum(stats.avgRR, 1)}</div>
          <div className="stat-sub">
            Avg win {fmtR(stats.avgWinR)}
            <br />
            Avg loss {fmtR(stats.avgLossR)}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Expectancy</div>
          <div className={`stat-value ${tone(stats.expectancy)}`}>{fmtR(stats.expectancy, 2)}</div>
          <div className="stat-sub">
            Earned per trade
            <br />≈ {fmtUsd(stats.expectancyUsd, true)} per trade
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Current streak</div>
          <div className={`stat-value ${stats.currentStreak.kind === 'win' ? 'profit' : stats.currentStreak.kind === 'loss' ? 'loss' : ''}`}>
            {stats.currentStreak.kind
              ? `${stats.currentStreak.count} ${stats.currentStreak.kind === 'win' ? 'win' : stats.currentStreak.kind === 'loss' ? 'loss' : 'BE'}${stats.currentStreak.count === 1 ? '' : stats.currentStreak.kind === 'loss' ? 'es' : 's'}`
              : '–'}
          </div>
          <div className="streak">
            {stats.last10.map((r, i) => (
              <span key={i} className={r} title={r} />
            ))}
          </div>
          <div className="stat-sub">
            Best {stats.bestWinStreak} wins · Worst {stats.worstLossStreak} losses
          </div>
        </div>
      </div>

      {/* Equity + open trades */}
      <div className="grid g-eq">
        <div className="card">
          <div className="card-title">
            Equity curve <span className="spacer" />
            <div className="seg">
              {(['R', '$'] as const).map((u) => (
                <button key={u} className={unit === u ? 'on' : ''} onClick={() => setUnit(u)}>
                  {u}
                </button>
              ))}
            </div>
          </div>
          <LineChart
            series={[
              {
                name: 'Equity',
                color: 'var(--accent)',
                points: stats.equity.map((e) => (unit === 'R' ? e.r : startBal + e.usd)),
              },
            ]}
            baseline={unit === 'R' ? 0 : startBal}
            format={(v) => (unit === 'R' ? fmtR(v, 2) : fmtUsd(v))}
          />
          <div className="row wrap muted small" style={{ gap: 22, marginTop: 10 }}>
            <span>
              Start <b style={{ color: 'var(--text)' }}>{fmtUsd(startBal)}</b>
            </span>
            <span>
              Now <b style={{ color: 'var(--text)' }}>{fmtUsd(nowBal)}</b>
            </span>
            <span>
              Max drawdown <b className="loss">{unit === 'R' ? fmtR(stats.maxDdR) : fmtUsd(stats.maxDdUsd)}</b>
            </span>
            <span>
              Risk per trade {active.riskPct}% ({fmtUsd((currentBalance * active.riskPct) / 100)})
            </span>
          </div>
        </div>
        <div className="card">
          <div className="card-title">
            Open trades <span className="spacer" />
            {open.length > 0 && <span className="pill">{open.length} running</span>}
          </div>
          {!open.length && <div className="muted small">No open trades.</div>}
          {open.map((x) => (
            <OpenCard key={x.t.id} x={x} strategyName={x.t.strategyId ? strategies.get(x.t.strategyId)?.name : undefined} onClick={() => navigate(`/trades/${x.t.id}`)} />
          ))}
        </div>
      </div>

      {/* P&L by day / time */}
      <div className="grid g-2">
        <div className="card">
          <div className="card-title">P&amp;L by day</div>
          <BarChart data={day.map((d) => ({ label: d.label, value: d.r, count: d.count, sub: `${d.count} trades · ${fmtUsd(d.pnl, true)}` }))} format={(v) => fmtR(v)} />
          <BestWorst best={dayBW.best} worst={dayBW.worst} />
        </div>
        <div className="card">
          <div className="card-title">P&amp;L by time (IST)</div>
          <BarChart data={time.map((d, i) => ({ label: d.label, short: TIME_SHORT[i], value: d.r, count: d.count, sub: `${TIME_BLOCKS_LONG[i]} · ${d.count} trades · ${fmtUsd(d.pnl, true)}` }))} format={(v) => fmtR(v)} />
          <BestWorst best={timeBW.best} worst={timeBW.worst} />
        </div>
      </div>

      <div className="section-title">Psychology</div>
      <div className="grid g-3">
        <EmotionCard list={list} />
        <MistakesCard list={list} />
        <RulesCard list={list} />
      </div>

      {/* Recent trades */}
      <div className="card">
        <div className="card-title">
          Recent trades <span className="spacer" />
          <button className="btn sm" onClick={exportCsv}>
            <Download size={15} /> Export CSV
          </button>
          <button className="btn sm" onClick={exportPdf}>
            <FileText size={15} /> PDF report
          </button>
        </div>
        <TradeTable rows={recent} strategies={strategies} />
        <Link to="/trades" className="link-btn" style={{ marginTop: 6 }}>
          View all {all.length} trades <ArrowRight size={15} />
        </Link>
      </div>

      {customOpen && (
        <CustomRange
          initial={custom}
          onClose={() => setCustomOpen(false)}
          onApply={(r) => {
            setCustom(r);
            setRange('Custom');
            setCustomOpen(false);
          }}
        />
      )}
      {sizeOpen && <PositionSizeModal balanceUsd={currentBalance} onClose={() => setSizeOpen(false)} />}
    </div>
  );
}

function BestWorst({ best, worst }: { best?: { label: string; r: number }; worst?: { label: string; r: number } }) {
  if (!best || !worst) return <div className="muted small" style={{ marginTop: 8 }}>Not enough trades yet.</div>;
  return (
    <div className="muted small" style={{ marginTop: 8 }}>
      Best: <b style={{ color: 'var(--text)' }}>{best.label} {fmtR(best.r)}</b>
      {worst.label !== best.label && (
        <>
          {' '}
          · Worst: <b style={{ color: 'var(--text)' }}>{worst.label} {fmtR(worst.r)}</b>
        </>
      )}
    </div>
  );
}

function OpenCard({ x, strategyName, onClick }: { x: CT; strategyName?: string; onClick: () => void }) {
  const { t, c } = x;
  const { settings } = useApp();
  return (
    <div className="mini" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="row">
        <span className="bold" style={{ fontSize: 15 }}>
          {t.symbol}
        </span>
        <SidePill side={t.side} />
        <span className="spacer" />
        <span className="muted small">{Date.now() - t.entryAt < DAY ? fmtTime(t.entryAt) : fmtDate(t.entryAt)}</span>
      </div>
      <div className="kv">
        <div>
          <div className="k">Entry</div>
          <div className="v">{fmtPrice(t.entry, t.marketType)}</div>
        </div>
        <div>
          <div className="k">Stop loss</div>
          <div className="v">{fmtPrice(t.stopLoss, t.marketType)}</div>
        </div>
        <div>
          <div className="k">Target</div>
          <div className="v">{fmtPrice(t.target, t.marketType)}</div>
        </div>
      </div>
      <div className="row muted small">
        <span>{[strategyName, t.entryTf].filter(Boolean).join(' · ') || '–'}</span>
        <span className="spacer" />
        <span>
          Risk 1R · {t.marketType === 'stock' ? `₹${Math.round(c.riskNative).toLocaleString('en-IN')}` : fmtUsd(c.riskUsd)}
          {t.marketType === 'stock' && <span className="faint"> ({fmtUsd(c.riskNative / settings.usdInr)})</span>}
        </span>
      </div>
    </div>
  );
}

function CustomRange({ initial, onApply, onClose }: { initial: { from: number; to: number }; onApply: (r: { from: number; to: number }) => void; onClose: () => void }) {
  const [from, setFrom] = useState(toDateInput(initial.from));
  const [to, setTo] = useState(toDateInput(initial.to));
  return (
    <Modal
      title="Custom date range"
      onClose={onClose}
      footer={
        <button
          className="btn primary"
          onClick={() => {
            const f = fromDateInput(from);
            const t = fromDateInput(to);
            if (f == null || t == null || t < f) return;
            onApply({ from: f, to: t + DAY - 1 });
          }}
        >
          Apply
        </button>
      }
    >
      <div className="grid g-2">
        <div className="field">
          <label>From</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label>To</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
