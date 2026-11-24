// PDF report (stats + charts) for a chosen period. Always printed in the Light theme.
import { jsPDF } from 'jspdf';
import { LIGHT } from '../theme/tokens';
import type { Journal, Strategy } from '../data/types';
import { byTimeBlock, byWeekday, computeStats, mistakeStats, rulesSplit, gradeCounts, type CT, closedSorted } from './calc';
import { fmtDate, fmtTime, WEEKDAYS, TIME_BLOCKS } from './time';

// The built-in PDF font has no ₹ or − glyph, so use "Rs" and "-".
const usd = (n: number, signed = true) => `${n < 0 ? '-' : signed && n > 0 ? '+' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inr = (n: number, signed = true) => `${n < 0 ? '-' : signed && n > 0 ? '+' : ''}Rs ${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const rr = (n: number) => `${n < 0 ? '-' : n > 0 ? '+' : ''}${Math.abs(n).toFixed(1)}R`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function hex(c: string): [number, number, number] {
  const h = c.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function buildPdfReport(opts: {
  journal: Journal;
  list: CT[]; // trades in the period
  periodLabel: string;
  usdInr: number;
  strategies: Map<string, Strategy>;
}): Blob {
  const { journal, list, periodLabel, usdInr, strategies } = opts;
  const s = computeStats(list);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = M;
  const T = LIGHT;
  const color = (c: string) => doc.setTextColor(...hex(c));
  const fill = (c: string) => doc.setFillColor(...hex(c));
  const stroke = (c: string) => doc.setDrawColor(...hex(c));
  const toneOf = (n: number) => (n > 0 ? T.profit : n < 0 ? T.loss : T.text);

  // header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  color(T.text);
  doc.text('Trading report', M, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  color(T.text2);
  doc.text(`${journal.name} (${journal.type})  ·  ${periodLabel}  ·  Rate $1 = Rs ${usdInr}`, M, y + 28);
  y += 50;

  // stat boxes
  const boxes: [string, string, string, string][] = [
    ['Total P&L', usd(s.totalPnl), inr(s.totalPnl * usdInr), toneOf(s.totalPnl)],
    ['Total R', rr(s.totalR), `${s.closed} closed trades`, toneOf(s.totalR)],
    ['Win rate', pct(s.winRate), `${s.wins} wins · ${s.losses} losses`, T.text],
    ['Average R:R', `1 : ${s.avgRR.toFixed(1)}`, `Win ${rr(s.avgWinR)} · Loss ${rr(s.avgLossR)}`, T.text],
    ['Expectancy', `${s.expectancy >= 0 ? '+' : '-'}${Math.abs(s.expectancy).toFixed(2)}R`, `${usd(s.expectancyUsd)} per trade`, toneOf(s.expectancy)],
    ['Max drawdown', rr(s.maxDdR), usd(s.maxDdUsd), T.loss],
  ];
  const bw = (W - 2 * M - 2 * 10) / 3;
  boxes.forEach(([label, val, sub, c], i) => {
    const bx = M + (i % 3) * (bw + 10);
    const by = y + Math.floor(i / 3) * 70;
    stroke(T.border);
    fill(T.card);
    doc.roundedRect(bx, by, bw, 60, 6, 6, 'FD');
    doc.setFontSize(9);
    color(T.text2);
    doc.text(label, bx + 10, by + 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    color(c);
    doc.text(val, bx + 10, by + 36);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    color(T.text3);
    doc.text(sub, bx + 10, by + 51);
  });
  y += 150;

  // equity curve (R)
  const sectionTitle = (t: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    color(T.text);
    doc.text(t, M, y);
    doc.setFont('helvetica', 'normal');
    y += 10;
  };
  sectionTitle('Equity curve (R)');
  const ch = 140;
  const cw = W - 2 * M;
  stroke(T.border);
  doc.roundedRect(M, y, cw, ch, 6, 6, 'S');
  const pts = [0, ...s.equity.map((e) => e.r)];
  if (pts.length > 1) {
    let mn = Math.min(...pts);
    let mx = Math.max(...pts);
    if (mx === mn) {
      mx += 1;
      mn -= 1;
    }
    const px = (i: number) => M + 10 + (i / (pts.length - 1)) * (cw - 20);
    const py = (v: number) => y + 10 + (1 - (v - mn) / (mx - mn)) * (ch - 20);
    stroke(T.text3);
    doc.setLineDashPattern([3, 3], 0);
    doc.line(M + 10, py(0), M + cw - 10, py(0));
    doc.setLineDashPattern([], 0);
    stroke(T.accent);
    doc.setLineWidth(1.5);
    for (let i = 1; i < pts.length; i++) doc.line(px(i - 1), py(pts[i - 1]), px(i), py(pts[i]));
    doc.setLineWidth(0.5);
  }
  y += ch + 24;

  // bars: weekday + time block
  const bars = (title: string, data: { label: string; r: number }[], x0: number, w: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    color(T.text);
    doc.text(title, x0, y);
    doc.setFont('helvetica', 'normal');
    const top = y + 10;
    const h = 110;
    stroke(T.border);
    doc.roundedRect(x0, top, w, h, 6, 6, 'S');
    const max = Math.max(...data.map((d) => Math.abs(d.r)), 0.001);
    const slot = w / data.length;
    const zero = top + 20 + 50;
    data.forEach((d, i) => {
      const cx = x0 + slot * i + slot / 2;
      const bh = (Math.abs(d.r) / max) * 45;
      fill(d.r >= 0 ? T.profit : T.loss);
      if (bh > 0) doc.rect(cx - 8, d.r >= 0 ? zero - bh : zero, 16, bh, 'F');
      doc.setFontSize(7.5);
      color(d.r === 0 ? T.text3 : toneOf(d.r));
      doc.text(d.r === 0 ? '-' : rr(d.r), cx, top + 14, { align: 'center' });
      color(T.text2);
      doc.text(d.label, cx, top + h - 6, { align: 'center' });
    });
  };
  const half = (W - 2 * M - 16) / 2;
  bars('P&L by day', byWeekday(list, WEEKDAYS), M, half);
  bars('P&L by time (IST)', byTimeBlock(list, TIME_BLOCKS).map((b) => ({ ...b, label: b.label.replace(' ', '') })), M + half + 16, half);
  y += 140;

  // psychology
  sectionTitle('Psychology');
  doc.setFontSize(9.5);
  color(T.text2);
  const rs = rulesSplit(list);
  const g = gradeCounts(list.filter((x) => x.c.closed));
  const lines = [
    `Rules followed: ${rr(rs.followed.r)} in ${rs.followed.count} trades (${pct(rs.followed.winRate)} win)   ·   Rules broken: ${rr(rs.broken.r)} in ${rs.broken.count} trades (${pct(rs.broken.winRate)} win)`,
    `Grades: A ${g.A} · B ${g.B} · C ${g.C}   ·   Best win streak ${s.bestWinStreak} · Worst loss streak ${s.worstLossStreak}`,
    `Top mistakes: ${mistakeStats(list).slice(0, 4).map((m) => `${m.tag} (${m.count}, ${rr(m.r)})`).join(' · ') || 'none tagged'}`,
  ];
  lines.forEach((l) => {
    doc.text(doc.splitTextToSize(l, W - 2 * M), M, y + 6);
    y += 16;
  });
  y += 10;

  // trades table
  const newPage = () => {
    doc.addPage();
    y = M;
  };
  if (y > H - 120) newPage();
  sectionTitle(`Trades (${closedSorted(list).length} closed)`);
  const cols: [string, number, 'left' | 'right'][] = [
    ['Date', 0, 'left'],
    ['Symbol', 85, 'left'],
    ['Side', 160, 'left'],
    ['Strategy', 200, 'left'],
    ['Grade', 330, 'left'],
    ['Result', 400, 'right'],
    ['P&L ($)', 460, 'right'],
    ['P&L (Rs)', 515, 'right'],
  ];
  const head = () => {
    doc.setFontSize(8.5);
    color(T.text2);
    cols.forEach(([t, x, a]) => doc.text(t, M + x, y + 6, { align: a }));
    stroke(T.border);
    doc.line(M, y + 10, W - M, y + 10);
    y += 22;
  };
  head();
  for (const x of [...closedSorted(list)].reverse()) {
    if (y > H - M) {
      newPage();
      head();
    }
    doc.setFontSize(8.5);
    color(T.text);
    doc.text(`${fmtDate(x.t.exitAt ?? x.t.entryAt)} ${fmtTime(x.t.exitAt ?? x.t.entryAt)}`, M, y);
    doc.text(x.t.symbol, M + 85, y);
    doc.text(x.t.side === 'long' ? 'Long' : 'Short', M + 160, y);
    doc.text((x.t.strategyId ? strategies.get(x.t.strategyId)?.name ?? '' : '-').slice(0, 24), M + 200, y);
    doc.text(x.t.grade ?? '-', M + 330, y);
    color(toneOf(x.c.r ?? 0));
    doc.text(rr(x.c.r ?? 0), M + 400, y, { align: 'right' });
    doc.text(usd(x.c.pnlUsd ?? 0), M + 460, y, { align: 'right' });
    color(T.text3);
    doc.text(inr((x.c.pnlUsd ?? 0) * usdInr), M + 515, y, { align: 'right' });
    y += 15;
  }

  // footer page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    color(T.text3);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 18, { align: 'right' });
  }
  return doc.output('blob');
}
