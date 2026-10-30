import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { PageInput } from '../src/lib/chunker';
import { extractHtml, parseSitemap } from '../src/lib/extract';
import { buildSiteIndex, readMarkdownDir } from '../src/lib/ingest';
import { isAllowed, parseRobots, type RobotsRules } from '../src/lib/robots';
import { registerSites } from './register';

const USAGE = `Build the knowledge index for one site.

  npm run ingest -- --site <id> --dir <folder-of-markdown>
  npm run ingest -- --site <id> --sitemap <https://example.com/sitemap.xml>
  npm run ingest -- --site <id> --urls <urls.txt | url1,url2,...>
  npm run ingest -- --register          (only regenerate src/generated/sites.ts)

Options: --max-pages 50   --delay-ms 500

Only pages you point it at are fetched. robots.txt is respected. Sitemap mode stays on the
sitemap's own host. The site config (data/sites/<id>/site.json) must be written by hand.`;

const UA = 'ChatWidgetIngest/0.1 (+owner-initiated index build)';

async function main() {
  const { values } = parseArgs({
    options: {
      site: { type: 'string' },
      dir: { type: 'string' },
      sitemap: { type: 'string' },
      urls: { type: 'string' },
      'max-pages': { type: 'string', default: '50' },
      'delay-ms': { type: 'string', default: '500' },
      register: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) return void console.log(USAGE);
  if (values.register && !values.site) {
    console.log('Registered sites:', registerSites().join(', ') || '(none)');
    return;
  }
  if (!values.site || [values.dir, values.sitemap, values.urls].filter(Boolean).length !== 1) {
    console.error(USAGE);
    process.exit(1);
  }

  const site = values.site;
  const siteDir = join(process.cwd(), 'data', 'sites', site);
  if (!existsSync(join(siteDir, 'site.json'))) {
    console.error(`Missing ${join('data', 'sites', site, 'site.json')}. Create it first (see README, "Add a new business").`);
    process.exit(1);
  }

  const maxPages = Math.max(1, Number(values['max-pages']));
  const delayMs = Math.max(0, Number(values['delay-ms']));
  const skipped: string[] = [];
  let pages: PageInput[] = [];

  if (values.dir) {
    pages = readMarkdownDir(values.dir);
  } else {
    const robots = new Map<string, RobotsRules>();
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const rulesFor = async (origin: string): Promise<RobotsRules> => {
      const cached = robots.get(origin);
      if (cached) return cached;
      let rules: RobotsRules = { allow: [], disallow: [] };
      try {
        const res = await fetch(`${origin}/robots.txt`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(10_000) });
        if (res.ok) rules = parseRobots(await res.text(), 'ChatWidgetIngest');
      } catch {
        /* no robots.txt reachable: nothing is disallowed */
      }
      robots.set(origin, rules);
      return rules;
    };

    const skip = (url: string, reason: string): null => {
      skipped.push(`${url} (${reason})`);
      return null;
    };

    const get = async (url: string): Promise<{ text: string; type: string } | null> => {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return skip(url, 'not http/https');
      if (!isAllowed(await rulesFor(u.origin), u.pathname + u.search)) return skip(url, 'disallowed by robots.txt');
      try {
        const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xml' }, signal: AbortSignal.timeout(15_000) });
        if (!res.ok) return skip(url, `HTTP ${res.status}`);
        const text = await res.text();
        if (text.length > 2_000_000) return skip(url, 'over 2 MB');
        return { text, type: res.headers.get('content-type') ?? '' };
      } catch (e) {
        return skip(url, e instanceof Error ? e.message : 'fetch failed');
      }
    };

    let urls: string[] = [];
    if (values.sitemap) {
      const root = new URL(values.sitemap);
      const first = await get(values.sitemap);
      if (!first) throw new Error('Could not fetch the sitemap.');
      const parsed = parseSitemap(first.text);
      urls = parsed.urls;
      for (const sm of parsed.sitemaps.slice(0, 5)) {
        const nested = await get(sm);
        if (nested) urls.push(...parseSitemap(nested.text).urls);
      }
      // Stay on the sitemap's host: the owner pointed us at this site, not at its links.
      urls = urls.filter((u) => {
        try {
          return new URL(u).host === root.host;
        } catch {
          return false;
        }
      });
    } else if (values.urls) {
      const raw = existsSync(values.urls) ? readFileSync(values.urls, 'utf8') : values.urls;
      urls = raw.split(/[\s,]+/).filter(Boolean);
    }
    urls = [...new Set(urls.map((u) => u.split('#')[0]))].slice(0, maxPages);
    console.log(`Fetching ${urls.length} page(s)…`);

    for (const url of urls) {
      const got = await get(url);
      if (got) {
        if (!/html/i.test(got.type)) skipped.push(`${url} (not HTML: ${got.type || 'unknown'})`);
        else {
          const { title, markdown } = extractHtml(got.text, new URL(url).pathname);
          if (markdown.length < 40) skipped.push(`${url} (no readable text; maybe built with JavaScript)`);
          else pages.push({ title, href: url, markdown });
        }
      }
      await sleep(delayMs);
    }
  }

  if (!pages.length) {
    console.error('No pages could be read. Nothing was written.');
    if (skipped.length) console.error(skipped.map((s) => `  - ${s}`).join('\n'));
    process.exit(1);
  }

  const index = buildSiteIndex(site, pages);
  writeFileSync(join(siteDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  const ready = registerSites();

  console.log(`Wrote data/sites/${site}/index.json: ${index.pages.length} page(s), ${index.chunks.length} chunk(s).`);
  if (skipped.length) console.log(`Skipped ${skipped.length}:\n${skipped.map((s) => `  - ${s}`).join('\n')}`);
  console.log(`Registered sites: ${ready.join(', ')}`);
}

main().catch((e) => {
  console.error('Ingest failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
