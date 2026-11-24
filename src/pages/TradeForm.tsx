import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Camera, AlertTriangle, Plus, Save, Rewind } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { DateTime12, Seg, ShotSlot } from '../components/inputs';
import { useApp } from '../state/AppContext';
import { useCalcTrades } from '../state/hooks';
import { deleteScreenshot, saveScreenshot, saveTrade, uid, updateSettings, useStrategies, useTrade } from '../data/api';
import type { CustomField, Grade, HtfTrend, MarketType, Side, Trade, TradeStatus } from '../data/types';
import { TIMEFRAMES } from '../data/defaults';
import { calcTrade, dailyRisk, contractSizeFor } from '../lib/calc';
import { fmtNum, fmtR, parseNum } from '../lib/format';
import { compressImage } from '../lib/files';
import { Money } from '../components/Money';

interface FormState {
  journalId: string;
  marketType: MarketType;
  symbol: string;
  side: Side;
  status: TradeStatus;
  strategyId?: string;
  entryTf?: string;
  htfTrend?: HtfTrend;
  entry: string;
  stopLoss: string;
  target: string;
  exit: string;
  quantity: string;
  leverage: string;
  fees: string;
  entryAt: number;
  exitAt?: number;
  checklist: Record<string, boolean>;
  emotion?: number;
  mistakes: string[];
  grade?: Grade;
  notes: { why?: string; well?: string; lesson?: string };
  custom: Record<string, string | number | boolean | null>;
}

const s = (n: number | undefined) => (n == null ? '' : String(n));

function fromTrade(t: Trade): FormState {
  return {
    journalId: t.journalId,
    marketType: t.marketType,
    symbol: t.symbol,
    side: t.side,
    status: t.status,
    strategyId: t.strategyId,
    entryTf: t.entryTf,
    htfTrend: t.htfTrend,
    entry: s(t.entry),
    stopLoss: s(t.stopLoss),
    target: s(t.target),
    exit: s(t.exit),
    quantity: s(t.quantity),
    leverage: s(t.leverage),
    fees: s(t.fees),
    entryAt: t.entryAt,
    exitAt: t.exitAt,
    checklist: { ...(t.checklist ?? {}) },
    emotion: t.emotion,
    mistakes: [...(t.mistakes ?? [])],
    grade: t.grade,
    notes: { ...(t.notes ?? {}) },
    custom: { ...(t.custom ?? {}) },
  };
}

export default function TradeForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const closing = params.get('close') === '1';
  const navigate = useNavigate();
  const { settings, journals, active, isUnlocked, toast, comingSoon, ctx } = useApp();
  const existing = useTrade(id);
  const strategies = useStrategies() ?? [];
  const [f, setF] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [before, setBefore] = useState<Blob | null | undefined>(undefined);
  const [after, setAfter] = useState<Blob | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [newTag, setNewTag] = useState('');

  const accessible = journals.filter(isUnlocked);

  // initialise the form
  useEffect(() => {
    if (f) return;
    if (id) {
      if (existing === undefined) return;
      if (existing === null) return;
      const st = fromTrade(existing);
      if (closing && st.status === 'open') {
        st.status = 'closed';
        st.exitAt = st.exitAt ?? Date.now();
      }
      setF(st);
    } else if (active) {
      setF({
        journalId: active.id,
        marketType: 'crypto',
        symbol: '',
        side: 'long',
        status: 'closed',
        entry: '',
        stopLoss: '',
        target: '',
        exit: '',
        quantity: '',
        leverage: '',
        fees: '',
        entryAt: Date.now(),
        exitAt: Date.now(),
        checklist: {},
        mistakes: [],
        notes: {},
        custom: {},
      });
    }
  }, [id, existing, active, f, closing]);

  const journalTrades = useCalcTrades(f ? [f.journalId] : []);
  const journal = journals.find((j) => j.id === f?.journalId);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((cur) => (cur ? { ...cur, [k]: v } : cur));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const strategy = strategies.find((x) => x.id === f?.strategyId);

  // build a Trade from the form (for the live preview and for saving)
  const draft: Trade | null = useMemo(() => {
    if (!f) return null;
    return {
      id: existing?.id ?? 'draft',
      journalId: f.journalId,
      marketType: f.marketType,
      symbol: f.symbol.trim().toUpperCase(),
      side: f.side,
      status: f.status,
      strategyId: f.strategyId || undefined,
      entryTf: f.entryTf || undefined,
      htfTrend: f.htfTrend,
      entry: parseNum(f.entry) ?? NaN,
      stopLoss: parseNum(f.stopLoss) ?? NaN,
      target: parseNum(f.target),
      exit: f.status === 'closed' ? parseNum(f.exit) : undefined,
      quantity: parseNum(f.quantity) ?? NaN,
      leverage: parseNum(f.leverage),
      fees: parseNum(f.fees),
      entryAt: f.entryAt,
      exitAt: f.status === 'closed' ? f.exitAt : undefined,
      checklist: strategy && strategy.checklist.length ? Object.fromEntries(strategy.checklist.map((r) => [r, !!f.checklist[r]])) : undefined,
      emotion: f.emotion,
      mistakes: f.mistakes,
      grade: f.grade,
      beforeShotId: existing?.beforeShotId,
      afterShotId: existing?.afterShotId,
      notes: f.notes,
      custom: f.custom,
      isSample: existing?.isSample,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
  }, [f, strategy, existing]);

  const preview = draft && isFinite(draft.entry) && isFinite(draft.stopLoss) && isFinite(draft.quantity) ? calcTrade(draft, ctx) : null;
  const risk = journal && journalTrades && !id ? dailyRisk(journalTrades, journal) : null;

  if (id && existing === null) return <div className="empty">This trade was not found.</div>;
  if (existing && !accessible.some((j) => j.id === existing.journalId))
    return <div className="empty">This trade belongs to a hidden or locked journal.</div>;
  if (!f || !draft) {
    if (!active && !id) return <div className="empty">Unlock or create a journal first (Settings → Journals).</div>;
    return <div className="empty">Loading…</div>;
  }

  const validate = () => {
    const e: Record<string, string> = {};
    if (!f.symbol.trim()) e.symbol = 'Required';
    if (!isFinite(draft.entry) || draft.entry <= 0) e.entry = 'Enter a price';
    if (!isFinite(draft.stopLoss) || draft.stopLoss <= 0) e.stopLoss = 'Enter a stop loss';
    else if (draft.stopLoss === draft.entry) e.stopLoss = 'Stop loss cannot equal entry';
    else if (f.side === 'long' && draft.stopLoss > draft.entry) e.stopLoss = 'For a long, stop loss must be below entry';
    else if (f.side === 'short' && draft.stopLoss < draft.entry) e.stopLoss = 'For a short, stop loss must be above entry';
    if (!isFinite(draft.quantity) || draft.quantity <= 0) e.quantity = 'Enter a size';
    if (f.status === 'closed' && (draft.exit == null || !isFinite(draft.exit))) e.exit = 'Add the exit price, or save as Open';
    if (f.status === 'closed' && f.exitAt && f.exitAt < f.entryAt) e.exitAt = 'Exit time is before entry time';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) {
      toast('Please fix the highlighted fields');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true);
    try {
      const t: Trade = { ...draft, id: existing?.id ?? uid() };
      if (t.status === 'closed' && !t.exitAt) t.exitAt = Date.now();
      for (const [slot, blob] of [
        ['beforeShotId', before],
        ['afterShotId', after],
      ] as const) {
        if (blob === undefined) continue;
        const old = t[slot];
        if (old) await deleteScreenshot(old);
        t[slot] = blob ? await saveScreenshot(blob) : undefined;
      }
      await saveTrade(t);
      const c = calcTrade(t, ctx);
      toast(c.rulesBroken ? 'Saved – marked “Rules broken”' : id ? 'Trade updated' : 'Trade saved');
      navigate(id ? `/trades/${t.id}` : '/trades');
    } finally {
      setSaving(false);
    }
  };

  const fieldsCfg = settings.fields;
  const label = (key: string, fallback: string) => fieldsCfg.find((x) => x.key === key)?.label ?? fallback;
  const symbols = Array.from(
    new Set([...Object.keys(settings.contractSizes), ...(journalTrades ?? []).map((x) => x.t.symbol)]),
  ).sort();
  const cs = contractSizeFor({ marketType: f.marketType, symbol: f.symbol }, ctx);
  const cur = f.marketType === 'stock' ? '₹' : '$';
  const err = (k: string) => errors[k] && <span className="loss tiny">{errors[k]}</span>;

  const numInput = (k: 'entry' | 'stopLoss' | 'target' | 'exit' | 'quantity' | 'leverage' | 'fees', placeholder = '') => (
    <input
      className={`input ${errors[k] ? 'invalid' : ''}`}
      inputMode="decimal"
      value={f[k]}
      placeholder={placeholder}
      onChange={(e) => set(k, e.target.value)}
    />
  );

  const optional = fieldsCfg.filter((x) => x.visible && !['marketType', 'symbol', 'side', 'entry', 'stopLoss', 'quantity'].includes(x.key));

  const renderField = (key: string, lbl: string) => {
    const custom = settings.customFields.find((c) => c.id === key);
    if (custom) return <CustomInput key={key} field={custom} label={lbl} value={f.custom[key]} onChange={(v) => set('custom', { ...f.custom, [key]: v })} />;
    switch (key) {
      case 'strategyId':
        return (
          <div className="field" key={key}>
            <label>{lbl}</label>
            <select className="input" value={f.strategyId ?? ''} onChange={(e) => set('strategyId', e.target.value || undefined)}>
              <option value="">No strategy</option>
              {strategies
                .filter((x) => !x.hidden || x.id === f.strategyId)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </div>
        );
      case 'checklist':
        if (!strategy || !strategy.checklist.length) return null;
        return (
          <div className="field span-all" key={key}>
            <label>
              {lbl} – {strategy.name}
            </label>
            <div className="card" style={{ padding: '6px 14px', background: 'var(--card2)' }}>
              {strategy.checklist.map((r) => (
                <label className="check" key={r}>
                  <input
                    type="checkbox"
                    checked={!!f.checklist[r]}
                    onChange={(e) => set('checklist', { ...f.checklist, [r]: e.target.checked })}
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>
            {strategy.checklist.some((r) => !f.checklist[r]) && (
              <span className="loss tiny">Not every rule is ticked – the trade will be saved with a “Rules broken” flag.</span>
            )}
          </div>
        );
      case 'target':
        return (
          <div className="field" key={key}>
            <label>
              {lbl} ({cur})
            </label>
            {numInput('target', 'Optional')}
          </div>
        );
      case 'exit':
        if (f.status !== 'closed') return null;
        return (
          <div className="field" key={key} id="exit-field">
            <label>
              {lbl} ({cur}) <span className="req">*</span>
            </label>
            {numInput('exit')}
            {err('exit')}
          </div>
        );
      case 'entryAt':
        return (
          <div className="field span-2" key={key}>
            <label>{lbl} (IST)</label>
            <DateTime12 value={f.entryAt} onChange={(v) => v != null && set('entryAt', v)} />
          </div>
        );
      case 'exitAt':
        if (f.status !== 'closed') return null;
        return (
          <div className="field span-2" key={key}>
            <label>{lbl} (IST)</label>
            <DateTime12 value={f.exitAt} onChange={(v) => set('exitAt', v)} allowEmpty />
            {err('exitAt')}
          </div>
        );
      case 'leverage':
        return (
          <div className="field" key={key}>
            <label>{lbl}</label>
            {numInput('leverage', 'e.g. 10')}
          </div>
        );
      case 'fees':
        return (
          <div className="field" key={key}>
            <label>
              {lbl} ({cur})
            </label>
            {numInput('fees', '0')}
          </div>
        );
      case 'entryTf':
        return (
          <div className="field" key={key}>
            <label>{lbl}</label>
            <select className="input" value={f.entryTf ?? ''} onChange={(e) => set('entryTf', e.target.value || undefined)}>
              <option value="">–</option>
              {TIMEFRAMES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
        );
      case 'htfTrend':
        return (
          <div className="field" key={key}>
            <label>{lbl}</label>
            <Seg
              full
              value={f.htfTrend}
              onChange={(v) => set('htfTrend', f.htfTrend === v ? undefined : v)}
              options={[
                { v: 'up', label: 'Up' },
                { v: 'down', label: 'Down' },
                { v: 'range', label: 'Range' },
              ]}
            />
          </div>
        );
      case 'emotion':
        return (
          <div className="field span-2" key={key}>
            <label>
              {lbl}: <b style={{ color: 'var(--text)' }}>{f.emotion ? `${f.emotion} · ${EMOTIONS[f.emotion - 1]}` : 'not set'}</b>
            </label>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={f.emotion ?? 3}
              onChange={(e) => set('emotion', +e.target.value)}
              onClick={(e) => set('emotion', +(e.target as HTMLInputElement).value)}
            />
            <div className="row faint tiny" style={{ justifyContent: 'space-between' }}>
              <span>1 Calm</span>
              <span>3 Neutral</span>
              <span>5 Very fearful</span>
            </div>
          </div>
        );
      case 'mistakes':
        return (
          <div className="field span-all" key={key}>
            <label>{lbl}</label>
            <div className="row wrap" style={{ gap: 8 }}>
              {settings.mistakeTags.map((tag) => {
                const on = f.mistakes.includes(tag);
                return (
                  <button
                    type="button"
                    key={tag}
                    className={`chip ${on ? 'on' : ''}`}
                    onClick={() => set('mistakes', on ? f.mistakes.filter((x) => x !== tag) : [...f.mistakes, tag])}
                  >
                    {tag}
                  </button>
                );
              })}
              <span className="row" style={{ gap: 6 }}>
                <input
                  className="input"
                  style={{ width: 150 }}
                  placeholder="New tag"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                />
                <button
                  type="button"
                  className="btn icon"
                  aria-label="Add tag"
                  onClick={async () => {
                    const tag = newTag.trim();
                    if (!tag) return;
                    if (!settings.mistakeTags.includes(tag)) await updateSettings({ mistakeTags: [...settings.mistakeTags, tag] });
                    if (!f.mistakes.includes(tag)) set('mistakes', [...f.mistakes, tag]);
                    setNewTag('');
                  }}
                >
                  <Plus size={18} />
                </button>
              </span>
            </div>
          </div>
        );
      case 'grade':
        return (
          <div className="field" key={key}>
            <label>{lbl}</label>
            <Seg
              full
              value={f.grade}
              onChange={(v) => set('grade', f.grade === v ? undefined : v)}
              options={[
                { v: 'A', label: 'A' },
                { v: 'B', label: 'B' },
                { v: 'C', label: 'C' },
              ]}
            />
            <span className="faint tiny">How well you followed your plan – not win or loss.</span>
          </div>
        );
      case 'screenshots':
        return (
          <div className="field span-all" key={key}>
            <label>{lbl}</label>
            <div className="shots">
              <ShotSlot
                label="Before"
                savedId={existing?.beforeShotId}
                pending={before}
                onPick={async (file) => setBefore(await compressImage(file))}
                onRemove={() => setBefore(null)}
              />
              <ShotSlot
                label="After"
                savedId={existing?.afterShotId}
                pending={after}
                onPick={async (file) => setAfter(await compressImage(file))}
                onRemove={() => setAfter(null)}
              />
            </div>
          </div>
        );
      case 'notes':
        return (
          <div className="field span-all" key={key}>
            <label>{lbl}</label>
            <div className="grid g-3">
              {(
                [
                  ['why', 'Why I entered'],
                  ['well', 'What went well'],
                  ['lesson', 'Lesson'],
                ] as const
              ).map(([k, l]) => (
                <div className="field" key={k}>
                  <span className="faint tiny">{l}</span>
                  <textarea className="input" value={f.notes[k] ?? ''} onChange={(e) => set('notes', { ...f.notes, [k]: e.target.value })} />
                </div>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="page">
      <PageHeader
        title={id ? (closing ? 'Close trade' : 'Edit trade') : 'Add trade'}
        subtitle={journal?.name}
        actions={
          <>
            {!id && (
              <Link className="btn" to="/quick">
                <Rewind size={17} /> Quick backtest
              </Link>
            )}
            <button className="btn" onClick={comingSoon}>
              <Camera size={17} /> Auto-fill from screenshot
            </button>
            <button className="btn primary hide-mobile" onClick={save} disabled={saving}>
              <Save size={17} /> Save trade
            </button>
          </>
        }
      />

      {risk && (risk.maxTradesHit || risk.lossLimitHit) && (
        <div className="banner warning">
          <AlertTriangle size={18} />
          <span className="bold">
            {risk.lossLimitHit ? 'Daily loss limit reached' : 'Max trades for today reached'}
          </span>
          <span className="small">You can still log this trade.</span>
        </div>
      )}

      <div className="card">
        <div className="card-title">Must-fill</div>
        <div className="form-grid">
          <div className="field">
            <label>Journal</label>
            <select className="input" value={f.journalId} onChange={(e) => set('journalId', e.target.value)}>
              {accessible.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{label('marketType', 'Market')}</label>
            <Seg
              full
              value={f.marketType}
              onChange={(v) => set('marketType', v)}
              options={[
                { v: 'crypto', label: 'Crypto' },
                { v: 'stock', label: 'Indian stock' },
              ]}
            />
          </div>
          <div className="field">
            <label>
              {label('symbol', 'Symbol')} <span className="req">*</span>
            </label>
            <input
              className={`input ${errors.symbol ? 'invalid' : ''}`}
              list="symbols"
              autoCapitalize="characters"
              autoCorrect="off"
              value={f.symbol}
              placeholder={f.marketType === 'crypto' ? 'BTCUSD' : 'RELIANCE'}
              onChange={(e) => set('symbol', e.target.value.toUpperCase())}
            />
            <datalist id="symbols">
              {symbols.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
            {err('symbol')}
          </div>
          <div className="field">
            <label>{label('side', 'Side')}</label>
            <Seg
              full
              value={f.side}
              onChange={(v) => set('side', v)}
              options={[
                { v: 'long', label: 'Long' },
                { v: 'short', label: 'Short' },
              ]}
            />
          </div>
          <div className="field">
            <label>Status</label>
            <Seg
              full
              value={f.status}
              onChange={(v) => {
                set('status', v);
                if (v === 'closed' && !f.exitAt) set('exitAt', Date.now());
              }}
              options={[
                { v: 'open', label: 'Open' },
                { v: 'closed', label: 'Closed' },
              ]}
            />
          </div>
          <div className="field">
            <label>
              {label('entry', 'Entry price')} ({cur}) <span className="req">*</span>
            </label>
            {numInput('entry')}
            {err('entry')}
          </div>
          <div className="field">
            <label>
              {label('stopLoss', 'Stop loss')} ({cur}) <span className="req">*</span>
            </label>
            {numInput('stopLoss')}
            {err('stopLoss')}
          </div>
          <div className="field">
            <label>
              {label('quantity', 'Size')} <span className="req">*</span>{' '}
              <span className="faint">
                {f.marketType === 'stock' ? '(shares)' : cs !== 1 ? `(contracts · 1 = ${cs} ${f.symbol.replace(/USD.*$/, '')})` : '(coins / contracts)'}
              </span>
            </label>
            {numInput('quantity')}
            {err('quantity')}
          </div>
        </div>

        {preview && (
          <>
            <div className="divider" />
            <div className="row wrap" style={{ gap: 28 }}>
              <div>
                <div className="stat-label">Risk to stop (1R)</div>
                <Money usd={preview.riskUsd} signed={false} colored={false} />
              </div>
              {preview.plannedRR != null && (
                <div>
                  <div className="stat-label">Planned R:R</div>
                  <div className="bold">1 : {fmtNum(preview.plannedRR, 1)}</div>
                </div>
              )}
              {preview.closed && (
                <>
                  <div>
                    <div className="stat-label">P&amp;L</div>
                    <Money usd={preview.pnlUsd} className="bold" />
                  </div>
                  <div>
                    <div className="stat-label">Result</div>
                    <div className={`bold ${preview.r! > 0 ? 'profit' : preview.r! < 0 ? 'loss' : ''}`}>{fmtR(preview.r!, 2)}</div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          More details <span className="faint small" style={{ fontWeight: 400 }}>optional – you can add these later</span>
        </div>
        <div className="form-grid">{optional.map((x) => renderField(x.key, x.label))}</div>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={() => navigate(-1)}>
          Cancel
        </button>
        <button className="btn primary" onClick={save} disabled={saving}>
          <Save size={17} /> Save trade
        </button>
      </div>
    </div>
  );
}

export const EMOTIONS = ['Calm', 'Relaxed', 'Neutral', 'Nervous', 'Fearful'];

function CustomInput({
  field,
  label,
  value,
  onChange,
}: {
  field: CustomField;
  label: string;
  value: string | number | boolean | null | undefined;
  onChange: (v: string | number | boolean | null) => void;
}) {
  switch (field.type) {
    case 'number':
      return (
        <div className="field">
          <label>{label}</label>
          <input className="input" inputMode="decimal" value={value == null ? '' : String(value)} onChange={(e) => onChange(parseNum(e.target.value) ?? null)} />
        </div>
      );
    case 'dropdown':
      return (
        <div className="field">
          <label>{label}</label>
          <select className="input" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || null)}>
            <option value="">–</option>
            {(field.options ?? []).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
      );
    case 'yesno':
      return (
        <div className="field">
          <label>{label}</label>
          <Seg
            full
            value={value === true ? 'yes' : value === false ? 'no' : undefined}
            onChange={(v) => onChange(v === 'yes')}
            options={[
              { v: 'yes', label: 'Yes' },
              { v: 'no', label: 'No' },
            ]}
          />
        </div>
      );
    case 'datetime':
      return (
        <div className="field span-2">
          <label>{label}</label>
          <DateTime12 value={typeof value === 'number' ? value : undefined} onChange={(v) => onChange(v ?? null)} allowEmpty />
        </div>
      );
    default:
      return (
        <div className="field">
          <label>{label}</label>
          <input className="input" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
  }
}
