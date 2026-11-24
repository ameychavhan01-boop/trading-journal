import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ensureSeed, updateSettings, useJournals, useSettings } from '../data/api';
import type { Journal, Settings } from '../data/types';
import { applyTheme, initialTheme } from '../theme/tokens';
import { PinModal } from '../components/PinPad';
import { Modal } from '../components/Modal';
import { checkPin } from '../lib/pin';
import type { CalcCtx } from '../lib/calc';
import { Camera, Sparkles } from 'lucide-react';

interface PinRequest {
  title: string;
  subtitle?: string;
  confirmNew?: boolean;
  onSubmit: (pin: string) => Promise<string | null> | string | null;
}

interface AppState {
  settings: Settings;
  ctx: CalcCtx;
  /** journals the user may see right now (Show mode hides the rest) */
  journals: Journal[];
  active?: Journal;
  isUnlocked: (j: Journal) => boolean;
  /** asks for the PIN if needed; resolves true when the journal can be opened */
  unlockJournal: (j: Journal) => Promise<boolean>;
  setActive: (id: string) => Promise<void>;
  toast: (msg: string) => void;
  comingSoon: () => void;
  askPin: (req: PinRequest) => void;
  showMode: boolean;
}

const Ctx = createContext<AppState | null>(null);

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const settings = useSettings();
  const allJournals = useJournals();
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [soon, setSoon] = useState(false);
  const [pinReq, setPinReq] = useState<PinRequest | null>(null);
  const toastTimer = useRef<number>();

  useEffect(() => {
    applyTheme(initialTheme());
    ensureSeed().then(() => setReady(true));
    // ask the browser not to clear our saved data when the device is low on space
    navigator.storage?.persist?.().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (settings) applyTheme(settings.theme);
  }, [settings?.theme]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const showMode = !!settings?.showMode.on;
  const journals = useMemo(() => {
    const all = allJournals ?? [];
    if (settings?.showMode.on) return all.filter((j) => j.id === settings.showMode.journalId);
    return all;
  }, [allJournals, settings?.showMode.on, settings?.showMode.journalId]);

  const isUnlocked = useCallback((j: Journal) => !j.pinHash || unlocked.has(j.id), [unlocked]);

  const unlockJournal = useCallback(
    (j: Journal) =>
      new Promise<boolean>((resolve) => {
        if (!j.pinHash || unlocked.has(j.id)) return resolve(true);
        setPinReq({
          title: `Unlock “${j.name}”`,
          onSubmit: (pin) => {
            if (!checkPin(pin, j.id, j.pinHash)) return 'Wrong PIN';
            setUnlocked((s) => new Set(s).add(j.id));
            setPinReq(null);
            resolve(true);
            return null;
          },
        });
        // resolve(false) when closed is handled by onClose below
        pendingResolve.current = resolve;
      }),
    [unlocked],
  );
  const pendingResolve = useRef<((v: boolean) => void) | null>(null);

  // active journal: first accessible one if the saved one is hidden / missing
  const active = useMemo(() => {
    const byId = journals.find((j) => j.id === settings?.activeJournalId);
    const pick = byId && isUnlocked(byId) ? byId : journals.find((j) => isUnlocked(j));
    return pick;
  }, [journals, settings?.activeJournalId, isUnlocked]);

  const setActive = useCallback(
    async (id: string) => {
      const j = journals.find((x) => x.id === id);
      if (!j) return;
      if (await unlockJournal(j)) await updateSettings({ activeJournalId: id });
    },
    [journals, unlockJournal],
  );

  const value: AppState | null =
    settings && allJournals && ready
      ? {
          settings,
          ctx: { usdInr: settings.usdInr, contractSizes: settings.contractSizes },
          journals,
          active,
          isUnlocked,
          unlockJournal,
          setActive,
          toast,
          comingSoon: () => setSoon(true),
          askPin: (r) => setPinReq(r),
          showMode,
        }
      : null;

  if (!value) return <div style={{ padding: 40, color: 'var(--text2)' }}>Loading…</div>;

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg && <div className="toast">{toastMsg}</div>}
      {soon && (
        <Modal title="Coming soon" onClose={() => setSoon(false)}>
          <div className="col" style={{ alignItems: 'center', textAlign: 'center', padding: '8px 0 4px' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Camera size={30} />
            </div>
            <div className="bold" style={{ fontSize: 17 }}>
              Auto-fill from screenshot
            </div>
            <div className="muted" style={{ maxWidth: 360 }}>
              Soon you will upload a chart or order screenshot and the trade form will fill itself. For now, please
              add trades by hand.
            </div>
            <span className="pill accent">
              <Sparkles size={13} /> Coming in a future update
            </span>
            <button className="btn primary" style={{ marginTop: 8 }} onClick={() => setSoon(false)}>
              Got it
            </button>
          </div>
        </Modal>
      )}
      {pinReq && (
        <PinModal
          title={pinReq.title}
          subtitle={pinReq.subtitle}
          confirmNew={pinReq.confirmNew}
          onSubmit={async (pin) => {
            const r = await pinReq.onSubmit(pin);
            if (r === null) {
              pendingResolve.current = null;
              setPinReq(null);
            }
            return r;
          }}
          onClose={() => {
            pendingResolve.current?.(false);
            pendingResolve.current = null;
            setPinReq(null);
          }}
        />
      )}
    </Ctx.Provider>
  );
}
