// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

/**
 * Hosting configuration.
 *
 * Default targets a GitHub Pages *project* site: https://veekenne.github.io/hollowrepository/
 * If you switch to a custom domain (e.g. https://hollowreign.com) or a <user>.github.io repo,
 * set SITE_URL to that origin and BASE_PATH to '/'. These can be overridden via env vars in CI.
 */
const SITE_URL = process.env.SITE_URL ?? 'https://veekenne.github.io';
const BASE_PATH = process.env.BASE_PATH ?? '/hollowrepository/';

export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap()],
});
