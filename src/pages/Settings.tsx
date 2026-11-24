import { useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Download, Eye, EyeOff, Lock, LockOpen, Pencil, Plus, Trash2, Upload, Database } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { ConfirmModal, Modal } from '../components/Modal';
import { Seg } from '../components/inputs';
import { useApp } from '../state/AppContext';
import { createJournal, deleteJournal, deleteSampleData, saveJournal, uid, updateSettings, useHasSampleData } from '../data/api';
import { buildBackup, markBackupDone, restoreBackup } from '../data/backup';
import { loadSampleData } from '../data/sample';
import type { CustomFieldType, Journal } from '../data/types';
import { REQUIRED_FIELDS } from '../data/defaults';
import { checkPin, hashPin } from '../lib/pin';
import { saveFile, stamp } from '../lib/files';
import { fmtDateTime } from '../lib/time';
import { fmtUsd, parseNum } from '../lib/format';

function Section({ title, desc, children, actions }: { title: string; desc?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="card">
      <div className="card-title">
        <span>{title}</span>
        <span className="spacer" />
        {actions}
      </div>
      {desc && <div className="muted small" style={{ marginTop: -8, marginBottom: 12 }}>{desc}</div>}
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { showMode } = useApp();
  if (showMode)
    return (
      <div className="page">
        <PageHeader title="Settings" />
        <div className="card empty">
          <EyeOff size={28} />
          <div className="bold" style={{ marginTop: 8 }}>Settings are hidden while Show mode is on</div>
          <div className="small" style={{ marginTop: 4 }}>Turn Show mode off (bottom of the menu) with your PIN to see them.</div>
        </div>
      </div>
    );
  return (
    <div className="page">
      <PageHeader title="Settings" subtitle="Everything is saved only on this device." />
      <BackupSection />
      <JournalsSection />
      <div className="grid g-2">
        <MoneySection />
        <div className="col" style={{ gap: 16 }}>
          <ThemeSection />
          <SecuritySection />
        </div>
      </div>
      <FieldsSection />
      <div className="grid g-2">
        <ListEditor title="Mistake tags" desc="Used in the Add trade form." settingKey="mistakeTags" />
        <ListEditor title="Journal types" desc="Strategies count as Tested from journals of type “Backtest”." settingKey="journalTypes" />
      </div>
      <SampleSection />
    </div>
  );
}

/* ---------------- Backup ---------------- */

function BackupSection() {
  const { settings, toast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const last = settings.lastBackupAt;
  const old = !last || Date.now() - last > 7 * 24 * 3600 * 1000;

  return (
    <Section
      title="Backup and restore"
      desc="Your data lives only on this iPad. Download a backup regularly and keep it in Files / iCloud Drive / Google Drive."
    >
      <div className="row wrap" style={{ gap: 10 }}>
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const blob = await buildBackup();
              await saveFile(blob, `trading-journal-backup-${stamp()}.json`);
              await markBackupDone();
              toast('Backup saved');
            } catch (e) {
              if ((e as Error).name !== 'AbortError') toast('Backup failed: ' + (e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={17} /> Download full backup
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <Upload size={17} /> Restore from backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPending(f);
            e.target.value = '';
          }}
        />
        <span className={`small ${old ? 'warning' : 'muted'}`}>
          Last backup: {last ? fmtDateTime(last) : 'never'}
        </span>
      </div>
      {pending && (
        <ConfirmModal
          title="Restore this backup?"
          message={
            <>
              Everything currently on this device will be <b>replaced</b> by “{pending.name}”. Download a backup first if
              you are not sure.
            </>
          }
          confirmLabel="Replace and restore"
          onConfirm={async () => {
            try {
              const r = await restoreBackup(pending);
              toast(`Restored ${r.journals} journals and ${r.trades} trades`);
            } catch (e) {
              toast((e as Error).message);
            }
          }}
          onClose={() => setPending(null)}
        />
      )}
    </Section>
  );
}

/* ---------------- Journals ---------------- */

function JournalsSection() {
  const { journals, isUnlocked, unlockJournal, askPin, toast, active } = useApp();
  const [editing, setEditing] = useState<Journal | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Journal | null>(null);

  const setPin = (j: Journal) =>
    askPin({
      title: `Lock “${j.name}”`,
      subtitle: 'Choose a 4–6 digit PIN for this journal',
      confirmNew: true,
      onSubmit: async (pin) => {
        await saveJournal({ ...j, pinHash: hashPin(pin, j.id) });
        toast('Journal locked');
        return null;
      },
    });

  const removePin = (j: Journal) =>
    askPin({
      title: `Remove lock from “${j.name}”`,
      onSubmit: async (pin) => {
        if (!checkPin(pin, j.id, j.pinHash)) return 'Wrong PIN';
        await saveJournal({ ...j, pinHash: undefined });
        toast('Lock removed');
        return null;
      },
    });

  return (
    <Section
      title="Journals"
      desc="Each journal has its own trades, balance and risk limits. Stats never mix journals (except on Compare)."
      actions={
        <button className="btn sm primary" onClick={() => setEditing('new')}>
          <Plus size={16} /> New journal
        </button>
      }
    >
      {journals.map((j, i) => {
        const open = isUnlocked(j);
        return (
          <div className="list-row" key={j.id}>
            {j.pinHash ? <Lock size={16} /> : <span style={{ width: 16 }} />}
            <div className="spacer" style={{ minWidth: 0 }}>
              <div className="bold">
                {j.name} {active?.id === j.id && <span className="pill accent">Active</span>} {j.isSample && <span className="pill">Sample</span>}
              </div>
              <div className="faint tiny">
                {j.type} · Start {fmtUsd(j.startingBalance)} · Risk {j.riskPct}% · Daily loss{' '}
                {j.dailyLossLimit ? `${j.dailyLossUnit === '$' ? fmtUsd(j.dailyLossLimit) : j.dailyLossLimit + 'R'}` : 'no limit'} · Max{' '}
                {j.maxTradesPerDay || '∞'} trades/day
              </div>
            </div>
            <button className="btn icon sm" aria-label="Move up" disabled={i === 0} onClick={() => swap(journals, i, i - 1)}>
              <ArrowUp size={16} />
            </button>
            <button className="btn icon sm" aria-label="Move down" disabled={i === journals.length - 1} onClick={() => swap(journals, i, i + 1)}>
              <ArrowDown size={16} />
            </button>
            {j.pinHash ? (
              <button className="btn sm" onClick={() => removePin(j)}>
                <LockOpen size={15} /> <span className="hide-mobile">Unlock</span>
              </button>
            ) : (
              <button className="btn sm" onClick={() => setPin(j)}>
                <Lock size={15} /> <span className="hide-mobile">Lock</span>
              </button>
            )}
            <button
              className="btn icon sm"
              aria-label="Edit"
              onClick={async () => {
                if (open || (await unlockJournal(j))) setEditing(j);
              }}
            >
              <Pencil size={16} />
            </button>
            <button
              className="btn icon sm danger"
              aria-label="Delete"
              disabled={journals.length <= 1}
              onClick={async () => {
                if (open || (await unlockJournal(j))) setDeleting(j);
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
      {editing && <JournalEditor journal={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmModal
          title={`Delete “${deleting.name}”?`}
          message="This deletes the journal and ALL of its trades and screenshots. This cannot be undone."
          onConfirm={async () => {
            await deleteJournal(deleting.id);
            toast('Journal deleted');
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </Section>
  );
}

async function swap(list: Journal[], a: number, b: number) {
  const arr = [...list];
  [arr[a], arr[b]] = [arr[b], arr[a]];
  await Promise.all(arr.map((j, i) => saveJournal({ ...j, order: i })));
}

function JournalEditor({ journal, onClose }: { journal?: Journal; onClose: () => void }) {
  const { settings, toast } = useApp();
  const [name, setName] = useState(journal?.name ?? '');
  const [type, setType] = useState(journal?.type ?? settings.journalTypes[0] ?? 'Live');
  const [bal, setBal] = useState(String(journal?.startingBalance ?? 1000));
  const [risk, setRisk] = useState(String(journal?.riskPct ?? 1));
  const [limit, setLimit] = useState(String(journal?.dailyLossLimit ?? 0));
  const [unit, setUnit] = useState<'$' | 'R'>(journal?.dailyLossUnit ?? 'R');
  const [maxT, setMaxT] = useState(String(journal?.maxTradesPerDay ?? 0));

  const save = async () => {
    if (!name.trim()) return toast('Give the journal a name');
    const data = {
      name: name.trim(),
      type,
      startingBalance: parseNum(bal) ?? 0,
      riskPct: parseNum(risk) ?? 1,
      dailyLossLimit: parseNum(limit) ?? 0,
      dailyLossUnit: unit,
      maxTradesPerDay: Math.max(0, Math.round(parseNum(maxT) ?? 0)),
    };
    if (journal) await saveJournal({ ...journal, ...data });
    else {
      const j = await createJournal(data);
      await updateSettings({ activeJournalId: j.id });
    }
    toast(journal ? 'Journal saved' : 'Journal created');
    onClose();
  };

  return (
    <Modal
      title={journal ? 'Edit journal' : 'New journal'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </>
      }
    >
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
        <div className="field span-all">
          <label>Name</label>
          <input className="input" value={name} placeholder="e.g. Backtest – 1H" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Type</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {Array.from(new Set([...settings.journalTypes, type])).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Starting balance ($)</label>
          <input className="input" inputMode="decimal" value={bal} onChange={(e) => setBal(e.target.value)} />
        </div>
        <div className="field">
          <label>Risk per trade (%)</label>
          <input className="input" inputMode="decimal" value={risk} onChange={(e) => setRisk(e.target.value)} />
        </div>
        <div className="field">
          <label>Max trades per day (0 = no limit)</label>
          <input className="input" inputMode="numeric" value={maxT} onChange={(e) => setMaxT(e.target.value)} />
        </div>
        <div className="field">
          <label>Daily loss limit (0 = no limit)</label>
          <input className="input" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
        <div className="field">
          <label>Limit in</label>
          <Seg full value={unit} onChange={setUnit} options={[{ v: 'R', label: 'R' }, { v: '$', label: '$' }]} />
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Money ---------------- */

function MoneySection() {
  const { settings, toast } = useApp();
  const [rate, setRate] = useState(String(settings.usdInr));
  const [sym, setSym] = useState('');
  const [size, setSize] = useState('');
  const sizes = Object.entries(settings.contractSizes).sort();
  return (
    <Section title="Money" desc="Every amount shows $ with ₹ below it. Stock trades are entered in ₹ and converted with this rate.">
      <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Exchange rate: $1 = ₹</label>
          <input className="input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <button
          className="btn"
          onClick={async () => {
            const v = parseNum(rate);
            if (!v || v <= 0) return toast('Enter a valid rate');
            await updateSettings({ usdInr: v });
            toast('Rate saved');
          }}
        >
          Save
        </button>
      </div>
      <div className="divider" />
      <div className="bold" style={{ marginBottom: 4 }}>Contract sizes (Delta Exchange)</div>
      <div className="muted small" style={{ marginBottom: 8 }}>
        1 contract = how many coins. Example: BTCUSD 0.001 means 1 contract is 0.001 BTC. Symbols not listed use 1.
      </div>
      {sizes.map(([s, v]) => (
        <div className="list-row" key={s} style={{ minHeight: 44 }}>
          <span className="bold spacer">{s}</span>
          <span>{v}</span>
          <button
            className="btn icon sm danger"
            aria-label={`Remove ${s}`}
            onClick={() => {
              const next = { ...settings.contractSizes };
              delete next[s];
              updateSettings({ contractSizes: next });
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <input className="input" placeholder="Symbol" autoCapitalize="characters" value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())} />
        <input className="input" placeholder="Size" inputMode="decimal" value={size} onChange={(e) => setSize(e.target.value)} />
        <button
          className="btn"
          onClick={async () => {
            const v = parseNum(size);
            if (!sym.trim() || !v || v <= 0) return toast('Enter a symbol and a size');
            await updateSettings({ contractSizes: { ...settings.contractSizes, [sym.trim()]: v } });
            setSym('');
            setSize('');
          }}
        >
          <Plus size={16} /> Add
        </button>
      </div>
    </Section>
  );
}

function ThemeSection() {
  const { settings } = useApp();
  const [thr, setThr] = useState(String(settings.testedThreshold));
  return (
    <Section title="Appearance & strategies">
      <div className="field">
        <label>Theme</label>
        <Seg full value={settings.theme} onChange={(v) => updateSettings({ theme: v })} options={[{ v: 'light', label: 'Light' }, { v: 'dark', label: 'Dark' }]} />
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <label>Backtest trades needed for the “Tested” badge</label>
        <input
          className="input"
          inputMode="numeric"
          value={thr}
          onChange={(e) => setThr(e.target.value)}
          onBlur={() => {
            const v = Math.round(parseNum(thr) ?? 100);
            setThr(String(v));
            updateSettings({ testedThreshold: Math.max(1, v) });
          }}
        />
      </div>
    </Section>
  );
}

function SecuritySection() {
  const { settings, askPin, toast } = useApp();
  return (
    <Section title="App PIN (Show mode)" desc="This PIN is needed to turn Show mode off. Journal PINs are set in Journals above.">
      <button
        className="btn"
        onClick={() => {
          const create = () =>
            askPin({
              title: 'New app PIN',
              confirmNew: true,
              onSubmit: async (pin) => {
                await updateSettings({ appPinHash: hashPin(pin, 'app') });
                toast('App PIN saved');
                return null;
              },
            });
          if (!settings.appPinHash) return create();
          askPin({
            title: 'Current app PIN',
            onSubmit: (pin) => {
              if (!checkPin(pin, 'app', settings.appPinHash)) return 'Wrong PIN';
              setTimeout(create, 50);
              return null;
            },
          });
        }}
      >
        <Lock size={16} /> {settings.appPinHash ? 'Change app PIN' : 'Create app PIN'}
      </button>
    </Section>
  );
}

/* ---------------- Fields ---------------- */

function FieldsSection() {
  const { settings, toast } = useApp();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<{ key: string; label: string } | null>(null);
  const fields = settings.fields;
  const required = new Set(REQUIRED_FIELDS.map((f) => f.key));

  const move = (i: number, d: number) => {
    const arr = [...fields];
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    updateSettings({ fields: arr });
  };

  return (
    <Section
      title="Trade fields"
      desc="Rename, hide or reorder the fields of the Add trade form, or create your own. Must-fill fields can be renamed but not hidden."
      actions={
        <button className="btn sm primary" onClick={() => setAdding(true)}>
          <Plus size={16} /> Custom field
        </button>
      }
    >
      {fields.map((f, i) => {
        const custom = settings.customFields.find((c) => c.id === f.key);
        const isReq = required.has(f.key);
        return (
          <div className="list-row" key={f.key} style={{ opacity: f.visible ? 1 : 0.5 }}>
            <div className="spacer">
              <span className="bold">{f.label}</span>{' '}
              {isReq && <span className="pill">Must-fill</span>} {custom && <span className="pill accent">Custom · {TYPE_LABEL[custom.type]}</span>}
            </div>
            <button className="btn icon sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp size={16} />
            </button>
            <button className="btn icon sm" aria-label="Move down" disabled={i === fields.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown size={16} />
            </button>
            <button className="btn icon sm" aria-label="Rename" onClick={() => setRenaming({ key: f.key, label: f.label })}>
              <Pencil size={15} />
            </button>
            {!isReq && (
              <button
                className="btn icon sm"
                aria-label={f.visible ? 'Hide' : 'Show'}
                onClick={() => updateSettings({ fields: fields.map((x) => (x.key === f.key ? { ...x, visible: !x.visible } : x)) })}
              >
                {f.visible ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            )}
            {custom && (
              <button
                className="btn icon sm danger"
                aria-label="Delete field"
                onClick={async () => {
                  await updateSettings({
                    fields: fields.filter((x) => x.key !== f.key),
                    customFields: settings.customFields.filter((c) => c.id !== f.key),
                  });
                  toast('Field removed');
                }}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        );
      })}
      {adding && <CustomFieldEditor onClose={() => setAdding(false)} />}
      {renaming && (
        <Modal
          title="Rename field"
          onClose={() => setRenaming(null)}
          footer={
            <button
              className="btn primary"
              onClick={async () => {
                if (!renaming.label.trim()) return;
                await updateSettings({
                  fields: fields.map((x) => (x.key === renaming.key ? { ...x, label: renaming.label.trim() } : x)),
                  customFields: settings.customFields.map((c) => (c.id === renaming.key ? { ...c, label: renaming.label.trim() } : c)),
                });
                setRenaming(null);
              }}
            >
              Save
            </button>
          }
        >
          <input className="input" value={renaming.label} onChange={(e) => setRenaming({ ...renaming, label: e.target.value })} />
        </Modal>
      )}
    </Section>
  );
}

const TYPE_LABEL: Record<CustomFieldType, string> = {
  text: 'Text',
  number: 'Number',
  dropdown: 'Dropdown',
  yesno: 'Yes / No',
  datetime: 'Date & time',
};

function CustomFieldEditor({ onClose }: { onClose: () => void }) {
  const { settings, toast } = useApp();
  const [label, setLabel] = useState('');
  const [type, setType] = useState<CustomFieldType>('text');
  const [options, setOptions] = useState('');
  return (
    <Modal
      title="New custom field"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            onClick={async () => {
              if (!label.trim()) return toast('Give the field a name');
              const id = 'cf-' + uid();
              const opts = options.split(',').map((s) => s.trim()).filter(Boolean);
              if (type === 'dropdown' && !opts.length) return toast('Add at least one option');
              await updateSettings({
                customFields: [...settings.customFields, { id, label: label.trim(), type, options: type === 'dropdown' ? opts : undefined }],
                fields: [...settings.fields, { key: id, label: label.trim(), visible: true }],
              });
              toast('Field added to the Add trade form');
              onClose();
            }}
          >
            Add field
          </button>
        </>
      }
    >
      <div className="col">
        <div className="field">
          <label>Field name</label>
          <input className="input" value={label} placeholder="e.g. Market session" onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="field">
          <label>Type</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}>
            {Object.entries(TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        {type === 'dropdown' && (
          <div className="field">
            <label>Options (comma separated)</label>
            <input className="input" value={options} placeholder="Asia, London, New York" onChange={(e) => setOptions(e.target.value)} />
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- simple string lists ---------------- */

function ListEditor({ title, desc, settingKey }: { title: string; desc: string; settingKey: 'mistakeTags' | 'journalTypes' }) {
  const { settings } = useApp();
  const list = settings[settingKey];
  const [val, setVal] = useState('');
  const [edit, setEdit] = useState<{ i: number; v: string } | null>(null);
  const save = (next: string[]) => updateSettings({ [settingKey]: next });
  return (
    <Section title={title} desc={desc}>
      {list.map((t, i) => (
        <div className="list-row" key={t} style={{ minHeight: 44 }}>
          {edit?.i === i ? (
            <>
              <input className="input spacer" value={edit.v} autoFocus onChange={(e) => setEdit({ i, v: e.target.value })} />
              <button
                className="btn sm"
                onClick={() => {
                  if (edit.v.trim()) save(list.map((x, k) => (k === i ? edit.v.trim() : x)));
                  setEdit(null);
                }}
              >
                Save
              </button>
            </>
          ) : (
            <>
              <span className="spacer">{t}</span>
              <button className="btn icon sm" aria-label="Rename" onClick={() => setEdit({ i, v: t })}>
                <Pencil size={15} />
              </button>
              <button className="btn icon sm danger" aria-label="Remove" onClick={() => save(list.filter((_, k) => k !== i))}>
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      ))}
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <input className="input" placeholder="Add new…" value={val} onChange={(e) => setVal(e.target.value)} />
        <button
          className="btn"
          onClick={() => {
            const v = val.trim();
            if (v && !list.includes(v)) save([...list, v]);
            setVal('');
          }}
        >
          <Plus size={16} /> Add
        </button>
      </div>
    </Section>
  );
}

/* ---------------- Sample data ---------------- */

function SampleSection() {
  const { toast } = useApp();
  const hasSample = useHasSampleData();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Section title="Sample data" desc="Load example journals and trades to preview the dashboard. Your own data is not touched.">
      <div className="row wrap" style={{ gap: 10 }}>
        <button
          className="btn"
          disabled={busy || hasSample}
          onClick={async () => {
            setBusy(true);
            await loadSampleData();
            setBusy(false);
            toast('Sample data loaded – open the Dashboard');
          }}
        >
          <Database size={16} /> Load sample data
        </button>
        <button className="btn danger" disabled={!hasSample} onClick={() => setConfirm(true)}>
          <Trash2 size={16} /> Delete all sample data
        </button>
      </div>
      {confirm && (
        <ConfirmModal
          title="Delete all sample data?"
          message="The sample journals and their trades will be removed. Your own journals stay."
          onConfirm={async () => {
            await deleteSampleData();
            toast('Sample data deleted');
          }}
          onClose={() => setConfirm(false)}
        />
      )}
    </Section>
  );
}
