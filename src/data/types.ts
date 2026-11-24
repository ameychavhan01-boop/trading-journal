// All the shapes of data the app saves. Kept in the data layer so a future
// online sync only needs to change files inside src/data/.

export type MarketType = 'crypto' | 'stock';
export type Side = 'long' | 'short';
export type TradeStatus = 'open' | 'closed';
export type HtfTrend = 'up' | 'down' | 'range';
export type Grade = 'A' | 'B' | 'C';

export interface Journal {
  id: string;
  name: string;
  type: string; // Live / Backtest / Forward / Other (editable list)
  startingBalance: number; // in $
  riskPct: number; // default 1
  dailyLossLimit: number; // 0 = no limit
  dailyLossUnit: '$' | 'R';
  maxTradesPerDay: number; // 0 = no limit
  pinHash?: string; // set = journal is locked
  isSample?: boolean;
  order: number;
  createdAt: number;
}

export interface TradeNotes {
  why?: string;
  well?: string;
  lesson?: string;
}

export interface Trade {
  id: string;
  journalId: string;
  marketType: MarketType;
  symbol: string;
  side: Side;
  status: TradeStatus;
  strategyId?: string;
  entryTf?: string;
  htfTrend?: HtfTrend;
  /** Prices are in $ for crypto and in ₹ for Indian stocks. */
  entry: number;
  stopLoss: number;
  target?: number;
  exit?: number;
  quantity: number;
  leverage?: number;
  fees?: number; // same currency as prices
  entryAt: number; // epoch ms
  exitAt?: number;
  /** Checklist rule text -> ticked */
  checklist?: Record<string, boolean>;
  emotion?: number; // 1..5
  mistakes?: string[];
  grade?: Grade;
  beforeShotId?: string;
  afterShotId?: string;
  notes?: TradeNotes;
  custom?: Record<string, string | number | boolean | null>;
  isSample?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Strategy {
  id: string;
  name: string;
  type: string; // e.g. Swing, Intraday
  markets: string; // e.g. Crypto + stocks
  timeframe: string;
  description: string;
  rules: string[];
  checklist: string[];
  stopRule: string;
  targetRule: string;
  whenFails: string;
  isTemplate: boolean;
  hidden: boolean;
  createdAt: number;
}

export interface Screenshot {
  id: string;
  blob: Blob;
  createdAt: number;
}

/** Built-in trade field that can be renamed / hidden / reordered in Settings. */
export interface FieldConfig {
  key: string; // built-in key or custom field id
  label: string;
  visible: boolean;
}

export type CustomFieldType = 'text' | 'number' | 'dropdown' | 'yesno' | 'datetime';

export interface CustomField {
  id: string;
  label: string;
  type: CustomFieldType;
  options?: string[]; // dropdown
}

export interface ShowMode {
  on: boolean;
  journalId?: string;
}

/** One-time setup for the Quick trade screen (fixed-money backtesting). */
export interface QuickSetup {
  done: boolean; // setup page completed
  journalId?: string;
  targetInr: number; // fixed profit when the target is hit
  rrList?: number[]; // no longer used (R:R is now calculated from prices)
  rr?: number; // no longer used
  timeframe?: string; // decides which minute buttons are shown
  strategyId?: string;
  assets: { symbol: string; market: MarketType }[];
  asset: string; // selected symbol
  dir: 'fwd' | 'back'; // date strip direction
}

export interface Settings {
  theme: 'light' | 'dark';
  usdInr: number;
  contractSizes: Record<string, number>; // symbol -> contract size (Delta)
  mistakeTags: string[];
  journalTypes: string[];
  fields: FieldConfig[]; // order + labels of optional trade fields
  customFields: CustomField[];
  testedThreshold: number;
  lastBackupAt?: number;
  activeJournalId?: string;
  appPinHash?: string; // used to turn Show mode off
  showMode: ShowMode;
  seenWeeklyReview?: string; // key of last weekly review opened
  seenMonthlyReview?: string;
  quick?: QuickSetup;
}

export interface BackupFile {
  app: 'trading-journal';
  version: number;
  createdAt: number;
  journals: Journal[];
  trades: Trade[];
  strategies: Strategy[];
  settings: Settings;
  screenshots: { id: string; createdAt: number; dataUrl: string }[];
}
