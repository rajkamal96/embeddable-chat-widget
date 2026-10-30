import * as cheerio from 'cheerio';

const DROP = 'script,style,noscript,template,svg,iframe,canvas,form,nav,header,footer,aside,[role=navigation],[role=banner],[role=contentinfo],[aria-hidden=true],.cookie,.cookies,#cookie-banner';

export interface Extracted {
  title: string;
  markdown: string;
}

/** Strips boilerplate and returns the main text as markdown-ish lines with # headings. */
export function extractHtml(html: string, fallbackTitle = ''): Extracted {
  const $ = cheerio.load(html);
  const h1 = $('h1').first().text().trim();
  const title = (h1 || $('title').first().text().trim() || fallbackTitle).replace(/\s+/g, ' ');

  $(DROP).remove();
  const root = $('main').first().length ? $('main').first() : $('article').first().length ? $('article').first() : $('body');

  const lines: string[] = [];
  const walk = (el: cheerio.Cheerio<any>) => {
    el.children().each((_, node) => {
      const $n = $(node);
      const tag = (node as { tagName?: string }).tagName?.toLowerCase() ?? '';
      if (/^h[1-6]$/.test(tag)) {
        const level = Math.min(Number(tag[1]), 3);
        const text = $n.text().replace(/\s+/g, ' ').trim();
        if (text) lines.push('', `${'#'.repeat(level)} ${text}`, '');
      } else if (tag === 'ul' || tag === 'ol') {
        $n.children('li').each((__, li) => {
          const t = $(li).text().replace(/\s+/g, ' ').trim();
          if (t) lines.push(`- ${t}`);
        });
        lines.push('');
      } else if (tag === 'table') {
        $n.find('tr').each((__, tr) => {
          const cells = $(tr)
            .find('th,td')
            .map((___, c) => $(c).text().replace(/\s+/g, ' ').trim())
            .get()
            .filter(Boolean);
          if (cells.length) lines.push(`- ${cells.join(' | ')}`);
        });
        lines.push('');
      } else if (tag === 'p' || tag === 'blockquote' || tag === 'pre' || tag === 'dd' || tag === 'dt' || tag === 'figcaption') {
        const t = $n.text().replace(/\s+/g, ' ').trim();
        if (t) lines.push(t, '');
      } else if ($n.children().length) {
        walk($n);
      } else {
        const t = $n.text().replace(/\s+/g, ' ').trim();
        if (t) lines.push(t, '');
      }
    });
  };
  walk(root);

  const markdown = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title, markdown };
}

/** Pulls <loc> URLs out of a sitemap or sitemap index. */
export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls = $('urlset > url > loc').map((_, e) => $(e).text().trim()).get();
  const sitemaps = $('sitemapindex > sitemap > loc').map((_, e) => $(e).text().trim()).get();
  return { urls, sitemaps };
}
