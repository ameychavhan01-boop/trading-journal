import { useMemo, useState } from 'react';
import { Copy, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { ConfirmModal, Modal } from '../components/Modal';
import { useApp } from '../state/AppContext';
import { useCalcTrades } from '../state/hooks';
import { deleteStrategy, saveStrategy, uid, useStrategies } from '../data/api';
import type { Strategy } from '../data/types';
import { computeStats, type CT } from '../lib/calc';
import { fmtPct, fmtR, tone } from '../lib/format';

export default function Strategies() {
  const { journals, isUnlocked, settings } = useApp();
  const strategies = useStrategies() ?? [];
  const visible = journals.filter(isUnlocked);
  const trades = useCalcTrades(visible.map((j) => j.id)) ?? [];
  const backtestIds = new Set(visible.filter((j) => j.type.toLowerCase() === 'backtest').map((j) => j.id));
  const [showHidden, setShowHidden] = useState(false);
  const [open, setOpen] = useState<Strategy | null>(null);
  const [editing, setEditing] = useState<Strategy | null>(null);

  const byStrategy = useMemo(() => {
    const m = new Map<string, CT[]>();
    for (const x of trades) if (x.t.strategyId) m.set(x.t.strategyId, [...(m.get(x.t.strategyId) ?? []), x]);
    return m;
  }, [trades]);

  const info = (s: Strategy) => {
    const list = byStrategy.get(s.id) ?? [];
    const st = computeStats(list);
    const bt = computeStats(list.filter((x) => backtestIds.has(x.t.journalId)));
    const tested = bt.closed >= settings.testedThreshold && bt.expectancy > 0;
    return { st, bt, tested };
  };

  const shown = strategies
    .filter((s) => showHidden || !s.hidden)
    .sort((a, b) => Number(a.hidden) - Number(b.hidden) || Number(b.isTemplate) - Number(a.isTemplate) || a.createdAt - b.createdAt);
  const hiddenCount = strategies.filter((s) => s.hidden).length;

  const newStrategy = (): Strategy => ({
    id: uid(),
    name: '',
    type: 'Swing',
    markets: 'Crypto + stocks',
    timeframe: '',
    description: '',
    rules: [],
    checklist: [],
    stopRule: '',
    targetRule: '',
    whenFails: '',
    isTemplate: false,
    hidden: false,
    createdAt: Date.now(),
  });

  return (
    <div className="page">
      <PageHeader
        title="Strategies"
        subtitle={`Tested = at least ${settings.testedThreshold} trades in a Backtest journal with positive expectancy`}
        actions={
          <>
            {hiddenCount > 0 && (
              <button className="btn" onClick={() => setShowHidden((v) => !v)}>
                {showHidden ? <EyeOff size={17} /> : <Eye size={17} />} {showHidden ? 'Hide hidden' : `Show hidden (${hiddenCount})`}
              </button>
            )}
            <button className="btn primary" onClick={() => setEditing(newStrategy())}>
              <Plus size={17} /> New strategy
            </button>
          </>
        }
      />
      <div className="grid g-3">
        {shown.map((s) => {
          const { st, bt, tested } = info(s);
          return (
            <div key={s.id} className={`card strat-card ${s.hidden ? 'hidden-strat' : ''}`} onClick={() => setOpen(s)}>
              <div className="row">
                <span className="bold" style={{ fontSize: 16 }}>
                  {s.name}
                </span>
                <span className="spacer" />
                <TestedBadge tested={tested} n={bt.closed} need={settings.testedThreshold} />
              </div>
              <div className="row wrap" style={{ gap: 6 }}>
                <span className="pill">{s.type}</span>
                <span className="pill">{s.markets}</span>
                {s.isTemplate && <span className="pill accent">Template</span>}
                {s.hidden && <span className="pill">Hidden</span>}
              </div>
              <div className="muted small" style={{ minHeight: 36 }}>
                {s.description}
              </div>
              <div className="divider" style={{ margin: '4px 0' }} />
              <div className="grid g-3" style={{ gap: 8 }}>
                <div>
                  <div className="stat-label">Trades</div>
                  <div className="bold">{st.closed}</div>
                </div>
                <div>
                  <div className="stat-label">Expectancy</div>
                  <div className={`bold ${tone(st.expectancy)}`}>{st.closed ? fmtR(st.expectancy, 2) : '–'}</div>
                </div>
                <div>
                  <div className="stat-label">Win rate</div>
                  <div className="bold">{st.closed ? fmtPct(st.winRate, 0) : '–'}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {open && (
        <StrategyDetail
          s={strategies.find((x) => x.id === open.id) ?? open}
          info={info(strategies.find((x) => x.id === open.id) ?? open)}
          onClose={() => setOpen(null)}
          onEdit={(s) => {
            setOpen(null);
            setEditing(s);
          }}
        />
      )}
      {editing && <StrategyEditor s={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TestedBadge({ tested, n, need }: { tested: boolean; n: number; need: number }) {
  return tested ? (
    <span className="pill profit">🟢 Tested</span>
  ) : (
    <span className="pill" title={`${n} of ${need} backtest trades`}>
      ⚪ Not tested by you
    </span>
  );
}

function StrategyDetail({
  s,
  info,
  onClose,
  onEdit,
}: {
  s: Strategy;
  info: { st: ReturnType<typeof computeStats>; bt: ReturnType<typeof computeStats>; tested: boolean };
  onClose: () => void;
  onEdit: (s: Strategy) => void;
}) {
  const { toast, settings } = useApp();
  const [del, setDel] = useState(false);
  const block = (title: string, body: React.ReactNode) => (
    <div style={{ marginBottom: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        {title}
      </div>
      {body}
    </div>
  );
  return (
    <Modal
      wide
      title={
        <span className="row wrap" style={{ gap: 8 }}>
          {s.name} <TestedBadge tested={info.tested} n={info.bt.closed} need={settings.testedThreshold} />
        </span>
      }
      onClose={onClose}
      footer={
        <>
          {s.isTemplate ? (
            <button
              className="btn"
              onClick={async () => {
                await saveStrategy({ ...s, hidden: !s.hidden });
                toast(s.hidden ? 'Template shown' : 'Template hidden');
                onClose();
              }}
            >
              {s.hidden ? <Eye size={16} /> : <EyeOff size={16} />} {s.hidden ? 'Show' : 'Hide'}
            </button>
          ) : (
            <button className="btn danger" onClick={() => setDel(true)}>
              <Trash2 size={16} /> Delete
            </button>
          )}
          <button
            className="btn"
            onClick={() => onEdit({ ...s, id: uid(), name: `${s.name} (my version)`, isTemplate: false, hidden: false, createdAt: Date.now() })}
          >
            <Copy size={16} /> Duplicate → Edit
          </button>
          {!s.isTemplate && (
            <button className="btn primary" onClick={() => onEdit(s)}>
              <Pencil size={16} /> Edit
            </button>
          )}
        </>
      }
    >
      <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
        <span className="pill">{s.type}</span>
        <span className="pill">{s.markets}</span>
        {s.timeframe && <span className="pill">Best timeframe: {s.timeframe}</span>}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        {s.description}
      </p>
      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 12 }}>
          <div className="stat-label">All trades</div>
          <div className="bold">
            {info.st.closed} · <span className={tone(info.st.expectancy)}>{fmtR(info.st.expectancy, 2)}</span>
          </div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="stat-label">Backtest trades</div>
          <div className="bold">
            {info.bt.closed} / {settings.testedThreshold}
          </div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="stat-label">Win rate</div>
          <div className="bold">{info.st.closed ? fmtPct(info.st.winRate, 0) : '–'}</div>
        </div>
      </div>
      {s.isTemplate && <div className="faint small" style={{ marginBottom: 12 }}>Built-in template. Use it as is, or Duplicate → Edit to make your own version.</div>}
      {block('Rulebook', s.rules.length ? <ul className="rules">{s.rules.map((r) => <li key={r}>{r}</li>)}</ul> : <span className="faint">–</span>)}
      {block('Checklist (used in Add trade)', s.checklist.length ? <ul className="rules">{s.checklist.map((r) => <li key={r}>{r}</li>)}</ul> : <span className="faint">–</span>)}
      <div className="grid g-3">
        {block('Stop loss rule', s.stopRule || '–')}
        {block('Target rule', s.targetRule || '–')}
        {block('When it fails', <span className="warning">{s.whenFails || '–'}</span>)}
      </div>
      {del && (
        <ConfirmModal
          title={`Delete “${s.name}”?`}
          message="Trades that used this strategy keep their data, but will show no strategy."
          onConfirm={async () => {
            await deleteStrategy(s.id);
            toast('Strategy deleted');
            onClose();
          }}
          onClose={() => setDel(false)}
        />
      )}
    </Modal>
  );
}

function StrategyEditor({ s, onClose }: { s: Strategy; onClose: () => void }) {
  const { toast } = useApp();
  const [d, setD] = useState({ ...s, rulesText: s.rules.join('\n'), checklistText: s.checklist.join('\n') });
  const set = (k: string, v: string) => setD((cur) => ({ ...cur, [k]: v }));
  const lines = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean);
  const text = (k: 'name' | 'type' | 'markets' | 'timeframe', label: string, ph = '') => (
    <div className="field">
      <label>{label}</label>
      <input className="input" value={d[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
    </div>
  );
  const area = (k: 'description' | 'stopRule' | 'targetRule' | 'whenFails' | 'rulesText' | 'checklistText', label: string, ph = '') => (
    <div className="field span-all">
      <label>{label}</label>
      <textarea className="input" value={d[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
    </div>
  );
  return (
    <Modal
      wide
      title={s.name ? `Edit “${s.name}”` : 'New strategy'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              if (!d.name.trim()) return toast('Give the strategy a name');
              const { rulesText, checklistText, ...rest } = d;
              await saveStrategy({ ...rest, name: d.name.trim(), rules: lines(rulesText), checklist: lines(checklistText) });
              toast('Strategy saved');
              onClose();
            }}
          >
            Save strategy
          </button>
        </>
      }
    >
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
        {text('name', 'Name', 'e.g. My 15m breakout')}
        {text('type', 'Type', 'Swing / Intraday / Scalp')}
        {text('markets', 'Markets', 'Crypto + stocks')}
        {text('timeframe', 'Best timeframe', '1H')}
        {area('description', 'Description')}
        {area('rulesText', 'Rulebook (one rule per line)')}
        {area('checklistText', 'Checklist (one item per line – shown in Add trade)')}
        {area('stopRule', 'Stop loss rule')}
        {area('targetRule', 'Target rule')}
        {area('whenFails', 'When it fails')}
      </div>
    </Modal>
  );
}
