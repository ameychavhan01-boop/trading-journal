import { byEmotion, gradeCounts, mistakeStats, rulesSplit, type CT } from '../lib/calc';
import { fmtPct, fmtR, tone } from '../lib/format';

const EMO = ['1 · Calm', '2 · Relaxed', '3 · Neutral', '4 · Nervous', '5 · Fearful'];

export function EmotionCard({ list }: { list: CT[] }) {
  const b = byEmotion(list, EMO);
  const max = Math.max(...b.map((x) => Math.abs(x.r)), 0.001);
  const fear = b.slice(3);
  const fearR = fear.reduce((s, x) => s + x.r, 0);
  const fearN = fear.reduce((s, x) => s + x.count, 0);
  return (
    <div className="card">
      <div className="card-title">Result by emotion (1 calm – 5 fearful)</div>
      {b.map((x) => {
        const w = (Math.abs(x.r) / max) * 60;
        return (
          <div className="hbar-row" key={x.label} title={`${x.count} trades`}>
            <span className="muted">{x.label}</span>
            <div className="hbar">
              <div className="mid" />
              {x.count > 0 && (
                <div
                  className="b"
                  style={{
                    left: x.r >= 0 ? '40%' : `${40 - w}%`,
                    width: `${Math.max(w, 1.5)}%`,
                    background: x.r >= 0 ? 'var(--profit)' : 'var(--loss)',
                  }}
                />
              )}
            </div>
            <span className={`bold ${tone(x.r)}`} style={{ textAlign: 'right' }}>
              {x.count ? fmtR(x.r) : '–'}
            </span>
            <span className="faint" style={{ textAlign: 'right' }}>
              {x.count}
            </span>
          </div>
        );
      })}
      {fearN > 0 && (
        <div className={`banner ${fearR < 0 ? 'loss' : ''}`} style={{ marginTop: 12, padding: '8px 12px', minHeight: 0 }}>
          <span className="small bold">
            When fear is 4–5 you {fearR < 0 ? 'lost' : 'made'} {fmtR(fearR)} in {fearN} trade{fearN === 1 ? '' : 's'}.
          </span>
        </div>
      )}
    </div>
  );
}

export function MistakesCard({ list }: { list: CT[] }) {
  const m = mistakeStats(list).slice(0, 5);
  const max = Math.max(...m.map((x) => Math.abs(x.r)), 0.001);
  return (
    <div className="card">
      <div className="card-title">Top mistakes</div>
      {!m.length && <div className="muted small">No mistakes tagged yet. Nice – or start tagging them.</div>}
      {m.map((x) => (
        <div key={x.tag}>
          <div className="row small">
            <span className="bold spacer">{x.tag}</span>
            <span className="faint">
              {x.count} trade{x.count === 1 ? '' : 's'}
            </span>
            <span className={`bold ${tone(x.r)}`}>{fmtR(x.r)}</span>
          </div>
          <div className="meter">
            <div style={{ width: `${(Math.abs(x.r) / max) * 100}%`, background: x.r >= 0 ? 'var(--warning)' : 'var(--loss)' }} />
          </div>
        </div>
      ))}
      {m.length > 0 && <div className="faint tiny">Total R of trades with this mistake</div>}
    </div>
  );
}

export function RulesCard({ list }: { list: CT[] }) {
  const s = rulesSplit(list);
  const g = gradeCounts(list.filter((x) => x.c.closed));
  return (
    <div className="card">
      <div className="card-title">Rules followed vs broken</div>
      <div className="grid g-2" style={{ gap: 10 }}>
        <div className="tile profit">
          <div className="profit small bold">Followed</div>
          <div className="stat-value profit" style={{ fontSize: 22 }}>
            {fmtR(s.followed.r)}
          </div>
          <div className="stat-sub">
            {s.followed.count} trades · {fmtPct(s.followed.winRate, 0)} win
          </div>
        </div>
        <div className="tile loss">
          <div className="loss small bold">Broken</div>
          <div className="stat-value loss" style={{ fontSize: 22 }}>
            {fmtR(s.broken.r)}
          </div>
          <div className="stat-sub">
            {s.broken.count} trades · {fmtPct(s.broken.winRate, 0)} win
          </div>
        </div>
      </div>
      <div className="row muted small" style={{ marginTop: 14, gap: 14 }}>
        Grades:
        {(['A', 'B', 'C'] as const).map((k) => (
          <span key={k}>
            <b style={{ color: 'var(--text)' }}>{k}</b> {g[k]}
          </span>
        ))}
      </div>
    </div>
  );
}
