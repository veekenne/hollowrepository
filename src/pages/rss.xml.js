import rss from '@astrojs/rss';
import { POSTS } from '../lib/content';
import { SITE_TITLE, SITE_DESCRIPTION, withBase } from '../lib/site';

export function GET(context) {
  return rss({
    title: `${SITE_TITLE} — Blog`,
    description: SITE_DESCRIPTION,
    site: context.site,
    items: POSTS.map((p) => ({
      title: p.title,
      pubDate: new Date(p.date),
      description: p.excerpt,
      link: withBase(`/blog/${p.slug}/`),
    })),
  });
}
