import type { FieldConfig, Settings, Strategy } from './types';

export const DEFAULT_MISTAKES = [
  'Exited early',
  'Moved stop loss',
  'No setup / FOMO',
  'Revenge trade',
  'Oversized',
  'Late entry',
];

export const DEFAULT_JOURNAL_TYPES = ['Live', 'Backtest', 'Forward', 'Other'];

/** Optional trade fields, in the order they appear in the Add trade form. */
export const BUILTIN_FIELDS: FieldConfig[] = [
  { key: 'strategyId', label: 'Strategy', visible: true },
  { key: 'checklist', label: 'Rules checklist', visible: true },
  { key: 'target', label: 'Target', visible: true },
  { key: 'exit', label: 'Exit price', visible: true },
  { key: 'entryAt', label: 'Entry date & time', visible: true },
  { key: 'exitAt', label: 'Exit date & time', visible: true },
  { key: 'leverage', label: 'Leverage', visible: true },
  { key: 'fees', label: 'Fees', visible: true },
  { key: 'entryTf', label: 'Entry timeframe', visible: true },
  { key: 'htfTrend', label: 'Higher timeframe trend', visible: true },
  { key: 'emotion', label: 'Emotion (1 calm – 5 fearful)', visible: true },
  { key: 'mistakes', label: 'Mistakes', visible: true },
  { key: 'grade', label: 'Execution grade', visible: true },
  { key: 'screenshots', label: 'Screenshots', visible: true },
  { key: 'notes', label: 'Notes', visible: true },
];

/** Must-fill fields: can be renamed, never hidden. */
export const REQUIRED_FIELDS: FieldConfig[] = [
  { key: 'marketType', label: 'Market', visible: true },
  { key: 'symbol', label: 'Symbol', visible: true },
  { key: 'side', label: 'Side', visible: true },
  { key: 'entry', label: 'Entry price', visible: true },
  { key: 'stopLoss', label: 'Stop loss', visible: true },
  { key: 'quantity', label: 'Size (quantity)', visible: true },
];

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  usdInr: 85,
  contractSizes: { BTCUSD: 0.001, ETHUSD: 0.01 },
  mistakeTags: DEFAULT_MISTAKES,
  journalTypes: DEFAULT_JOURNAL_TYPES,
  fields: [...REQUIRED_FIELDS, ...BUILTIN_FIELDS],
  customFields: [],
  testedThreshold: 100,
  showMode: { on: false },
};

export const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1H', '2H', '4H', 'Daily', 'Weekly'];

type Tpl = Omit<Strategy, 'createdAt' | 'hidden' | 'isTemplate'>;

export const STRATEGY_TEMPLATES: Tpl[] = [
  {
    id: 'tpl-trend-pullback',
    name: 'Trend Pullback',
    type: 'Swing',
    markets: 'Crypto + stocks',
    timeframe: '4H trend, 1H entry',
    description:
      'Join an existing uptrend (or downtrend) after price pulls back to its moving averages, instead of chasing the move.',
    rules: [
      'Price is above the 200 EMA on the 4H chart (below for shorts)',
      'Wait for a pullback into the 20 / 50 EMA zone',
      'Enter only after a bullish confirmation candle (engulfing, hammer, strong close)',
    ],
    checklist: [
      'Price above 200 EMA on 4H',
      'Pullback reached 20/50 EMA',
      'Bullish confirmation candle closed',
      'Stop loss below swing low',
      'Target is at least 2R',
    ],
    stopRule: 'Below the most recent swing low (above swing high for shorts).',
    targetRule: '2R or the previous high, whichever comes first.',
    whenFails: 'Sideways / choppy markets where price keeps crossing the EMAs.',
  },
  {
    id: 'tpl-breakout-retest',
    name: 'Breakout + Retest',
    type: 'Swing / Intraday',
    markets: 'Crypto + stocks',
    timeframe: '1H – Daily',
    description:
      'Trade a clean break of a key support/resistance level, but only after price comes back to retest it.',
    rules: [
      'Mark a clear key support / resistance level',
      'Price breaks the level with high volume',
      'Wait for price to come back and retest the level',
      'Enter when the retest holds',
    ],
    checklist: [
      'Key level clearly marked',
      'Breakout candle had high volume',
      'Retest of the level happened',
      'Retest held (rejection candle)',
      'Stop loss back inside the level',
    ],
    stopRule: 'Back inside the broken level.',
    targetRule: 'The next key level.',
    whenFails: 'Fake breakouts – price breaks, then quickly falls back inside the range.',
  },
  {
    id: 'tpl-range-mr',
    name: 'Range Mean Reversion',
    type: 'Swing / Intraday',
    markets: 'Crypto + stocks',
    timeframe: '15m – 4H',
    description:
      'In a clear sideways range, fade the edges and target the middle of the range.',
    rules: [
      'A clear range with at least 2 touches on each side',
      'Price touches the range edge or the outer Bollinger Band',
      'A rejection candle forms at the edge',
    ],
    checklist: [
      'Clear range (2+ touches each side)',
      'Price at range edge / outer Bollinger Band',
      'Rejection candle formed',
      'Stop loss just outside the range',
    ],
    stopRule: 'Just outside the range edge.',
    targetRule: 'Middle of the range.',
    whenFails: 'Strong trends – the range breaks and price keeps going.',
  },
  {
    id: 'tpl-orb',
    name: 'Opening Range Breakout',
    type: 'Intraday',
    markets: 'Indian stocks',
    timeframe: '15m range, 5m entry',
    description:
      'Mark the high and low of the first 15 minutes after 9:15 AM and trade the break of that range.',
    rules: [
      'Mark the first 15-minute high and low (9:15 AM – 9:30 AM)',
      'Trade the break of the range in that direction',
      'Exit before market close (3:30 PM)',
    ],
    checklist: [
      'First 15-minute high / low marked',
      'Clean break of the range',
      'Stop loss at the other side of the range',
      'Exit planned before 3:15 PM',
    ],
    stopRule: 'Other side of the opening range.',
    targetRule: '2R or exit before market close.',
    whenFails: 'Low-volume, sideways days where price breaks both sides.',
  },
  {
    id: 'tpl-vwap-pullback',
    name: 'VWAP Pullback',
    type: 'Intraday',
    markets: 'Crypto + stocks',
    timeframe: '5m – 15m',
    description:
      'Trade only in the direction of VWAP: longs above it, shorts below it, entering on a pullback that rejects VWAP.',
    rules: [
      'Price above VWAP = only longs. Below VWAP = only shorts',
      'Wait for a pullback to VWAP',
      'Enter when VWAP rejects the pullback',
    ],
    checklist: [
      'Trading in VWAP direction',
      'Pullback touched VWAP',
      'Rejection candle at VWAP',
      'Stop loss beyond the rejection candle',
      'Target is 2R',
    ],
    stopRule: 'Beyond the rejection candle.',
    targetRule: '2R.',
    whenFails: 'Choppy days where price keeps crossing VWAP back and forth.',
  },
];
