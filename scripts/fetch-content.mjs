/**
 * Hollow Reign content migration.
 *
 * Pulls chapters, blog posts, and info pages from the WordPress.com public REST
 * API and writes them into the repo as VERBATIM HTML bodies + JSON manifests.
 *
 *   - Raw API responses are archived under migration/raw/ for provenance.
 *   - Only site "chrome" is stripped (author-added Next/Prev links, share/related
 *     widgets). All prose is preserved byte-for-byte.
 *   - Internal links and on-page images are rewritten to a `__BASE__/…`
 *     placeholder so the base path can be applied at render time; images are
 *     downloaded into public/images/ so the site no longer depends on WordPress.
 *
 * Re-runnable: it overwrites outputs and skips images already downloaded.
 *
 * Usage:  node scripts/fetch-content.mjs
 */
import { mkdir, writeFile, readdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SITE = 'hollowreign.wordpress.com';
const API = `https://public-api.wordpress.com/wp/v2/sites/${SITE}`;

const DIRS = {
  raw: path.join(ROOT, 'migration', 'raw'),
  img: path.join(ROOT, 'public', 'images'),
  chapters: path.join(ROOT, 'src', 'book', 'chapters'),
  posts: path.join(ROOT, 'src', 'book', 'posts'),
  pages: path.join(ROOT, 'src', 'book', 'pages'),
  data: path.join(ROOT, 'src', 'data'),
};

// Canonical chapter order & titles (WordPress titles are sometimes blank).
const CHAPTER_WORDS = [
  'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen', 'Twenty', 'Twenty-One', 'Twenty-Two', 'Twenty-Three',
  'Twenty-Four', 'Twenty-Five', 'Twenty-Six', 'Twenty-Seven', 'Twenty-Eight',
  'Twenty-Nine', 'Thirty', 'Thirty-One', 'Thirty-Two', 'Thirty-Three',
];
const CHAPTER_SLUGS = CHAPTER_WORDS.map((w) => `chapter-${w.toLowerCase()}`);
const CHAPTER_SET = new Set(CHAPTER_SLUGS);

// Info pages whose prose we preserve and render as-is.
const PROSE_PAGES = {
  'about-the-project': 'About the Project',
  'about-us': 'About the Creators',
  'support-hollow-reign': 'Support Hollow Reign',
  'art-gallery': 'Art Gallery',
  'species-guide': 'Maps & Species Guide',
};
const PROSE_SET = new Set(Object.keys(PROSE_PAGES));

const NAV_LINK_TEXT = new Set([
  'next', 'previous', 'prev', 'next chapter', 'previous chapter',
  'next →', '→ next', '← previous', 'previous ←', '« previous', 'next »',
  'table of contents', 'contents', 'back to table of contents',
]);

const INTERNAL_HOSTS = new Set(['hollowreign.com', 'hollowreign.wordpress.com']);

// ---- image vendoring -------------------------------------------------------
const urlToFile = new Map();
const usedNames = new Set();
let ogCandidate = null; // { name } first raster image, reused as default OG image

function safeName(pathname) {
  let name = decodeURIComponent(pathname.split('/').pop() || 'image');
  name = name.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_');
  if (!/\.[a-z0-9]+$/i.test(name)) name += '.img';
  let final = name;
  let i = 1;
  while (usedNames.has(final) && urlToFile.get(final) !== name) {
    const dot = name.lastIndexOf('.');
    final = `${name.slice(0, dot)}-${i}${name.slice(dot)}`;
    i++;
  }
  return final;
}

async function downloadImage(u) {
  const bare = `${u.origin}${u.pathname}`;
  if (urlToFile.has(bare)) return urlToFile.get(bare);

  const name = safeName(u.pathname);
  const dest = path.join(DIRS.img, name);
  usedNames.add(name);
  urlToFile.set(bare, name);

  if (!existsSync(dest)) {
    let res = await fetch(bare).catch(() => null);
    if (!res || !res.ok) res = await fetch(u.href).catch(() => null); // retry with query
    if (!res || !res.ok) {
      console.warn(`  ! could not download image: ${u.href}`);
      return name;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
    console.log(`  ↓ image ${name} (${(buf.length / 1024).toFixed(0)} KB)`);
    if (!ogCandidate && /\.(jpe?g|png)$/i.test(name)) ogCandidate = { buf, name };
  }
  return name;
}

// ---- HTML cleaning ---------------------------------------------------------
const BLOCK_TAGS =
  'address|article|aside|blockquote|details|div|dl|dd|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul|li|img|iframe';

/**
 * Minimal wpautop: reconstruct paragraphs for "Classic editor" chapters whose
 * content.rendered comes back as bare text separated by blank lines (no <p>).
 * Mirrors WordPress: blank line => new <p>, single newline => <br>.
 */
function wpautop(text) {
  text = String(text).replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return '';
  const startsBlock = new RegExp('^<(' + BLOCK_TAGS + ')[\\s>/]', 'i');
  const endsBlock = new RegExp('</(' + BLOCK_TAGS + ')>\\s*$', 'i');
  return text
    .split(/\n\s*\n/)
    .map((block) => {
      const t = block.trim();
      if (!t) return '';
      if (startsBlock.test(t) || endsBlock.test(t)) return t;
      return '<p>' + t.replace(/\n/g, '<br>\n') + '</p>';
    })
    .filter(Boolean)
    .join('\n\n');
}

/** Convert a leading <br>-joined dateline paragraph into styled .dateline lines. */
function unifyDateline(root) {
  const firstP = root.querySelector('p');
  if (!firstP) return;
  const inner = firstP.innerHTML;
  if (!/<br\s*\/?>/i.test(inner)) return;
  if (!/Luka\s*\d/i.test(firstP.text)) return; // in-world year marker
  const lines = inner
    .split(/<br\s*\/?>/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length < 2) return;
  const html = lines.map((l) => `<p class="dateline">${l}</p>`).join('');
  firstP.insertAdjacentHTML('beforebegin', html);
  firstP.remove();
}

function rewriteHref(href, postSlugs) {
  if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) return null;
  let u;
  try {
    u = new URL(href, 'https://hollowreign.com');
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');
  if (!INTERNAL_HOSTS.has(host)) return null; // external — leave untouched
  const segs = u.pathname.split('/').filter(Boolean);
  if (segs.length === 0) return '__BASE__/';
  if (segs.length >= 4 && /^\d{4}$/.test(segs[0])) {
    return `__BASE__/blog/${segs[segs.length - 1]}/`;
  }
  const first = segs[0];
  if (postSlugs.has(first)) return `__BASE__/blog/${first}/`;
  if (first === 'volume-2-landing') return '__BASE__/volume-two/';
  if (CHAPTER_SET.has(first) || PROSE_SET.has(first) || first === 'table-of-contents') {
    return `__BASE__/${first}/`;
  }
  return `__BASE__/${segs.join('/')}/`;
}

async function cleanHtml(html, { postSlugs }) {
  // Always normalize: wpautop wraps bare-text runs in <p> while leaving existing
  // block elements (Gutenberg <p>, <figure>, <img>, <h6>…) untouched. This fixes
  // Classic-editor chapters that arrive as bare text, including mixed content.
  const root = parse(wpautop(html), { comment: false });

  // Remove share / related / subscribe widgets if any slipped into content.
  for (const el of root.querySelectorAll('*')) {
    const cls = el.getAttribute && el.getAttribute('class');
    if (cls && /sharedaddy|jp-relatedposts|jp-post-flair|sd-sharing|sharing-clear|wpcom-|wp-block-jetpack/i.test(cls)) {
      el.remove();
    }
  }

  // Remove author-added Next/Previous/Contents navigation links.
  const navParents = new Set();
  for (const a of root.querySelectorAll('a')) {
    const t = a.text.trim().toLowerCase();
    const isNav = NAV_LINK_TEXT.has(t) || (/^(next|previous|prev)\b/.test(t) && t.length <= 18);
    if (isNav) {
      const p = a.parentNode;
      a.remove();
      if (p) navParents.add(p);
    }
  }
  for (const p of navParents) {
    if (p.tagName === 'P' && /^[\s|·•―—–\-]*$/.test(p.text)) p.remove();
  }

  // Restyle the in-world dateline (strip the WordPress line-height:0 hack).
  for (const p of root.querySelectorAll('p')) {
    const style = p.getAttribute('style') || '';
    if (/line-height\s*:\s*0/.test(style)) {
      p.removeAttribute('style');
      p.classList.add('dateline');
    }
  }

  // Rewrite internal links.
  for (const a of root.querySelectorAll('a')) {
    const nh = rewriteHref(a.getAttribute('href'), postSlugs);
    if (nh) a.setAttribute('href', nh);
  }

  // Vendor & rewrite images.
  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src');
    if (!src) {
      img.remove();
      continue;
    }
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    try {
      const u = new URL(src, 'https://hollowreign.wordpress.com');
      if (/(wordpress\.com|wp\.com|hollowreign\.com)$/i.test(u.hostname)) {
        const file = await downloadImage(u);
        img.setAttribute('src', `__BASE__/images/${file}`);
      }
    } catch {
      /* leave src as-is */
    }
    if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
    if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');
    if (img.getAttribute('alt') == null) img.setAttribute('alt', '');
  }

  unifyDateline(root);
  return root.toString().trim();
}

function extractDateline(html) {
  const root = parse(html);
  let lines = root
    .querySelectorAll('p.dateline')
    .map((p) => p.text.replace(/ /g, ' ').trim())
    .filter(Boolean);
  if (lines.length && /^\d+\.?$/.test(lines[0])) lines = lines.slice(1); // drop leading chapter number
  return lines.join(' · ');
}

function plainText(html) {
  return parse(html || '')
    .text.replace(/\s+/g, ' ')
    .replace(/\s*(Continue reading.*|\[…\]|\[\.\.\.\])\s*$/i, '')
    .trim();
}

function fmtDate(iso) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
}

// ---- fetching --------------------------------------------------------------
async function fetchAll(type, fields) {
  const url = `${API}/${type}?per_page=100&_fields=${fields}&orderby=date&order=asc`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${type} fetch failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  await writeFile(path.join(DIRS.raw, `${type}.json`), JSON.stringify(data, null, 2));
  return data;
}

async function main() {
  for (const d of Object.values(DIRS)) await mkdir(d, { recursive: true });

  console.log('Fetching from WordPress.com public API…');
  const [pages, posts] = await Promise.all([
    fetchAll('pages', 'id,slug,title,content,date,modified,link'),
    fetchAll('posts', 'id,slug,title,content,excerpt,date,modified,link'),
  ]);
  // Media is archived for provenance only (non-fatal).
  try {
    await fetchAll('media', 'id,slug,source_url,alt_text,caption,media_details');
  } catch (e) {
    console.warn('  (media list unavailable — continuing)', e.message);
  }
  console.log(`  ${pages.length} pages, ${posts.length} posts`);

  const postSlugs = new Set(posts.map((p) => p.slug));
  const pagesBySlug = new Map(pages.map((p) => [p.slug, p]));

  // ---- Chapters ----
  const chapterManifest = [];
  for (let i = 0; i < CHAPTER_SLUGS.length; i++) {
    const slug = CHAPTER_SLUGS[i];
    const page = pagesBySlug.get(slug);
    if (!page) {
      console.warn(`  ! missing chapter page: ${slug}`);
      continue;
    }
    const body = await cleanHtml(page.content.rendered, { postSlugs });
    await writeFile(path.join(DIRS.chapters, `${slug}.html`), body + '\n');
    chapterManifest.push({
      slug,
      number: i + 1,
      title: `Chapter ${CHAPTER_WORDS[i]}`,
      dateline: extractDateline(body),
      volume: 1,
    });
  }
  console.log(`  wrote ${chapterManifest.length} chapters`);

  // ---- Info prose pages ----
  const pageManifest = [];
  for (const [slug, title] of Object.entries(PROSE_PAGES)) {
    const page = pagesBySlug.get(slug);
    if (!page) {
      console.warn(`  ! missing page: ${slug}`);
      continue;
    }
    const body = await cleanHtml(page.content.rendered, { postSlugs });
    await writeFile(path.join(DIRS.pages, `${slug}.html`), body + '\n');
    pageManifest.push({ slug, title });
  }
  console.log(`  wrote ${pageManifest.length} info pages`);

  // ---- Blog posts (newest first) ----
  const postManifest = [];
  const sorted = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
  for (const post of sorted) {
    const body = await cleanHtml(post.content.rendered, { postSlugs });
    await writeFile(path.join(DIRS.posts, `${post.slug}.html`), body + '\n');
    postManifest.push({
      slug: post.slug,
      title: plainText(post.title.rendered),
      date: post.date,
      dateDisplay: fmtDate(post.date),
      excerpt: plainText(post.excerpt?.rendered) || plainText(post.content.rendered).slice(0, 200),
    });
  }
  console.log(`  wrote ${postManifest.length} blog posts`);

  // ---- Default social image (prefer the book cover; else first illustration) ----
  const allImgs = (await readdir(DIRS.img)).filter((f) => f !== 'og-default.jpg');
  const cover = allImgs.find((f) => /cover/i.test(f) && /\.(jpe?g|png)$/i.test(f));
  if (cover) {
    await copyFile(path.join(DIRS.img, cover), path.join(DIRS.img, 'og-default.jpg'));
    console.log(`  set og-default.jpg from ${cover}`);
  } else if (ogCandidate) {
    await writeFile(path.join(DIRS.img, 'og-default.jpg'), ogCandidate.buf);
    console.log(`  set og-default.jpg from ${ogCandidate.name}`);
  }

  // ---- Manifests ----
  await writeFile(path.join(DIRS.data, 'chapters.json'), JSON.stringify(chapterManifest, null, 2) + '\n');
  await writeFile(path.join(DIRS.data, 'posts.json'), JSON.stringify(postManifest, null, 2) + '\n');
  await writeFile(path.join(DIRS.data, 'pages.json'), JSON.stringify(pageManifest, null, 2) + '\n');

  const imgs = (await readdir(DIRS.img)).filter((f) => f !== '.gitkeep');
  console.log(`\nDone. ${chapterManifest.length} chapters, ${postManifest.length} posts, ${pageManifest.length} pages, ${imgs.length} images vendored.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
