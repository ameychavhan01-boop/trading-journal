import type { CT } from './calc';
import type { Journal, Strategy } from '../data/types';
import { fmtDate, fmtTime } from './time';

const esc = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV that opens in Excel / Numbers / Google Sheets (UTF-8 with BOM so ₹ shows correctly). */
export function tradesCsv(rows: CT[], journals: Journal[], strategies: Map<string, Strategy>, usdInr: number): Blob {
  const jName = new Map(journals.map((j) => [j.id, j.name]));
  const head = [
    'Journal', 'Entry date', 'Entry time (IST)', 'Exit date', 'Exit time (IST)', 'Market', 'Symbol', 'Side', 'Status',
    'Strategy', 'Entry TF', 'HTF trend', 'Entry', 'Stop loss', 'Target', 'Exit', 'Quantity', 'Leverage', 'Fees',
    'Result (R)', 'P&L ($)', 'P&L (₹)', 'Planned R:R', 'Outcome', 'Grade', 'Emotion (1-5)', 'Mistakes', 'Rules broken',
    'Why I entered', 'What went well', 'Lesson',
  ];
  const lines = [head.map(esc).join(',')];
  for (const { t, c } of rows) {
    lines.push(
      [
        jName.get(t.journalId) ?? '',
        fmtDate(t.entryAt, true), fmtTime(t.entryAt),
        t.exitAt ? fmtDate(t.exitAt, true) : '', t.exitAt ? fmtTime(t.exitAt) : '',
        t.marketType === 'crypto' ? 'Crypto' : 'Indian stock', t.symbol, t.side === 'long' ? 'Long' : 'Short',
        t.status === 'open' ? 'Open' : 'Closed',
        t.strategyId ? strategies.get(t.strategyId)?.name ?? '' : '', t.entryTf ?? '', t.htfTrend ?? '',
        t.entry, t.stopLoss, t.target ?? '', t.exit ?? '', t.quantity, t.leverage ?? '', t.fees ?? '',
        c.r != null ? c.r.toFixed(2) : '',
        c.pnlUsd != null ? c.pnlUsd.toFixed(2) : '',
        c.pnlUsd != null ? (c.pnlUsd * usdInr).toFixed(0) : '',
        c.plannedRR != null ? c.plannedRR.toFixed(2) : '',
        c.result ?? '', t.grade ?? '', t.emotion ?? '', (t.mistakes ?? []).join('; '), c.rulesBroken ? 'Yes' : 'No',
        t.notes?.why ?? '', t.notes?.well ?? '', t.notes?.lesson ?? '',
      ]
        .map(esc)
        .join(','),
    );
  }
  return new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
}
