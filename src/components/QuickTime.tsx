// Fast date & time pickers for backtesting: tap a day, tap an hour, tap a minute.
import { ArrowLeft, ArrowRight, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { DAY, fromDateInput, istParts, toDateInput, WEEKDAYS } from '../lib/time';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Row of 5 day buttons. `anchor` is the first day shown; in "back" direction the
 * following buttons go to earlier days, in "fwd" to later days.
 */
export function DateStrip({
  anchor,
  dir,
  value,
  onPick,
  onShift,
  onToggleDir,
  min,
}: {
  anchor: number; // start of day (IST)
  dir: 'fwd' | 'back';
  value: number | undefined; // selected start of day
  onPick: (day: number) => void;
  onShift: (newAnchor: number) => void;
  onToggleDir?: () => void;
  min?: number; // days before this are disabled
}) {
  const step = dir === 'fwd' ? 1 : -1;
  const days = Array.from({ length: 5 }, (_, i) => anchor + i * step * DAY);
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn icon sm" aria-label="Earlier days" onClick={() => onShift(anchor - 5 * DAY)}>
          <ChevronLeft size={18} />
        </button>
        <div className="date-strip">
          {days.map((d) => {
            const p = istParts(d);
            const disabled = min != null && d < min;
            const weekend = p.dow >= 5;
            return (
              <button
                type="button"
                key={d}
                disabled={disabled}
                className={`day-chip ${value === d ? 'on' : ''} ${weekend ? 'weekend' : ''}`}
                onClick={() => onPick(d)}
              >
                <span className="tiny">{WEEKDAYS[p.dow]}</span>
                <span className="bold">
                  {MONTHS[p.m]} {p.d}
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" className="btn icon sm" aria-label="Later days" onClick={() => onShift(anchor + 5 * DAY)}>
          <ChevronRight size={18} />
        </button>
        <label className="btn icon sm" aria-label="Pick from calendar" style={{ position: 'relative', overflow: 'hidden' }}>
          <CalendarDays size={17} />
          <input
            type="date"
            value={value != null ? toDateInput(value) : ''}
            onChange={(e) => {
              const d = fromDateInput(e.target.value);
              if (d != null) {
                onPick(d);
                onShift(d);
              }
            }}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
          />
        </label>
      </div>
      {onToggleDir && (
        <button type="button" className="link-btn tiny" style={{ minHeight: 32, alignSelf: 'flex-start' }} onClick={onToggleDir}>
          {dir === 'fwd' ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
          {dir === 'fwd' ? 'Going forward (old → new dates) – tap to reverse' : 'Going backward (new → old dates) – tap to reverse'}
        </button>
      )}
    </div>
  );
}

/** Minute buttons depend on the timeframe so they match candle times. */
export function minuteOptions(tf?: string): number[] {
  if (tf && ['15m', '30m', '1H', '2H', '4H', 'Daily', 'Weekly'].includes(tf)) return [0, 15, 30, 45];
  return Array.from({ length: 12 }, (_, i) => i * 5);
}

export interface TimeValue {
  h12?: number; // 1..12
  ampm: 'AM' | 'PM';
  min?: number;
}

export const to24 = (t: TimeValue) => (t.h12 == null ? undefined : (t.h12 % 12) + (t.ampm === 'PM' ? 12 : 0));

export function TimeGrid({ value, onChange, tf }: { value: TimeValue; onChange: (v: TimeValue) => void; tf?: string }) {
  const mins = minuteOptions(tf);
  const label =
    value.h12 != null && value.min != null ? `${value.h12}:${String(value.min).padStart(2, '0')} ${value.ampm}` : 'Tap hour, then minute';
  const bump = (d: number) => {
    if (value.min == null || value.h12 == null) return;
    let h24 = to24(value)!;
    let m = value.min + d;
    if (m < 0) {
      m = 59;
      h24 = (h24 + 23) % 24;
    } else if (m > 59) {
      m = 0;
      h24 = (h24 + 1) % 24;
    }
    onChange({ h12: h24 % 12 === 0 ? 12 : h24 % 12, ampm: h24 < 12 ? 'AM' : 'PM', min: m });
  };
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <div className="time-grid spacer">
          {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
            <button type="button" key={h} className={`time-btn ${value.h12 === h ? 'on' : ''}`} onClick={() => onChange({ ...value, h12: h })}>
              {h}
            </button>
          ))}
        </div>
        <div className="seg" style={{ flexDirection: 'column', flex: 'none' }}>
          {(['AM', 'PM'] as const).map((a) => (
            <button type="button" key={a} className={value.ampm === a ? 'on' : ''} onClick={() => onChange({ ...value, ampm: a })}>
              {a}
            </button>
          ))}
        </div>
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        {mins.map((m) => (
          <button type="button" key={m} className={`time-btn min ${value.min === m ? 'on' : ''}`} onClick={() => onChange({ ...value, min: m })}>
            :{String(m).padStart(2, '0')}
          </button>
        ))}
        <span className="spacer" />
        <button type="button" className="btn icon sm" aria-label="1 minute earlier" onClick={() => bump(-1)}>
          −1
        </button>
        <span className="bold" style={{ minWidth: 92, textAlign: 'center', fontSize: value.min != null && value.h12 != null ? 17 : 12.5 }}>
          {label}
        </span>
        <button type="button" className="btn icon sm" aria-label="1 minute later" onClick={() => bump(1)}>
          +1
        </button>
      </div>
    </div>
  );
}

/** Builds epoch ms from a day (start of day IST) and a TimeValue. */
export function combine(day: number | undefined, t: TimeValue): number | undefined {
  const h = to24(t);
  if (day == null || h == null || t.min == null) return undefined;
  const p = istParts(day);
  const ms = Date.UTC(p.y, p.m, p.d, h, t.min) - 5.5 * 3600 * 1000;
  return ms;
}
