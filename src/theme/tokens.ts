// ALL colours used by the app. To add a new theme (e.g. "Futuristic"),
// copy one block below, change the values and add it to THEMES.

export interface ThemeTokens {
  bg: string;
  card: string;
  card2: string; // slightly raised surface (inputs, chips)
  border: string;
  text: string;
  text2: string; // secondary text
  text3: string; // faint text (₹ line, hints)
  accent: string;
  accentText: string; // text on accent buttons
  accentSoft: string;
  profit: string;
  profitSoft: string;
  loss: string;
  lossSoft: string;
  warning: string;
  warningSoft: string;
  grid: string; // chart grid lines
  series2: string; // second line on Compare chart
  overlay: string; // modal backdrop
  shadow: string;
}

export const LIGHT: ThemeTokens = {
  bg: '#F3F5F8',
  card: '#FFFFFF',
  card2: '#F6F8FB',
  border: '#E2E6EC',
  text: '#0F172A',
  text2: '#4F5B6B',
  text3: '#6B7685',
  accent: '#2563EB',
  accentText: '#FFFFFF',
  accentSoft: '#E6EEFD',
  profit: '#0B7A45',
  profitSoft: '#E3F3EA',
  loss: '#C4372B',
  lossSoft: '#FBE9E7',
  warning: '#985300',
  warningSoft: '#FCEFD9',
  grid: '#E9EDF2',
  series2: '#9333EA',
  overlay: 'rgba(15, 23, 42, 0.45)',
  shadow: '0 8px 30px rgba(15, 23, 42, 0.12)',
};

export const DARK: ThemeTokens = {
  bg: '#0A0E13',
  card: '#121821',
  card2: '#18202B',
  border: '#222C38',
  text: '#E7EBF0',
  text2: '#A3ADBA',
  text3: '#7D8896',
  accent: '#6AA5FF',
  accentText: '#06101F',
  accentSoft: '#15243A',
  profit: '#3DD68C',
  profitSoft: '#0F2A1E',
  loss: '#FF7B6E',
  lossSoft: '#2E1714',
  warning: '#F5B544',
  warningSoft: '#2C2210',
  grid: '#1B2430',
  series2: '#C79BFF',
  overlay: 'rgba(0, 0, 0, 0.6)',
  shadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
};

export const THEMES = { light: LIGHT, dark: DARK } as const;
export type ThemeName = keyof typeof THEMES;

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

export function applyTheme(name: ThemeName) {
  const t = THEMES[name] ?? DARK;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t)) root.style.setProperty(`--${kebab(k)}`, v);
  root.dataset.theme = name;
  root.style.colorScheme = name === 'light' ? 'light' : 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg);
  try {
    localStorage.setItem('tj-theme', name);
  } catch {
    /* ignore */
  }
}

/** Theme to show before the database has loaded (avoids a flash). */
export function initialTheme(): ThemeName {
  try {
    const v = localStorage.getItem('tj-theme');
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return 'dark';
}
