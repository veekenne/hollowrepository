# Hollow Reign

A modern, accessible web reader for **Hollow Reign** — *A Queer Space Saga for All*, the
serialized web serial by **Volta Volgate**. Rebuilt from the original [WordPress site](https://hollowreign.wordpress.com/)
as a fast static site that reads like clicking through a book — while preserving every word
of the original writing.

**Live site:** https://veekenne.github.io/hollowrepository/ *(after enabling GitHub Pages — see [Deployment](#deployment-github-pages))*

## Features

- **Distraction-free reader** — comfortable serif typography, light/dark themes, adjustable
  text size, and a reading-progress bar.
- **Reads like a book** — turn pages with the on-screen Prev/Next buttons or the **← / →**
  arrow keys; *Continue reading* remembers where you left off.
- **The whole book** — all 33 Volume One chapters plus the C / D / E♭ interludes, the
  Table of Contents, and the About the Project & Creator pages.
- **Verbatim** — chapter text is preserved exactly; only site chrome (old Prev/Next links,
  share widgets, illustrations) was regenerated. A checker proves no prose changed.
- **Fast, responsive, accessible** — static HTML, near-zero JavaScript, WCAG-AA, fully
  keyboard-operable, and independent of WordPress.

## Tech stack

[Astro](https://astro.build) (static output) · vanilla CSS design tokens · no UI framework.
Interactivity (theme, text size, progress, keyboard nav) is a few small vanilla scripts.

## Local development

Requires **Node.js** 18.20+, 20.3+, or 22+ (this project was built with Node 24).

```bash
npm install      # install dependencies
npm run dev      # dev server  → http://localhost:4321/hollowrepository/
npm run build    # build to ./dist
npm run preview  # preview the production build locally
```

## Project structure

```
src/
  book/            # migrated, verbatim content (HTML bodies)
    chapters/      #   chapter-one … chapter-thirty-three + c, d, e-flat interludes
    pages/         #   about-the-project, about-us (creators)
  data/            # generated manifests (order, titles, datelines, dates)
  layouts/         # BaseLayout, ReaderLayout, PageLayout
  components/      # header, footer, reader nav, theme toggle, icons, Prose
  pages/           # routes (home, [chapter], table-of-contents, volume-two, about pages, 404)
  scripts/         # client: theme.ts, reader.ts
  styles/          # tokens.css (colors/type), global.css
public/images/     # vendored cover + author photo (no WordPress dependency)
migration/raw/     # archived WordPress API responses (provenance)
scripts/           # fetch-content.mjs (migration), verify-verbatim.mjs (fidelity check)
.github/workflows/ # deploy.yml (GitHub Pages)
```

## Content

The text lives in this repo as files — the site no longer depends on WordPress.

| Type        | Body                              | Metadata                |
| ----------- | --------------------------------- | ----------------------- |
| Chapters    | `src/book/chapters/<slug>.html`   | `src/data/chapters.json`|
| Info pages  | `src/book/pages/<slug>.html`      | `src/data/pages.json`   |

Internal links and images inside the stored HTML use a `__BASE__/…` placeholder that
resolves to the configured site base at render time, so the same files work whether the site
is served from a subpath or a domain root.

### Re-running the migration

```bash
npm run migrate          # re-fetch from the WordPress.com public API and rewrite files
npm run verify:verbatim  # assert no prose was added or altered vs. the originals
```

> **Note:** the published content has since been hand-curated (illustrations removed, the
> C / D / E♭ interludes added, some copy edited). Re-running the migration re-fetches the
> original WordPress content and would overwrite those edits — only do it for a fresh import.

### Adding a chapter (e.g. Volume Two)

1. Create `src/book/chapters/<slug>.html` — paragraphs in `<p>`, italics in `<em>`, and
   optional leading `<p class="dateline">…</p>` lines for the in-world date/location.
2. Add an entry to `src/data/chapters.json`:
   ```json
   { "slug": "chapter-thirty-four", "number": 34, "title": "Chapter Thirty-Four", "dateline": "", "volume": 2 }
   ```
3. That's it — the reader route, Prev/Next, and the Table of Contents update automatically,
   and a **Volume Two** section appears once any `volume: 2` chapters exist.

For a lettered interlude (like C / D / E♭), set `"number": null` and `"interlude": true`;
the Table of Contents shows a ♪ instead of a number.

## Deployment (GitHub Pages)

This repo includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds
and deploys on every push to `main`.

**One-time setup:**

1. Push this repository to GitHub.
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose
   **GitHub Actions**.
3. On the next push to `main`, the site publishes to
   `https://veekenne.github.io/hollowrepository/`.

### Using a custom domain (e.g. hollowreign.com)

1. In `astro.config.mjs`, set `site: 'https://hollowreign.com'` and `base: '/'`
   (or pass `SITE_URL` / `BASE_PATH` env vars in CI).
2. Add a file `public/CNAME` containing your domain (e.g. `hollowreign.com`).
3. Configure the domain under **Settings → Pages** and point your DNS at GitHub Pages.

## Accessibility

Semantic landmarks and heading order, a skip-to-content link, visible focus styles, full
keyboard operation (including ← / → page turns), AA color contrast in both themes,
`prefers-color-scheme` and `prefers-reduced-motion` support, and alt text on images.

## Credits & license

Story © Volta Volgate, licensed under
[CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/) — unchanged from the
original. The site's code is free to reuse.
