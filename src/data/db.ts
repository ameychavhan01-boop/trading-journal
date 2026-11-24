import Dexie, { type Table } from 'dexie';
import type { Journal, Screenshot, Strategy, Trade } from './types';

export interface SettingRow {
  key: string;
  value: unknown;
}

class JournalDB extends Dexie {
  journals!: Table<Journal, string>;
  trades!: Table<Trade, string>;
  strategies!: Table<Strategy, string>;
  screenshots!: Table<Screenshot, string>;
  settings!: Table<SettingRow, string>;

  constructor() {
    super('trading-journal');
    this.version(1).stores({
      journals: 'id, order',
      trades: 'id, journalId, entryAt, exitAt, status, strategyId',
      strategies: 'id',
      screenshots: 'id',
      settings: 'key',
    });
  }
}

export const db = new JournalDB();
