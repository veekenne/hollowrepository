/** Reader enhancements: progress bar, keyboard chapter nav, settings, continue-reading. */
import { navigate } from 'astro:transitions/client';
import { getPref, setPref } from './theme';

const SCALE_KEY = 'hr-reader-scale';
const LAST_KEY = 'hr-last-chapter';

function getScale(): string {
  try {
    return localStorage.getItem(SCALE_KEY) || '1';
  } catch {
    return '1';
  }
}
function setScale(s: string): void {
  try {
    localStorage.setItem(SCALE_KEY, s);
  } catch {
    /* ignore */
  }
  document.documentElement.style.setProperty('--reader-scale', s);
}

function syncButtons(): void {
  const pref = getPref();
  const scale = getScale();
  document.querySelectorAll<HTMLElement>('[data-theme-pref]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.themePref === pref));
  });
  document.querySelectorAll<HTMLElement>('[data-scale]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.scale === scale));
  });
}

// ---- progress bar (module scope: one listener, queries current DOM) ----
function updateProgress(): void {
  const bar = document.querySelector<HTMLElement>('.reader-progress');
  const article = document.querySelector<HTMLElement>('.chapter');
  if (!bar || !article) return;
  const start = article.offsetTop;
  const end = start + article.offsetHeight - window.innerHeight;
  const p = (window.scrollY - start) / Math.max(end - start, 1);
  bar.style.setProperty('--progress', String(Math.min(Math.max(p, 0), 1)));
}

let ticking = false;
window.addEventListener(
  'scroll',
  () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        updateProgress();
        ticking = false;
      });
      ticking = true;
    }
  },
  { passive: true }
);
window.addEventListener('resize', updateProgress);

// ---- keyboard chapter navigation ----
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (e.key === 'ArrowRight') {
    const n = document.querySelector<HTMLAnchorElement>('[data-next-chapter]');
    if (n) {
      e.preventDefault();
      navigate(n.getAttribute('href')!);
    }
  } else if (e.key === 'ArrowLeft') {
    const p = document.querySelector<HTMLAnchorElement>('[data-prev-chapter]');
    if (p) {
      e.preventDefault();
      navigate(p.getAttribute('href')!);
    }
  }
});

// ---- close settings panel on outside click / Escape ----
function closeSettings(): void {
  const panel = document.getElementById('reader-settings-panel');
  const toggle = document.querySelector('[data-settings-toggle]');
  if (panel && !panel.hasAttribute('hidden')) {
    panel.setAttribute('hidden', '');
    toggle?.setAttribute('aria-expanded', 'false');
  }
}
document.addEventListener('click', (e) => {
  const panel = document.getElementById('reader-settings-panel');
  const toggle = document.querySelector('[data-settings-toggle]');
  if (!panel || panel.hasAttribute('hidden')) return;
  const t = e.target as Node;
  if (panel.contains(t) || (toggle && toggle.contains(t))) return;
  closeSettings();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSettings();
});

// keep settings buttons in sync if theme is changed elsewhere (header toggle)
document.addEventListener('hr:themechange', syncButtons);

// ---- per-page wiring ----
function initReaderPage(): void {
  setScale(getScale()); // ensure applied after view transition
  syncButtons();
  updateProgress();

  const toggle = document.querySelector<HTMLButtonElement>('[data-settings-toggle]');
  const panel = document.getElementById('reader-settings-panel');
  if (toggle && panel) {
    toggle.onclick = () => {
      const willOpen = panel.hasAttribute('hidden');
      panel.toggleAttribute('hidden');
      toggle.setAttribute('aria-expanded', String(willOpen));
    };
  }
  panel?.querySelectorAll<HTMLElement>('[data-theme-pref]').forEach((b) => {
    b.onclick = () => {
      setPref(b.dataset.themePref as 'light' | 'dark' | 'system');
      syncButtons();
    };
  });
  panel?.querySelectorAll<HTMLElement>('[data-scale]').forEach((b) => {
    b.onclick = () => {
      setScale(b.dataset.scale!);
      syncButtons();
    };
  });

  // remember last chapter for "continue reading"
  const art = document.querySelector<HTMLElement>('[data-chapter-slug]');
  if (art) {
    try {
      localStorage.setItem(
        LAST_KEY,
        JSON.stringify({
          slug: art.dataset.chapterSlug,
          number: art.dataset.chapterNumber,
          title: art.dataset.chapterTitle,
        })
      );
    } catch {
      /* ignore */
    }
  }
}

document.addEventListener('astro:page-load', initReaderPage);
