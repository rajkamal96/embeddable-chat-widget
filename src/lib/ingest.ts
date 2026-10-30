import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { chunkPage, parseFrontmatter, type PageInput } from './chunker';
import type { SiteIndex } from './types';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Reads a folder of .md files. Frontmatter may set `title` and `url`; otherwise they are derived. */
export function readMarkdownDir(dir: string): PageInput[] {
  return walk(dir)
    .filter((f) => f.toLowerCase().endsWith('.md'))
    .sort()
    .map((file) => {
      const { meta, body } = parseFrontmatter(readFileSync(file, 'utf8'));
      const rel = relative(dir, file).replace(/\\/g, '/').replace(/\.md$/i, '');
      const firstHeading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
      return {
        title: meta.title || firstHeading || rel,
        href: meta.url || `/${rel === 'index' ? '' : rel}`,
        markdown: body,
      };
    });
}

export function buildSiteIndex(site: string, pages: PageInput[], now = new Date()): SiteIndex {
  const usable = pages.filter((p) => p.markdown.trim().length > 0);
  const chunks = usable.flatMap(chunkPage);
  return {
    site,
    generatedAt: now.toISOString(),
    pages: usable.map((p) => ({ title: p.title, href: p.href })),
    chunks,
  };
}
