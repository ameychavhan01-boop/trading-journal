import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { Money } from '../components/Money';
import { EmotionCard, MistakesCard, RulesCard } from '../components/Psychology';
import { useApp } from '../state/AppContext';
import { useActiveTrades, useStrategyMap } from '../state/hooks';
import { updateSettings } from '../data/api';
import { bestWorst, byTimeBlock, byWeekday, computeStats, mistakeStats, rulesSplit, type CT } from '../lib/calc';
import { inPeriod, periodsWithTrades, type Period } from '../lib/reviews';
import { fmtDate, TIME_BLOCKS_LONG, WEEKDAYS_LONG } from '../lib/time';
import { fmtPct, fmtR, tone } from '../lib/format';
import { saveFile } from '../lib/files';

export default function Reviews() {
  const { active, settings, toast } = useApp();
  const all = useActiveTrades() ?? [];
  const strategies = useStrategyMap();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [kind, setKind] = useState<'week' | 'month'>(params.get('p')?.startsWith('m:') ? 'month' : 'week');
  const periods = useMemo(() => periodsWithTrades(all, kind), [all, kind]);
  const selectedKey = params.get('p');
  const selected: Period | undefined = periods.find((p) => p.key === selectedKey) ?? periods[0];

  // mark review as seen (removes the dashboard banner)
  useEffect(() => {
    if (!selected || selected.to > Date.now()) return; // only finished periods count as "seen"
    if (selected.kind === 'week' && settings.seenWeeklyReview !== selected.key && (!settings.seenWeeklyReview || selected.key > settings.seenWeeklyReview))
      updateSettings({ seenWeeklyReview: selected.key });
    if (selected.kind === 'month' && settings.seenMonthlyReview !== selected.key && (!settings.seenMonthlyReview || selected.key > settings.seenMonthlyReview))
      updateSettings({ seenMonthlyReview: selected.key });
  }, [selected?.key]);

  if (!active) return <div className="empty">Unlock a journal first.</div>;

  return (
    <div className="page">
      <PageHeader
        title="Reviews"
        subtitle={`${active.name} · automatic weekly (Mon–Sun) and monthly summaries`}
        actions={
          <div className="seg">
            {(['week', 'month'] as const).map((k) => (
              <button
                key={k}
                className={kind === k ? 'on' : ''}
                onClick={() => {
                  setKind(k);
                  navigate('/reviews', { replace: true });
                }}
              >
                {k === 'week' ? 'Weekly' : 'Monthly'}
              </button>
            ))}
          </div>
        }
      />
      {!periods.length ? (
        <div className="card empty">No closed trades yet. Reviews appear automatically once you close trades.</div>
      ) : (
        <>
          <div className="row" style={{ gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {periods.map((p) => (
              <button
                key={p.key}
                className={`chip ${selected?.key === p.key ? 'on' : ''}`}
                style={{ flex: 'none' }}
                onClick={() => navigate(`/reviews?p=${encodeURIComponent(p.key)}`, { replace: true })}
              >
                {p.label}
              </button>
            ))}
          </div>
          {selected && (
            <ReviewBody
              period={selected}
              list={inPeriod(all, selected)}
              onPdf={async () => {
                try {
                  const { buildPdfReport } = await import('../lib/pdf');
      const blob = buildPdfReport({ journal: active, list: inPeriod(all, selected).filter((x) => x.c.closed), periodLabel: selected.label, usdInr: settings.usdInr, strategies });
                  await saveFile(blob, `review-${selected.key.replace(':', '-')}.pdf`);
                } catch {
                  toast('PDF cancelled');
                }
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function ReviewBody({ period, list, onPdf }: { period: Period; list: CT[]; onPdf: () => void }) {
  const navigate = useNavigate();
  const s = computeStats(list);
  const day = bestWorst(byWeekday(list, WEEKDAYS_LONG));
  const time = bestWorst(byTimeBlock(list, TIME_BLOCKS_LONG));
  const mistakes = mistakeStats(list);
  const rules = rulesSplit(list);
  const emo = list.filter((x) => x.c.closed && x.t.emotion);
  const avgEmo = emo.length ? emo.reduce((a, x) => a + (x.t.emotion ?? 0), 0) / emo.length : 0;

  const tradeLine = (label: string, x?: CT) =>
    x ? (
      <div className="list-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/trades/${x.t.id}`)}>
        <span className="muted small" style={{ width: 90 }}>
          {label}
        </span>
        <span className="bold spacer">
          {x.t.symbol} <span className="faint small">{fmtDate(x.t.exitAt ?? x.t.entryAt)}</span>
        </span>
        <span className={`bold ${tone(x.c.r)}`}>{fmtR(x.c.r ?? 0)}</span>
        <Money usd={x.c.pnlUsd} right />
      </div>
    ) : null;

  return (
    <>
      <div className="card">
        <div className="card-title">
          {period.kind === 'week' ? 'Week' : 'Month'} · {period.label}
          <span className="spacer" />
          <button className="btn sm" onClick={onPdf}>
            <FileText size={15} /> PDF
          </button>
        </div>
        <div className="grid g-5">
          <div>
            <div className="stat-label">Total R</div>
            <div className={`stat-value ${tone(s.totalR)}`}>{fmtR(s.totalR)}</div>
          </div>
          <div>
            <div className="stat-label">P&amp;L</div>
            <div className="stat-value" style={{ fontSize: 22 }}>
              <Money usd={s.totalPnl} />
            </div>
          </div>
          <div>
            <div className="stat-label">Trades</div>
            <div className="stat-value">{s.closed}</div>
          </div>
          <div>
            <div className="stat-label">Win rate</div>
            <div className="stat-value">{fmtPct(s.winRate, 0)}</div>
            <div className="stat-sub">
              {s.wins}W · {s.losses}L
            </div>
          </div>
          <div>
            <div className="stat-label">Rules broken</div>
            <div className={`stat-value ${rules.broken.count ? 'loss' : ''}`}>{rules.broken.count}</div>
            <div className="stat-sub">{rules.broken.count ? `cost ${fmtR(rules.broken.r)}` : 'clean'}</div>
          </div>
        </div>
      </div>

      <div className="grid g-2">
        <div className="card">
          <div className="card-title">Best and worst trade</div>
          {tradeLine('Best', s.bestTrade)}
          {s.worstTrade !== s.bestTrade && tradeLine('Worst', s.worstTrade)}
        </div>
        <div className="card">
          <div className="card-title">When you trade best</div>
          <div className="list-row">
            <span className="muted small" style={{ width: 90 }}>Best day</span>
            <span className="bold spacer">{day.best?.label ?? '–'}</span>
            {day.best && <span className={`bold ${tone(day.best.r)}`}>{fmtR(day.best.r)}</span>}
          </div>
          <div className="list-row">
            <span className="muted small" style={{ width: 90 }}>Best time</span>
            <span className="bold spacer">{time.best?.label ?? '–'}</span>
            {time.best && <span className={`bold ${tone(time.best.r)}`}>{fmtR(time.best.r)}</span>}
          </div>
          <div className="list-row">
            <span className="muted small" style={{ width: 90 }}>Top mistake</span>
            <span className="bold spacer">{mistakes[0]?.tag ?? 'None'}</span>
            {mistakes[0] && <span className={`bold ${tone(mistakes[0].r)}`}>{fmtR(mistakes[0].r)}</span>}
          </div>
          <div className="list-row">
            <span className="muted small" style={{ width: 90 }}>Avg emotion</span>
            <span className="bold spacer">{avgEmo ? avgEmo.toFixed(1) + ' / 5' : '–'}</span>
          </div>
        </div>
      </div>

      <div className="grid g-3">
        <EmotionCard list={list} />
        <MistakesCard list={list} />
        <RulesCard list={list} />
      </div>
    </>
  );
}
