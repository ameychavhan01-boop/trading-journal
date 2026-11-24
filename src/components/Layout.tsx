import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  List,
  PlusCircle,
  Lightbulb,
  CalendarCheck,
  Columns2,
  Settings as SettingsIcon,
  Lock,
  ChevronDown,
  Eye,
  EyeOff,
  Plus,
  MoreHorizontal,
  Sun,
  Moon,
  Check,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { Modal } from './Modal';
import { updateSettings } from '../data/api';
import { checkPin, hashPin } from '../lib/pin';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/trades', label: 'Trades', icon: List },
  { to: '/add', label: 'Add trade', icon: PlusCircle },
  { to: '/strategies', label: 'Strategies', icon: Lightbulb },
  { to: '/reviews', label: 'Reviews', icon: CalendarCheck },
  { to: '/compare', label: 'Compare', icon: Columns2, hideInShow: true },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Layout() {
  const { showMode } = useApp();
  const [more, setMore] = useState(false);
  const nav = NAV.filter((n) => !(showMode && n.hideInShow));
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="eyebrow">Journal</div>
        <JournalSwitcher />
        <div style={{ height: 14 }} />
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <n.icon size={18} />
            {n.label}
          </NavLink>
        ))}
        <ShowModeCard />
      </aside>

      <main className="main">
        <div className="mobile-top">
          <div style={{ flex: 1, minWidth: 0 }}>
            <JournalSwitcher compact />
          </div>
          <ThemeToggle />
          <Logo />
        </div>
        <Outlet />
      </main>

      <nav className="bottom-nav">
        <NavLink to="/" end>
          <LayoutGrid size={22} />
          Home
        </NavLink>
        <NavLink to="/trades">
          <List size={22} />
          Trades
        </NavLink>
        <NavLink to="/add" className="plus" aria-label="Add trade">
          <Plus size={28} />
        </NavLink>
        <NavLink to="/reviews">
          <CalendarCheck size={22} />
          Reviews
        </NavLink>
        <button onClick={() => setMore(true)}>
          <MoreHorizontal size={22} />
          More
        </button>
      </nav>

      {more && (
        <Modal title="More" onClose={() => setMore(false)}>
          <div className="col" style={{ gap: 4 }}>
            {nav
              .filter((n) => ['/strategies', '/compare', '/settings', '/add'].includes(n.to))
              .map((n) => (
                <NavLink key={n.to} to={n.to} className="nav-item" onClick={() => setMore(false)}>
                  <n.icon size={18} />
                  {n.label}
                </NavLink>
              ))}
          </div>
          <div style={{ height: 12 }} />
          <ShowModeCard />
        </Modal>
      )}
    </div>
  );
}

export function Logo() {
  return <img src="jsr-logo.png" alt="JSR" className="logo" />;
}

export function ThemeToggle() {
  const { settings } = useApp();
  const dark = settings.theme === 'dark';
  return (
    <button
      className="btn icon"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => updateSettings({ theme: dark ? 'light' : 'dark' })}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

/** Page header: title on the left, actions, then theme toggle + JSR logo top-right. */
export function PageHeader({
  title,
  badge,
  subtitle,
  actions,
}: {
  title: string;
  badge?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="titles">
        <h1>
          {title} {badge}
        </h1>
        {subtitle && <div className="muted small" style={{ marginTop: 4 }}>{subtitle}</div>}
      </div>
      <div className="header-actions">
        {actions}
        <span className="hide-mobile">
          <ThemeToggle />
        </span>
        <span className="hide-mobile">
          <Logo />
        </span>
      </div>
    </div>
  );
}

function JournalSwitcher({ compact }: { compact?: boolean }) {
  const { journals, active, setActive, isUnlocked, showMode } = useApp();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const lockedCount = journals.filter((j) => j.pinHash).length;
  return (
    <>
      <button
        className="btn block"
        style={{ justifyContent: 'space-between', fontWeight: 600 }}
        onClick={() => setOpen(true)}
      >
        <span className="row" style={{ gap: 8, minWidth: 0 }}>
          {active?.pinHash && <Lock size={15} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{active?.name ?? 'Choose journal'}</span>
        </span>
        <ChevronDown size={16} />
      </button>
      {!compact && (
        <div className="faint tiny" style={{ marginTop: 6 }}>
          {journals.length} journal{journals.length === 1 ? '' : 's'}
          {lockedCount ? ` · ${lockedCount} locked` : ''}
          {showMode ? ' · Show mode on' : ''}
        </div>
      )}
      {open && (
        <Modal title="Choose journal" onClose={() => setOpen(false)}>
          <div className="col" style={{ gap: 0 }}>
            {journals.map((j) => (
              <button
                key={j.id}
                className="list-row"
                style={{ background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                onClick={async () => {
                  setOpen(false);
                  await setActive(j.id);
                }}
              >
                {j.pinHash ? <Lock size={16} className={isUnlocked(j) ? 'faint' : ''} /> : <span style={{ width: 16 }} />}
                <span className="spacer">
                  <div className="bold">{j.name}</div>
                  <div className="faint tiny">{j.type}{j.isSample ? ' · Sample' : ''}</div>
                </span>
                {active?.id === j.id && <Check size={18} className="accent" />}
              </button>
            ))}
          </div>
          {!showMode && (
            <div className="modal-foot">
              <button
                className="btn"
                onClick={() => {
                  setOpen(false);
                  navigate('/settings');
                }}
              >
                Manage journals
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

function ShowModeCard() {
  const { settings, journals, isUnlocked, askPin, unlockJournal, toast } = useApp();
  const [picking, setPicking] = useState(false);
  const on = settings.showMode.on;

  const turnOff = () =>
    askPin({
      title: 'Turn off Show mode',
      subtitle: 'Enter your app PIN',
      onSubmit: async (pin) => {
        if (!checkPin(pin, 'app', settings.appPinHash)) return 'Wrong PIN';
        await updateSettings({ showMode: { on: false } });
        toast('Show mode is off – all journals are back');
        return null;
      },
    });

  const turnOn = async (journalId: string) => {
    const j = journals.find((x) => x.id === journalId)!;
    if (!(await unlockJournal(j))) return;
    const activate = async () => {
      await updateSettings({ showMode: { on: true, journalId }, activeJournalId: journalId });
      toast(`Show mode on – only “${j.name}” is visible`);
    };
    if (!settings.appPinHash) {
      askPin({
        title: 'Create your app PIN',
        subtitle: 'You will need this PIN to turn Show mode off',
        confirmNew: true,
        onSubmit: async (pin) => {
          await updateSettings({ appPinHash: hashPin(pin, 'app') });
          await activate();
          return null;
        },
      });
    } else await activate();
  };

  return (
    <div className={`show-card ${on ? 'on' : ''}`}>
      <div className="row bold" style={{ gap: 8 }}>
        {on ? <EyeOff size={16} className="warning" /> : <Eye size={16} />} Show mode {on && <span className="pill warning">On</span>}
      </div>
      <div className="muted tiny" style={{ margin: '6px 0 10px' }}>
        {on
          ? 'Only one journal is visible. Your PIN is needed to turn this off.'
          : 'Shows only one journal when someone sees your screen.'}
      </div>
      <button className="btn block" onClick={() => (on ? turnOff() : setPicking(true))}>
        {on ? 'Turn off' : 'Turn on'}
      </button>
      {picking && (
        <Modal title="Which journal should be visible?" onClose={() => setPicking(false)}>
          <div className="muted small" style={{ marginBottom: 10 }}>
            All other journals will disappear from the whole app until you turn Show mode off with your PIN.
          </div>
          {journals.map((j) => (
            <button
              key={j.id}
              className="list-row"
              style={{ background: 'none', border: 'none', borderBottom: '1px solid var(--border)', width: '100%', textAlign: 'left', cursor: 'pointer' }}
              onClick={() => {
                setPicking(false);
                turnOn(j.id);
              }}
            >
              {j.pinHash && !isUnlocked(j) ? <Lock size={16} /> : <Eye size={16} />}
              <span className="spacer bold">{j.name}</span>
              <span className="faint tiny">{j.type}</span>
            </button>
          ))}
        </Modal>
      )}
    </div>
  );
}
