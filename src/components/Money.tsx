import { useApp } from '../state/AppContext';
import { fmtInr, fmtUsd, tone } from '../lib/format';

/** Every amount: $ on top, ₹ below in small grey text. */
export function Money({
  usd,
  signed = true,
  colored = true,
  right,
  className = '',
  style,
}: {
  usd: number | undefined;
  signed?: boolean;
  colored?: boolean;
  right?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { settings } = useApp();
  if (usd == null || !isFinite(usd)) return <span className="faint">–</span>;
  return (
    <span className={`money ${right ? 'right' : ''} ${className}`} style={style}>
      <span className={colored ? tone(usd) : ''}>{fmtUsd(usd, signed)}</span>
      <span className="inr">{fmtInr(usd * settings.usdInr, signed)}</span>
    </span>
  );
}
