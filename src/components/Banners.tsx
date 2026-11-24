import { Link } from 'react-router-dom';
import { CalendarCheck, HardDriveDownload, ArrowRight, CircleDot } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { useAllTrades } from '../data/api';
import { computeStats, type CT } from '../lib/calc';
import { inPeriod, lastFinished } from '../lib/reviews';
import { fmtR } from '../lib/format';

export function Banners({ list }: { list: CT[] }) {
  const { settings, showMode } = useApp();
  const all = useAllTrades();
  const open = list.filter((x) => x.t.status === 'open').length;
  const week = lastFinished(list, 'week');
  const month = lastFinished(list, 'month');
  const hasRealData = (all ?? []).some((t) => !t.isSample);
  const backupDue = !showMode && hasRealData && (!settings.lastBackupAt || Date.now() - settings.lastBackupAt > 7 * 24 * 3600 * 1000);

  const items = [];
  if (backupDue)
    items.push(
      <div className="banner warning" key="backup">
        <HardDriveDownload size={18} />
        <span className="bold">Backup due</span>
        <span className="small">
          {settings.lastBackupAt ? 'Your last backup is older than 7 days.' : 'You have never downloaded a backup.'} Your data lives only on this
          device.
        </span>
        <span className="spacer" />
        <Link to="/settings" className="link-btn">
          Back up now <ArrowRight size={15} />
        </Link>
      </div>,
    );
  if (week && settings.seenWeeklyReview !== week.key) {
    const s = computeStats(inPeriod(list, week));
    items.push(
      <div className="banner" key="week">
        <CalendarCheck size={18} className="accent-icon" />
        <span className="bold">Weekly review ready · {week.label}</span>
        <span className="muted small">
          {fmtR(s.totalR)} · {s.closed} trades
        </span>
        <span className="spacer" />
        <Link to={`/reviews?p=${encodeURIComponent(week.key)}`} className="link-btn">
          Open review <ArrowRight size={15} />
        </Link>
      </div>,
    );
  }
  if (month && settings.seenMonthlyReview !== month.key) {
    items.push(
      <div className="banner" key="month">
        <CalendarCheck size={18} className="accent-icon" />
        <span className="bold">Monthly review ready · {month.label}</span>
        <span className="spacer" />
        <Link to={`/reviews?p=${encodeURIComponent(month.key)}`} className="link-btn">
          Open review <ArrowRight size={15} />
        </Link>
      </div>,
    );
  }
  if (open > 0)
    items.push(
      <div className="banner" key="open">
        <CircleDot size={18} className="accent-icon" />
        <span className="bold">
          You have {open} open trade{open === 1 ? '' : 's'}
        </span>
        <span className="muted small">Close them when you exit so your stats stay correct.</span>
      </div>,
    );
  if (!items.length) return null;
  return <div className="col">{items}</div>;
}
