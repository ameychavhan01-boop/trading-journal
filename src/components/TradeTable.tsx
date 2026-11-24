import { useNavigate } from 'react-router-dom';
import type { CT } from '../lib/calc';
import type { Journal, Strategy } from '../data/types';
import { fmtDate, fmtTime } from '../lib/time';
import { fmtR, tone } from '../lib/format';
import { Money } from './Money';

export type SortKey = 'date' | 'symbol' | 'r' | 'pnl' | 'grade';

function Tags({ x }: { x: CT }) {
  return (
    <span className="row wrap" style={{ gap: 4 }}>
      {x.c.rulesBroken && <span className="pill loss">Rules broken</span>}
      {(x.t.mistakes ?? []).slice(0, 2).map((m) => (
        <span key={m} className="pill warning">
          {m}
        </span>
      ))}
      {(x.t.mistakes?.length ?? 0) > 2 && <span className="pill">+{x.t.mistakes!.length - 2}</span>}
    </span>
  );
}

export function SidePill({ side }: { side: 'long' | 'short' }) {
  return <span className={`pill ${side === 'long' ? 'profit' : 'loss'}`}>{side === 'long' ? 'Long' : 'Short'}</span>;
}

function setupText(x: CT, strategies: Map<string, Strategy>) {
  const s = x.t.strategyId ? strategies.get(x.t.strategyId)?.name : undefined;
  return [s, x.t.entryTf].filter(Boolean).join(' · ') || '–';
}

export function TradeTable({
  rows,
  strategies,
  journals,
  sort,
  onSort,
}: {
  rows: CT[];
  strategies: Map<string, Strategy>;
  journals?: Journal[];
  sort?: { key: SortKey; dir: 1 | -1 };
  onSort?: (k: SortKey) => void;
}) {
  const navigate = useNavigate();
  const jName = new Map((journals ?? []).map((j) => [j.id, j.name]));
  const th = (k: SortKey | null, label: string, cls = '') => (
    <th
      className={`${cls} ${k && onSort ? 'sortable' : ''}`}
      onClick={() => k && onSort?.(k)}
    >
      {label}
      {k && sort?.key === k ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  );
  if (!rows.length) return <div className="empty">No trades yet.</div>;
  return (
    <>
      <div className="table-wrap hide-mobile">
        <table className="tbl">
          <thead>
            <tr>
              {th('date', 'Date & time')}
              {journals && th(null, 'Journal')}
              {th('symbol', 'Market')}
              {th(null, 'Side')}
              {th(null, 'Setup')}
              {th('r', 'Result', 'num')}
              {th('pnl', 'P&L', 'num')}
              {th('grade', 'Grade')}
              {th(null, 'Tags')}
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.t.id} className="clickable" onClick={() => navigate(`/trades/${x.t.id}`)}>
                <td>
                  <div className="bold">{fmtDate(x.t.entryAt)}</div>
                  <div className="faint tiny">{fmtTime(x.t.entryAt)}</div>
                </td>
                {journals && <td className="muted">{jName.get(x.t.journalId)}</td>}
                <td className="bold">{x.t.symbol}</td>
                <td>
                  <SidePill side={x.t.side} />
                </td>
                <td className="muted">{setupText(x, strategies)}</td>
                <td className={`num bold ${tone(x.c.r)}`}>{x.c.closed ? fmtR(x.c.r!) : <span className="pill accent">Open</span>}</td>
                <td className="num">{x.c.closed ? <Money usd={x.c.pnlUsd} right /> : <span className="faint">–</span>}</td>
                <td>{x.t.grade ? <span className="grade">{x.t.grade}</span> : <span className="faint">–</span>}</td>
                <td>
                  <Tags x={x} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="hide-desktop">
        {rows.map((x) => (
          <div key={x.t.id} className="list-row" style={{ cursor: 'pointer', alignItems: 'flex-start', padding: '10px 0' }} onClick={() => navigate(`/trades/${x.t.id}`)}>
            <div className="spacer col" style={{ gap: 4 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="bold">{x.t.symbol}</span>
                <SidePill side={x.t.side} />
                {x.t.grade && <span className="grade">{x.t.grade}</span>}
              </div>
              <div className="faint tiny">
                {fmtDate(x.t.entryAt)} · {fmtTime(x.t.entryAt)} · {setupText(x, strategies)}
              </div>
              <Tags x={x} />
            </div>
            <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
              {x.c.closed ? (
                <>
                  <span className={`bold ${tone(x.c.r)}`}>{fmtR(x.c.r!)}</span>
                  <Money usd={x.c.pnlUsd} right />
                </>
              ) : (
                <span className="pill accent">Open</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
