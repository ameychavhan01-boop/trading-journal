import { useState } from 'react';
import { PageHeader } from '../components/Layout';
import { LineChart } from '../components/charts';
import { useApp } from '../state/AppContext';
import { useCalcTrades } from '../state/hooks';
import { computeStats, rulesSplit, type Stats } from '../lib/calc';
import { fmtDuration } from '../lib/time';
import { fmtNum, fmtPct, fmtR, fmtUsd, fmtInr, tone } from '../lib/format';

export default function Compare() {
  const { journals, isUnlocked, unlockJournal, showMode, settings } = useApp();
  const [a, setA] = useState(journals[0]?.id ?? '');
  const [b, setB] = useState(journals[1]?.id ?? '');
  const ja = journals.find((j) => j.id === a);
  const jb = journals.find((j) => j.id === b);
  const ta = useCalcTrades(ja && isUnlocked(ja) ? [ja.id] : []) ?? [];
  const tb = useCalcTrades(jb && isUnlocked(jb) ? [jb.id] : []) ?? [];

  if (showMode) return <div className="empty">Compare is off while Show mode is on.</div>;
  if (journals.length < 2)
    return (
      <div className="page">
        <PageHeader title="Compare" />
        <div className="card empty">Create a second journal in Settings to compare.</div>
      </div>
    );

  const choose = async (id: string, setter: (v: string) => void) => {
    const j = journals.find((x) => x.id === id);
    if (j && (await unlockJournal(j))) setter(id);
  };

  const sa = computeStats(ta);
  const sb = computeStats(tb);
  const ra = rulesSplit(ta);
  const rb = rulesSplit(tb);

  const rows: [string, (s: Stats) => React.ReactNode, ((s: Stats) => number)?][] = [
    ['Closed trades', (s) => s.closed],
    ['Total P&L', (s) => <span>{fmtUsd(s.totalPnl, true)} <span className="faint small">{fmtInr(s.totalPnl * settings.usdInr, true)}</span></span>, (s) => s.totalPnl],
    ['Total R', (s) => fmtR(s.totalR), (s) => s.totalR],
    ['Win rate', (s) => fmtPct(s.winRate)],
    ['Average R:R', (s) => `1 : ${fmtNum(s.avgRR, 1)}`],
    ['Avg win / loss', (s) => `${fmtR(s.avgWinR)} / ${fmtR(s.avgLossR)}`],
    ['Expectancy', (s) => fmtR(s.expectancy, 2), (s) => s.expectancy],
    ['Max drawdown', (s) => fmtR(s.maxDdR), (s) => s.maxDdR],
    ['Best win streak', (s) => s.bestWinStreak],
    ['Worst loss streak', (s) => s.worstLossStreak],
    ['Avg holding time', (s) => fmtDuration(s.avgHoldMs)],
  ];

  const picker = (val: string, other: string, set: (v: string) => void, color: string) => (
    <div className="field" style={{ flex: 1, minWidth: 200 }}>
      <label className="row" style={{ gap: 6 }}>
        <span style={{ width: 14, height: 3, borderRadius: 2, background: color }} /> Journal
      </label>
      <select className="input" value={val} onChange={(e) => choose(e.target.value, set)}>
        {journals.map((j) => (
          <option key={j.id} value={j.id} disabled={j.id === other}>
            {j.pinHash && !isUnlocked(j) ? '🔒 ' : ''}
            {j.name}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="page">
      <PageHeader title="Compare" subtitle="Two journals side by side" />
      <div className="card row wrap" style={{ gap: 16 }}>
        {picker(a, b, setA, 'var(--accent)')}
        {picker(b, a, setB, 'var(--series2)')}
      </div>
      <div className="card">
        <div className="card-title">Equity curves (R)</div>
        <LineChart
          series={[
            { name: ja?.name ?? 'A', color: 'var(--accent)', points: sa.equity.map((e) => e.r) },
            { name: jb?.name ?? 'B', color: 'var(--series2)', points: sb.equity.map((e) => e.r) },
          ]}
          format={(v) => fmtR(v, 2)}
          height={260}
        />
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Stat</th>
                <th className="num">{ja?.name}</th>
                <th className="num">{jb?.name}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, f, toneOf]) => (
                <tr key={label}>
                  <td className="muted">{label}</td>
                  <td className={`num bold ${toneOf ? tone(toneOf(sa)) : ''}`}>{f(sa)}</td>
                  <td className={`num bold ${toneOf ? tone(toneOf(sb)) : ''}`}>{f(sb)}</td>
                </tr>
              ))}
              <tr>
                <td className="muted">Rules followed</td>
                <td className="num bold">{ra.followed.count} · {fmtR(ra.followed.r)}</td>
                <td className="num bold">{rb.followed.count} · {fmtR(rb.followed.r)}</td>
              </tr>
              <tr>
                <td className="muted">Rules broken</td>
                <td className="num bold loss">{ra.broken.count} · {fmtR(ra.broken.r)}</td>
                <td className="num bold loss">{rb.broken.count} · {fmtR(rb.broken.r)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
