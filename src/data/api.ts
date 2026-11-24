// THE data layer. Every save / load in the app goes through this file.
// To add online sync later, change these functions – screens stay the same.

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { DEFAULT_SETTINGS, STRATEGY_TEMPLATES, BUILTIN_FIELDS, REQUIRED_FIELDS } from './defaults';
import type { Journal, Settings, Strategy, Trade } from './types';

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

/* ---------------- Settings ---------------- */

const SETTINGS_KEY = 'app';

function mergeSettings(saved: Partial<Settings> | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(saved ?? {}) } as Settings;
  // make sure any newly added built-in fields exist in the saved field list
  const all = [...REQUIRED_FIELDS, ...BUILTIN_FIELDS];
  const keys = new Set(s.fields.map((f) => f.key));
  const missing = all.filter((f) => !keys.has(f.key));
  if (missing.length) s.fields = [...s.fields, ...missing];
  s.showMode = s.showMode ?? { on: false };
  return s;
}

export async function getSettings(): Promise<Settings> {
  const row = await db.settings.get(SETTINGS_KEY);
  return mergeSettings(row?.value as Partial<Settings> | undefined);
}

export async function updateSettings(patch: Partial<Settings>) {
  const cur = await getSettings();
  await db.settings.put({ key: SETTINGS_KEY, value: { ...cur, ...patch } });
}

export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => {
    const row = await db.settings.get(SETTINGS_KEY);
    return mergeSettings(row?.value as Partial<Settings> | undefined);
  }, []);
}

/* ---------------- First run ---------------- */

export async function ensureSeed() {
  await db.transaction('rw', db.strategies, db.journals, db.settings, async () => {
    const ids = new Set(await db.strategies.toCollection().primaryKeys());
    for (const t of STRATEGY_TEMPLATES) {
      if (!ids.has(t.id)) {
        await db.strategies.put({ ...t, isTemplate: true, hidden: false, createdAt: Date.now() });
      }
    }
    if ((await db.journals.count()) === 0) {
      const j: Journal = {
        id: uid(),
        name: 'Live – Real',
        type: 'Live',
        startingBalance: 1000,
        riskPct: 1,
        dailyLossLimit: 3,
        dailyLossUnit: 'R',
        maxTradesPerDay: 3,
        order: 0,
        createdAt: Date.now(),
      };
      await db.journals.put(j);
      const cur = await db.settings.get(SETTINGS_KEY);
      await db.settings.put({
        key: SETTINGS_KEY,
        value: { ...mergeSettings(cur?.value as Partial<Settings>), activeJournalId: j.id },
      });
    }
  });
}

/* ---------------- Journals ---------------- */

export function useJournals(): Journal[] | undefined {
  return useLiveQuery(() => db.journals.orderBy('order').toArray(), []);
}

export async function saveJournal(j: Journal) {
  await db.journals.put(j);
}

export async function createJournal(partial: Partial<Journal>): Promise<Journal> {
  const count = await db.journals.count();
  const j: Journal = {
    id: uid(),
    name: 'New journal',
    type: 'Live',
    startingBalance: 1000,
    riskPct: 1,
    dailyLossLimit: 0,
    dailyLossUnit: '$',
    maxTradesPerDay: 0,
    order: count,
    createdAt: Date.now(),
    ...partial,
  };
  await db.journals.put(j);
  return j;
}

export async function deleteJournal(id: string) {
  await db.transaction('rw', db.journals, db.trades, db.screenshots, async () => {
    const trades = await db.trades.where('journalId').equals(id).toArray();
    const shotIds = trades.flatMap((t) => [t.beforeShotId, t.afterShotId]).filter(Boolean) as string[];
    await db.screenshots.bulkDelete(shotIds);
    await db.trades.where('journalId').equals(id).delete();
    await db.journals.delete(id);
  });
}

/* ---------------- Trades ---------------- */

export function useTrades(journalIds: string[] | undefined): Trade[] | undefined {
  const key = journalIds?.join(',') ?? '';
  return useLiveQuery(async () => {
    if (!journalIds) return undefined;
    if (journalIds.length === 0) return [];
    return db.trades.where('journalId').anyOf(journalIds).toArray();
  }, [key]);
}

export function useTrade(id: string | undefined): Trade | null | undefined {
  return useLiveQuery(async () => (id ? (await db.trades.get(id)) ?? null : null), [id]);
}

export function useAllTrades(): Trade[] | undefined {
  return useLiveQuery(() => db.trades.toArray(), []);
}

export async function saveTrade(t: Trade) {
  await db.trades.put({ ...t, updatedAt: Date.now() });
}

export async function deleteTrade(id: string) {
  const t = await db.trades.get(id);
  if (!t) return;
  await db.transaction('rw', db.trades, db.screenshots, async () => {
    const ids = [t.beforeShotId, t.afterShotId].filter(Boolean) as string[];
    await db.screenshots.bulkDelete(ids);
    await db.trades.delete(id);
  });
}

/* ---------------- Screenshots ---------------- */

export async function saveScreenshot(blob: Blob): Promise<string> {
  const id = uid();
  await db.screenshots.put({ id, blob, createdAt: Date.now() });
  return id;
}

export async function deleteScreenshot(id: string) {
  await db.screenshots.delete(id);
}

export function useScreenshot(id: string | undefined) {
  return useLiveQuery(async () => (id ? db.screenshots.get(id) : undefined), [id]);
}

/* ---------------- Strategies ---------------- */

export function useStrategies(): Strategy[] | undefined {
  return useLiveQuery(() => db.strategies.toArray(), []);
}

export async function saveStrategy(s: Strategy) {
  await db.strategies.put(s);
}

export async function deleteStrategy(id: string) {
  await db.transaction('rw', db.strategies, db.trades, async () => {
    await db.strategies.delete(id);
    await db.trades.where('strategyId').equals(id).modify((t) => {
      delete t.strategyId;
    });
  });
}

/* ---------------- Danger zone ---------------- */

export async function deleteSampleData() {
  await db.transaction('rw', db.journals, db.trades, db.settings, async () => {
    const sampleJournals = (await db.journals.toArray()).filter((j) => j.isSample);
    const sampleIds = new Set(sampleJournals.map((j) => j.id));
    await db.trades.filter((t) => !!t.isSample || sampleIds.has(t.journalId)).delete();
    await db.journals.bulkDelete([...sampleIds]);
    const s = await getSettings();
    if (s.activeJournalId && sampleIds.has(s.activeJournalId)) {
      const first = await db.journals.orderBy('order').first();
      await db.settings.put({ key: SETTINGS_KEY, value: { ...s, activeJournalId: first?.id } });
    }
    if (s.showMode.on && s.showMode.journalId && sampleIds.has(s.showMode.journalId)) {
      const cur = await getSettings();
      await db.settings.put({ key: SETTINGS_KEY, value: { ...cur, showMode: { on: false } } });
    }
  });
}

export function useHasSampleData() {
  return useLiveQuery(async () => (await db.journals.toArray()).some((j) => j.isSample), []);
}
