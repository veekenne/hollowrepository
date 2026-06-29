/** Shared light/dark theme helpers (used by the header toggle and reader settings). */
export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'hr-theme';

export function getPref(): ThemePref {
  try {
    return (localStorage.getItem(KEY) as ThemePref) || 'system';
  } catch {
    return 'system';
  }
}

export function resolve(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return pref;
}

export function apply(pref: ThemePref): void {
  document.documentElement.dataset.theme = resolve(pref);
}

export function setPref(pref: ThemePref): void {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* ignore */
  }
  apply(pref);
  document.dispatchEvent(new CustomEvent('hr:themechange', { detail: pref }));
}
