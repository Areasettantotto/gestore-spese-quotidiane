/**
 * Theme resolution contract.
 * Keep storage key, allowed preference values, and the system media query
 * aligned with the pre-React bootstrap in index.html.
 */

export type ThemePreference = 'system' | 'light' | 'dark';
export type EffectiveTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'gsq.theme-preference';
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';
export const SYSTEM_COLOR_SCHEME_MEDIA = '(prefers-color-scheme: dark)';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
    return DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function writeThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage may be unavailable; the in-memory preference still applies.
  }
}

export function resolveEffectiveTheme(preference: ThemePreference): EffectiveTheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return window.matchMedia(SYSTEM_COLOR_SCHEME_MEDIA).matches ? 'dark' : 'light';
}

export function applyEffectiveTheme(theme: EffectiveTheme): void {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.style.colorScheme = theme;
}
