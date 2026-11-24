import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Circle, Pencil, Trash2, LogOut } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { ConfirmModal } from '../components/Modal';
import { SavedShot } from '../components/inputs';
import { Money } from '../components/Money';
import { SidePill } from '../components/TradeTable';
import { useApp } from '../state/AppContext';
import { deleteTrade, useTrade } from '../data/api';
import { useStrategyMap } from '../state/hooks';
import { calcTrade } from '../lib/calc';
import { fmtDateTime, fmtDuration } from '../lib/time';
import { fmtNum, fmtPrice, fmtR, tone } from '../lib/format';
import { EMOTIONS } from './TradeForm';

export default function TradeDetail() {
  const { id } = useParams();
  const t = useTrade(id);
  const navigate = useNavigate();
  const { ctx, journals, isUnlocked, settings, toast } = useApp();
  const strategies = useStrategyMap();
  const [confirm, setConfirm] = useState(false);

  if (t === undefined) return <div className="empty">Loading…</div>;
  if (t === null) return <div className="empty">This trade was not found.</div>;
  const journal = journals.find((j) => j.id === t.journalId);
  if (!journal || !isUnlocked(journal)) return <div className="empty">This trade belongs to a hidden or locked journal.</div>;

  const c = calcTrade(t, ctx);
  const strategy = t.strategyId ? strategies.get(t.strategyId) : undefined;
  const label = (k: string, fb: string) => settings.fields.find((x) => x.key === k)?.label ?? fb;

  const kv = (k: string, v: React.ReactNode) => (
    <div>
      <div className="stat-label">{k}</div>
      <div className="bold" style={{ marginTop: 3 }}>
        {v ?? <span className="faint">–</span>}
      </div>
    </div>
  );

  return (
    <div className="page">
      <PageHeader
        title={`${t.symbol}`}
        badge={
          <span className="row" style={{ gap: 6 }}>
            <SidePill side={t.side} />
            {t.status === 'open' && <span className="pill accent">Open</span>}
            {c.rulesBroken && <span className="pill loss">Rules broken</span>}
          </span>
        }
        subtitle={`${journal.name} · ${fmtDateTime(t.entryAt)}`}
        actions={
          <>
            <button className="btn icon" onClick={() => navigate(-1)} aria-label="Back">
              <ArrowLeft size={18} />
            </button>
            {t.status === 'open' && (
              <Link className="btn primary" to={`/edit/${t.id}?close=1`}>
                <LogOut size={17} /> Close trade
              </Link>
            )}
            <Link className="btn" to={`/edit/${t.id}`}>
              <Pencil size={17} /> Edit
            </Link>
            <button className="btn danger" onClick={() => setConfirm(true)}>
              <Trash2 size={17} /> <span className="hide-mobile">Delete</span>
            </button>
          </>
        }
      />

      <div className="grid g-4">
        <div className="card">
          <div className="stat-label">Result</div>
          <div className={`stat-value ${tone(c.r)}`}>{c.closed ? fmtR(c.r!, 2) : 'Open'}</div>
          <div className="stat-sub">{c.result ? { win: 'Win', loss: 'Loss', be: 'Breakeven' }[c.result] : 'Not closed yet'}</div>
        </div>
        <div className="card">
          <div className="stat-label">P&amp;L</div>
          <div className="stat-value">{c.closed ? <Money usd={c.pnlUsd} /> : <span className="faint">–</span>}</div>
        </div>
        <div className="card">
          <div className="stat-label">Risk (1R)</div>
          <div className="stat-value">
            <Money usd={c.riskUsd} signed={false} colored={false} />
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Planned R:R</div>
          <div className="stat-value">{c.plannedRR != null ? `1 : ${fmtNum(c.plannedRR, 1)}` : '–'}</div>
          <div className="stat-sub">Held {c.holdMs ? fmtDuration(c.holdMs) : '–'}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Trade</div>
        <div className="grid g-4" style={{ rowGap: 18 }}>
          {kv('Market', t.marketType === 'crypto' ? 'Crypto' : 'Indian stock')}
          {kv(label('entry', 'Entry price'), fmtPrice(t.entry, t.marketType))}
          {kv(label('stopLoss', 'Stop loss'), fmtPrice(t.stopLoss, t.marketType))}
          {kv(label('target', 'Target'), t.target != null ? fmtPrice(t.target, t.marketType) : null)}
          {kv(label('exit', 'Exit price'), t.exit != null ? fmtPrice(t.exit, t.marketType) : null)}
          {kv(label('quantity', 'Size'), `${t.quantity}${c.contractSize !== 1 ? ` × ${c.contractSize}` : ''}`)}
          {kv(label('leverage', 'Leverage'), t.leverage ? `${t.leverage}x` : null)}
          {kv(label('fees', 'Fees'), t.fees ? fmtPrice(t.fees, t.marketType) : null)}
          {kv(label('entryAt', 'Entry'), fmtDateTime(t.entryAt))}
          {kv(label('exitAt', 'Exit'), t.exitAt ? fmtDateTime(t.exitAt) : null)}
          {kv(label('strategyId', 'Strategy'), strategy?.name)}
          {kv(label('entryTf', 'Entry timeframe'), t.entryTf)}
          {kv(label('htfTrend', 'HTF trend'), t.htfTrend ? { up: 'Up', down: 'Down', range: 'Range' }[t.htfTrend] : null)}
          {kv(label('emotion', 'Emotion'), t.emotion ? `${t.emotion} · ${EMOTIONS[t.emotion - 1]}` : null)}
          {kv(label('grade', 'Grade'), t.grade ? <span className="grade">{t.grade}</span> : null)}
          {settings.customFields.map((cf) => {
            const v = t.custom?.[cf.id];
            const shown = v == null || v === '' ? null : cf.type === 'yesno' ? (v ? 'Yes' : 'No') : cf.type === 'datetime' ? fmtDateTime(v as number) : String(v);
            return <div key={cf.id}>{kv(cf.label, shown)}</div>;
          })}
        </div>
        {!!t.mistakes?.length && (
          <>
            <div className="divider" />
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="muted small">Mistakes:</span>
              {t.mistakes.map((m) => (
                <span key={m} className="pill warning">
                  {m}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {t.checklist && Object.keys(t.checklist).length > 0 && (
        <div className="card">
          <div className="card-title">Rules checklist {strategy && <span className="faint small">{strategy.name}</span>}</div>
          {Object.entries(t.checklist).map(([rule, ok]) => (
            <div key={rule} className="row" style={{ minHeight: 34 }}>
              {ok ? <CheckCircle2 size={18} className="profit" /> : <Circle size={18} className="loss" />}
              <span className={ok ? '' : 'loss'}>{rule}</span>
            </div>
          ))}
        </div>
      )}

      {(t.beforeShotId || t.afterShotId) && (
        <div className="card">
          <div className="card-title">Screenshots</div>
          <div className="shots">
            <SavedShot id={t.beforeShotId} label="Before (entry)" />
            <SavedShot id={t.afterShotId} label="After (exit)" />
          </div>
        </div>
      )}

      {(t.notes?.why || t.notes?.well || t.notes?.lesson) && (
        <div className="card">
          <div className="card-title">Notes</div>
          <div className="grid g-3">
            {(
              [
                ['why', 'Why I entered'],
                ['well', 'What went well'],
                ['lesson', 'Lesson'],
              ] as const
            ).map(([k, l]) => (
              <div key={k}>
                <div className="stat-label">{l}</div>
                <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{t.notes?.[k] || <span className="faint">–</span>}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          title="Delete this trade?"
          message={`${t.symbol} from ${fmtDateTime(t.entryAt)} and its screenshots will be deleted. This cannot be undone.`}
          onConfirm={async () => {
            await deleteTrade(t.id);
            toast('Trade deleted');
            navigate('/trades');
          }}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
