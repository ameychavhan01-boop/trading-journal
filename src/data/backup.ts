import { db } from './db';
import { getSettings, updateSettings } from './api';
import type { BackupFile, Screenshot, Settings } from './types';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  return res.blob();
}

/** Builds one file containing everything: journals, trades, strategies, settings, screenshots. */
export async function buildBackup(): Promise<Blob> {
  const [journals, trades, strategies, settings, shots] = await Promise.all([
    db.journals.toArray(),
    db.trades.toArray(),
    db.strategies.toArray(),
    getSettings(),
    db.screenshots.toArray(),
  ]);
  const screenshots = [];
  for (const s of shots) {
    screenshots.push({ id: s.id, createdAt: s.createdAt, dataUrl: await blobToDataUrl(s.blob) });
  }
  const file: BackupFile = {
    app: 'trading-journal',
    version: 1,
    createdAt: Date.now(),
    journals,
    trades,
    strategies,
    settings: { ...settings, showMode: { on: false } },
    screenshots,
  };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

export async function markBackupDone() {
  await updateSettings({ lastBackupAt: Date.now() });
}

/** Replaces ALL data on this device with the backup file. */
export async function restoreBackup(file: File): Promise<{ journals: number; trades: number }> {
  const text = await file.text();
  let data: BackupFile;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not a valid backup.');
  }
  if (data.app !== 'trading-journal' || !Array.isArray(data.trades)) {
    throw new Error('This file is not a backup from this app.');
  }
  const shots: Screenshot[] = [];
  for (const s of data.screenshots ?? []) {
    shots.push({ id: s.id, createdAt: s.createdAt, blob: await dataUrlToBlob(s.dataUrl) });
  }
  await db.transaction('rw', [db.journals, db.trades, db.strategies, db.screenshots, db.settings], async () => {
    await Promise.all([
      db.journals.clear(),
      db.trades.clear(),
      db.strategies.clear(),
      db.screenshots.clear(),
      db.settings.clear(),
    ]);
    await db.journals.bulkPut(data.journals ?? []);
    await db.trades.bulkPut(data.trades);
    await db.strategies.bulkPut(data.strategies ?? []);
    await db.screenshots.bulkPut(shots);
    const settings: Settings = { ...data.settings, showMode: { on: false }, lastBackupAt: data.createdAt };
    await db.settings.put({ key: 'app', value: settings });
  });
  return { journals: data.journals?.length ?? 0, trades: data.trades.length };
}
