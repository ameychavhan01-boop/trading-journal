import { useState } from 'react';
import { Delete } from 'lucide-react';
import { Modal } from './Modal';

/** Number pad that asks for a 4–6 digit PIN. */
export function PinModal({
  title,
  subtitle,
  onSubmit,
  onClose,
  confirmNew,
}: {
  title: string;
  subtitle?: string;
  /** return an error message, or null when accepted */
  onSubmit: (pin: string) => Promise<string | null> | string | null;
  onClose: () => void;
  /** creating a new PIN: ask twice */
  confirmNew?: boolean;
}) {
  const [pin, setPin] = useState('');
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState('');

  const submit = async (value: string) => {
    if (value.length < 4) {
      setError('PIN must be 4 to 6 digits');
      return;
    }
    if (confirmNew && first === null) {
      setFirst(value);
      setPin('');
      setError('');
      return;
    }
    if (confirmNew && first !== value) {
      setError('PINs did not match. Try again.');
      setFirst(null);
      setPin('');
      return;
    }
    const err = await onSubmit(value);
    if (err) {
      setError(err);
      setPin('');
    }
  };

  const press = (d: string) => {
    if (pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    setError('');
  };

  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ textAlign: 'center' }} className="muted">
        {confirmNew && first !== null ? 'Type the same PIN again to confirm' : subtitle ?? 'Enter your 4–6 digit PIN'}
      </div>
      <div className="pin-dots">
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      {error && (
        <div className="loss small" style={{ textAlign: 'center', marginBottom: 12 }}>
          {error}
        </div>
      )}
      <div className="pinpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button onClick={() => setPin(pin.slice(0, -1))} aria-label="Delete">
          <Delete size={20} />
        </button>
        <button onClick={() => press('0')}>0</button>
        <button
          onClick={() => submit(pin)}
          style={{ background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 16 }}
        >
          OK
        </button>
      </div>
    </Modal>
  );
}
