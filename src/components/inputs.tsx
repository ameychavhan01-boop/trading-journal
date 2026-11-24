import { useEffect, useMemo, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { fromIST, istParts } from '../lib/time';
import { useScreenshot } from '../data/api';

/** Date + time picker that always uses 12-hour AM/PM in IST. */
export function DateTime12({
  value,
  onChange,
  allowEmpty,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  allowEmpty?: boolean;
}) {
  const p = value != null ? istParts(value) : undefined;
  const dateStr = p ? `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` : '';
  const h12 = p ? (p.h % 12 === 0 ? 12 : p.h % 12) : 12;
  const ampm = p ? (p.h < 12 ? 'AM' : 'PM') : 'AM';
  const min = p?.min ?? 0;

  const emit = (date: string, h: number, m: number, ap: string) => {
    const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!mm) return onChange(allowEmpty ? undefined : value);
    const h24 = (h % 12) + (ap === 'PM' ? 12 : 0);
    onChange(fromIST(+mm[1], +mm[2] - 1, +mm[3], h24, m));
  };
  const base = dateStr || (() => {
    const n = istParts(Date.now());
    return `${n.y}-${String(n.m + 1).padStart(2, '0')}-${String(n.d).padStart(2, '0')}`;
  })();

  return (
    <div className="row" style={{ gap: 6 }}>
      <input
        type="date"
        className="input"
        style={{ flex: 1.6, minWidth: 0 }}
        value={dateStr}
        onChange={(e) => emit(e.target.value, h12, min, ampm)}
      />
      <select className="input" style={{ flex: 0.8, minWidth: 0 }} value={p ? h12 : ''} onChange={(e) => emit(base, +e.target.value, min, ampm)}>
        {!p && <option value="">--</option>}
        {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <select className="input" style={{ flex: 0.8, minWidth: 0 }} value={p ? min : ''} onChange={(e) => emit(base, h12, +e.target.value, ampm)}>
        {!p && <option value="">--</option>}
        {Array.from({ length: 60 }, (_, i) => i).map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, '0')}
          </option>
        ))}
      </select>
      <select className="input" style={{ flex: 0.9, minWidth: 0 }} value={p ? ampm : ''} onChange={(e) => emit(base, h12, min, e.target.value)}>
        {!p && <option value="">--</option>}
        <option>AM</option>
        <option>PM</option>
      </select>
      {allowEmpty && value != null && (
        <button type="button" className="btn icon ghost" onClick={() => onChange(undefined)} aria-label="Clear">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  full,
}: {
  value: T | undefined;
  options: { v: T; label: string }[];
  onChange: (v: T) => void;
  full?: boolean;
}) {
  return (
    <div className={`seg big ${full ? 'full' : ''}`}>
      {options.map((o) => (
        <button type="button" key={o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Full screen image viewer (pinch to zoom on iPad). */
export function ImageZoom({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="zoom" onClick={onClose}>
      <img src={src} alt="" onClick={(e) => e.stopPropagation()} />
      <button className="btn icon close" onClick={onClose} aria-label="Close">
        <X size={22} />
      </button>
    </div>
  );
}

function useObjectUrl(blob: Blob | undefined | null) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

/** Shows a saved screenshot (by id). Tap = zoom. */
export function SavedShot({ id, label }: { id?: string; label: string }) {
  const shot = useScreenshot(id);
  const url = useObjectUrl(shot?.blob);
  const [zoom, setZoom] = useState(false);
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="muted small">{label}</div>
      <div className="shot" onClick={() => url && setZoom(true)} style={{ cursor: url ? 'zoom-in' : 'default' }}>
        {url ? <img src={url} alt={label} /> : <span className="faint small">No screenshot</span>}
      </div>
      {zoom && url && <ImageZoom src={url} onClose={() => setZoom(false)} />}
    </div>
  );
}

/**
 * Screenshot slot used in the form. Shows either a new (not yet saved) blob
 * or the existing saved screenshot.
 */
export function ShotSlot({
  label,
  savedId,
  pending,
  onPick,
  onRemove,
}: {
  label: string;
  savedId?: string;
  pending: Blob | null | undefined; // undefined = unchanged, null = removed
  onPick: (f: File) => void;
  onRemove: () => void;
}) {
  const shot = useScreenshot(pending === undefined ? savedId : undefined);
  const pendingUrl = useObjectUrl(pending ?? undefined);
  const savedUrl = useObjectUrl(pending === undefined ? shot?.blob : undefined);
  const url = pending ? pendingUrl : pending === null ? undefined : savedUrl;
  const [zoom, setZoom] = useState(false);
  const inputId = `shot-${label}`;
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="muted small">{label}</div>
      {url ? (
        <div className="shot" onClick={() => setZoom(true)} style={{ cursor: 'zoom-in', borderStyle: 'solid' }}>
          <img src={url} alt={label} />
          <button
            type="button"
            className="btn icon sm x"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label="Remove screenshot"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <label className="shot" htmlFor={inputId}>
          <span className="col" style={{ alignItems: 'center', gap: 6 }}>
            <Camera size={22} />
            <span className="small">Add {label.toLowerCase()} screenshot</span>
          </span>
        </label>
      )}
      <input
        id={inputId}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = '';
        }}
      />
      {zoom && url && <ImageZoom src={url} onClose={() => setZoom(false)} />}
    </div>
  );
}
