import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'expense-lens.theme-mode';

export function readStoredTheme(): ThemeMode {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * The baseline theme follows the system scheme by default. Setting
 * `data-theme="baseline"` pins the light baseline; `data-theme-mode="dark"`
 * selects the official dark palette of the same theme.
 */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  root.dataset.theme = 'baseline';
  if (mode === 'dark') root.dataset.themeMode = 'dark';
  else delete root.dataset.themeMode;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Private or restricted storage must not break theme switching.
  }
}

export function initializeTheme(): void {
  applyTheme(readStoredTheme());
}

export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>(readStoredTheme);

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  return {
    mode,
    setMode,
    toggle: () => setMode((current) => (current === 'dark' ? 'light' : 'dark')),
  };
}
