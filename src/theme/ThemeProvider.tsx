import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  applyEffectiveTheme,
  readThemePreference,
  resolveEffectiveTheme,
  SYSTEM_COLOR_SCHEME_MEDIA,
  writeThemePreference,
  type EffectiveTheme,
  type ThemePreference,
} from './theme';

type ThemeContextValue = {
  preference: ThemePreference;
  effectiveTheme: EffectiveTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readThemePreference);
  const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>(() =>
    resolveEffectiveTheme(readThemePreference()),
  );

  useLayoutEffect(() => {
    applyEffectiveTheme(effectiveTheme);
  }, [effectiveTheme]);

  useEffect(() => {
    if (preference !== 'system') return undefined;

    const mediaQuery = window.matchMedia(SYSTEM_COLOR_SCHEME_MEDIA);
    const syncFromSystem = () => {
      setEffectiveTheme(resolveEffectiveTheme('system'));
    };

    mediaQuery.addEventListener('change', syncFromSystem);
    return () => {
      mediaQuery.removeEventListener('change', syncFromSystem);
    };
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    writeThemePreference(next);
    setPreferenceState(next);
    setEffectiveTheme(resolveEffectiveTheme(next));
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, effectiveTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return value;
}
