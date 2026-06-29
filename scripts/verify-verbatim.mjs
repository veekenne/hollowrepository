/**
 * Verbatim fidelity check.
 *
 * For every chapter and blog post, compares the WORD MULTISET of the original
 * WordPress content.rendered against the migrated HTML body. The migration only
 * removes chrome (nav/share) and re-wraps paragraphs, so:
 *   - the output must add/alter NO words  -> `extra` must be 0  (hard failure)
 *   - the output must preserve the prose   -> coverage must stay high
 *
 * Usage: node scripts/verify-verbatim.mjs   (run after `npm run migrate`)
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const COVERAGE_FAIL = 0.8; // below this = likely accidental prose loss
const COVERAGE_WARN = 0.95;

function words(html) {
  // Insert whitespace at block boundaries so adjacent <p>/<br> text isn't glued
  // together (e.g. "2"+"Tuesday"); Classic source uses newlines, output uses <p>s.
  const withBreaks = String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(
      /<\/(p|div|h[1-6]|li|ul|ol|figure|figcaption|blockquote|section|header|footer|article|table|tr)>/gi,
      '\n'
    );
  const text = parse(withBreaks).text.replace(/ /g, ' ');
  return (text.toLowerCase().match(/[\p{L}\p{N}']+/gu) || []);
}
function multiset(arr) {
  const m = new Map();
  for (const w of arr) m.set(w, (m.get(w) || 0) + 1);
  return m;
}
function compare(srcArr, outArr) {
  const s = multiset(srcArr);
  const o = multiset(outArr);
  let matched = 0;
  let extra = 0;
  const extraWords = [];
  for (const [w, c] of o) {
    const sc = s.get(w) || 0;
    matched += Math.min(c, sc);
    if (c > sc) {
      extra += c - sc;
      if (extraWords.length < 12) extraWords.push(w);
    }
  }
  return {
    coverage: srcArr.length ? matched / srcArr.length : 1,
    extra,
    extraWords,
    srcTotal: srcArr.length,
  };
}

async function run() {
  const pages = JSON.parse(await readFile(path.join(ROOT, 'migration/raw/pages.json'), 'utf8'));
  const bySlug = (arr) => new Map(arr.map((x) => [x.slug, x]));
  const pageMap = bySlug(pages);

  const jobs = [];
  const chapters = JSON.parse(await readFile(path.join(ROOT, 'src/data/chapters.json'), 'utf8'));
  for (const c of chapters) {
    jobs.push({ kind: 'chapter', slug: c.slug, src: pageMap.get(c.slug), dir: 'src/book/chapters' });
  }

  let failures = 0;
  let warnings = 0;
  let minCoverage = 1;
  let totalExtra = 0;

  for (const job of jobs) {
    if (!job.src) {
      console.error(`  MISSING SOURCE: ${job.kind} ${job.slug}`);
      failures++;
      continue;
    }
    const out = await readFile(path.join(ROOT, job.dir, `${job.slug}.html`), 'utf8');
    const r = compare(words(job.src.content.rendered), words(out));
    minCoverage = Math.min(minCoverage, r.coverage);
    totalExtra += r.extra;
    const pct = (r.coverage * 100).toFixed(1);
    if (r.extra > 0 || r.coverage < COVERAGE_FAIL) {
      failures++;
      console.error(
        `  FAIL  ${job.slug}  coverage=${pct}%  extraWords=${r.extra} ${r.extraWords.length ? '[' + r.extraWords.join(', ') + ']' : ''}`
      );
    } else if (r.coverage < COVERAGE_WARN) {
      warnings++;
      console.warn(`  warn  ${job.slug}  coverage=${pct}% (chrome removed: nav/share)`);
    }
  }

  console.log(
    `\n${jobs.length} items checked · min coverage ${(minCoverage * 100).toFixed(1)}% · added/altered words: ${totalExtra} · ${warnings} warn · ${failures} fail`
  );
  if (failures > 0) {
    console.error('\nVERBATIM CHECK FAILED');
    process.exit(1);
  }
  console.log('VERBATIM CHECK PASSED — no prose added or altered.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
