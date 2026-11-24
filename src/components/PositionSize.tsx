import { useState } from 'react';
import { Modal } from './Modal';
import { Seg } from './inputs';
import { useApp } from '../state/AppContext';
import { contractSizeFor, positionSize } from '../lib/calc';
import { fmtInr, fmtNum, fmtUsd, parseNum } from '../lib/format';
import type { MarketType } from '../data/types';

export function PositionSizeModal({ balanceUsd, onClose }: { balanceUsd: number; onClose: () => void }) {
  const { active, ctx, settings } = useApp();
  const [market, setMarket] = useState<MarketType>('crypto');
  const [symbol, setSymbol] = useState('BTCUSD');
  const [bal, setBal] = useState(String(Math.round(balanceUsd * 100) / 100));
  const [risk, setRisk] = useState(String(active?.riskPct ?? 1));
  const [entry, setEntry] = useState('');
  const [sl, setSl] = useState('');
  const [lev, setLev] = useState('10');

  const cs = contractSizeFor({ marketType: market, symbol }, ctx);
  const balanceUsdNum = parseNum(bal) ?? 0;
  const balNative = market === 'stock' ? balanceUsdNum * settings.usdInr : balanceUsdNum;
  const res = positionSize({
    balance: balNative,
    riskPct: parseNum(risk) ?? 0,
    entry: parseNum(entry) ?? 0,
    stopLoss: parseNum(sl) ?? 0,
    leverage: parseNum(lev) ?? 1,
    contractSize: cs,
  });
  const money = (v: number) =>
    market === 'stock' ? (
      <span className="money">
        <span>{fmtUsd(v / settings.usdInr)}</span>
        <span className="inr">{fmtInr(v)}</span>
      </span>
    ) : (
      <span className="money">
        <span>{fmtUsd(v)}</span>
        <span className="inr">{fmtInr(v * settings.usdInr)}</span>
      </span>
    );
  const cur = market === 'stock' ? '₹' : '$';

  return (
    <Modal title="Position size calculator" onClose={onClose}>
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
        <div className="field span-all">
          <label>Market</label>
          <Seg full value={market} onChange={setMarket} options={[{ v: 'crypto', label: 'Crypto' }, { v: 'stock', label: 'Indian stock' }]} />
        </div>
        {market === 'crypto' && (
          <div className="field">
            <label>Symbol (for contract size)</label>
            <input className="input" value={symbol} autoCapitalize="characters" onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
            <span className="faint tiny">1 contract = {cs}</span>
          </div>
        )}
        <div className="field">
          <label>Account balance ($)</label>
          <input className="input" inputMode="decimal" value={bal} onChange={(e) => setBal(e.target.value)} />
        </div>
        <div className="field">
          <label>Risk per trade (%)</label>
          <input className="input" inputMode="decimal" value={risk} onChange={(e) => setRisk(e.target.value)} />
        </div>
        <div className="field">
          <label>Leverage</label>
          <input className="input" inputMode="decimal" value={lev} onChange={(e) => setLev(e.target.value)} />
        </div>
        <div className="field">
          <label>Entry ({cur})</label>
          <input className="input" inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)} />
        </div>
        <div className="field">
          <label>Stop loss ({cur})</label>
          <input className="input" inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} />
        </div>
      </div>
      <div className="divider" />
      {res ? (
        <div className="grid g-2" style={{ rowGap: 14 }}>
          <div>
            <div className="stat-label">Size</div>
            <div className="stat-value" style={{ fontSize: 24 }}>
              {market === 'stock' ? `${Math.floor(res.qty)} shares` : cs !== 1 ? `${Math.floor(res.qty)} contracts` : fmtNum(res.qty, 4)}
            </div>
            {market === 'crypto' && cs !== 1 && <div className="faint tiny">= {fmtNum(res.units, 4)} coins</div>}
          </div>
          <div>
            <div className="stat-label">Money at risk (1R)</div>
            <div className="bold" style={{ marginTop: 6 }}>{money(res.riskAmount)}</div>
          </div>
          <div>
            <div className="stat-label">Position value</div>
            <div className="bold" style={{ marginTop: 6 }}>{money(res.value)}</div>
          </div>
          <div>
            <div className="stat-label">Margin needed</div>
            <div className="bold" style={{ marginTop: 6 }}>{money(res.margin)}</div>
          </div>
          <div className="faint tiny span-all">Stop distance: {fmtNum(res.slPct, 2)}%</div>
        </div>
      ) : (
        <div className="muted small">Enter entry and stop loss to see the size.</div>
      )}
    </Modal>
  );
}
