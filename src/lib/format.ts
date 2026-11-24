export const fmtNum = (n: number, d = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

/** "+$109.00" / "−$10.00" (uses a real minus sign) */
export function fmtUsd(n: number, signed = false, d = 2): string {
  const s = `$${fmtNum(Math.abs(n), d)}`;
  if (n < 0) return `−${s}`;
  return signed && n > 0 ? `+${s}` : s;
}

/** Indian grouping: ₹1,23,456 */
export function fmtInr(n: number, signed = false, d = 0): string {
  const s = `₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  if (n < 0) return `−${s}`;
  return signed && n > 0 ? `+${s}` : s;
}

export function fmtR(n: number, d = 1): string {
  const v = Math.abs(n).toFixed(d);
  if (Number(v) === 0) return `0${d ? '.' + '0'.repeat(d) : ''}R`;
  return `${n < 0 ? '−' : '+'}${v}R`;
}

export const fmtPct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;

/** Price formatting: crypto in $, stocks in ₹ */
export function fmtPrice(n: number | undefined, market: 'crypto' | 'stock'): string {
  if (n == null || !isFinite(n)) return '–';
  if (market === 'stock') return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  return n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 4 : 2 });
}

export const tone = (n: number | undefined) =>
  n == null || Math.abs(n) < 1e-9 ? '' : n > 0 ? 'profit' : 'loss';

export const parseNum = (s: string): number | undefined => {
  if (s.trim() === '') return undefined;
  const n = Number(s.replace(/,/g, ''));
  return isFinite(n) ? n : undefined;
};
