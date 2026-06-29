/**
 * Site-wide configuration and small helpers.
 * Keep copy/branding here so it lives in one place.
 */

export const SITE_TITLE = 'Hollow Reign';
export const SITE_TAGLINE = 'A Queer Space Saga for All';
export const SITE_DESCRIPTION =
  'Hollow Reign is a free, serialized illustrated novel — a queer space saga for all. ' +
  'The story of an accidental queer space pirate kid turned fake princess changing the Worlds, one lie at a time.';

export const AUTHORS = {
  writer: 'Volta Volgate',
  illustrator: 'Rowan Westmoreland',
};

export const KOFI_URL = 'https://ko-fi.com/hollowreign';

/** Primary navigation. Hrefs are app-absolute (leading slash); pass through withBase() when rendering. */
export const NAV: { label: string; href: string }[] = [
  { label: 'Contents', href: '/table-of-contents/' },
  { label: 'About the Project', href: '/about-the-project/' },
  { label: 'Creators', href: '/about-us/' },
  { label: 'Worlds Guide', href: '/species-guide/' },
  { label: 'Art Gallery', href: '/art-gallery/' },
  { label: 'Support', href: '/support-hollow-reign/' },
  { label: 'Blog', href: '/blog/' },
];

/**
 * Join an app-absolute path with the configured base path so links work whether
 * the site is served from a subpath (project Pages) or the domain root.
 */
export function withBase(path = '/'): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, ''); // strip trailing slash
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}` || '/';
}

/**
 * Migrated HTML stores internal links/images as `__BASE__/…` placeholders so the
 * base path can be applied at render time. Resolve them before injecting with set:html.
 */
export function resolveHtml(html: string): string {
  return html.replaceAll('__BASE__/', import.meta.env.BASE_URL);
}

/** Absolute URL for canonical/OG tags. */
export function absoluteUrl(path = '/'): string {
  return new URL(withBase(path), import.meta.env.SITE).toString();
}
