import type { Chunk } from './types';

export interface PageInput {
  title: string;
  /** Page URL or path. */
  href: string;
  /** Markdown-ish text with # headings (what the HTML extractor and .md files both produce). */
  markdown: string;
}

export const MAX_CHUNK_CHARS = 900;

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A short, stable id fragment for a page, from its URL path. */
export function pageSlug(href: string): string {
  let path = href;
  try {
    path = new URL(href, 'http://x').pathname;
  } catch {
    /* keep raw */
  }
  return slugify(path.replace(/\.(html?|md)$/i, '')) || 'home';
}

interface Section {
  headings: string[];
  anchor: string;
  body: string[];
}

/**
 * Splits a page into small, citable chunks: one per heading section, and long sections are
 * split on paragraph boundaries. Each chunk keeps its heading path so it is self-explanatory.
 */
export function chunkPage(page: PageInput): Chunk[] {
  const lines = page.markdown.replace(/\r\n/g, '\n').split('\n');
  const sections: Section[] = [{ headings: [], anchor: '', body: [] }];
  const stack: { level: number; text: string }[] = [];

  for (const line of lines) {
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      const level = m[1].length;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, text: m[2].trim() });
      sections.push({ headings: stack.map((s) => s.text), anchor: slugify(m[2]), body: [] });
    } else {
      sections[sections.length - 1].body.push(line);
    }
  }

  const base = pageSlug(page.href);
  const pageHref = page.href.split('#')[0];
  const out: Chunk[] = [];
  const add = (sec: Section, text: string) => {
    const cleaned = text.trim();
    if (cleaned.length < 20) return;
    const heading = sec.headings.filter((h) => h !== page.title).join(' > ');
    out.push({
      id: `${base}#${out.length + 1}`,
      title: page.title,
      heading,
      href: sec.anchor ? `${pageHref}#${sec.anchor}` : pageHref,
      text: `${page.title}${heading ? ` > ${heading}` : ''}\n${cleaned}`,
      ...(out.length === 0 ? { overview: true } : {}),
    });
  };

  for (const sec of sections) {
    const paras = sec.body.join('\n').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    let buf = '';
    for (const p of paras) {
      if (buf && buf.length + p.length + 2 > MAX_CHUNK_CHARS) {
        add(sec, buf);
        buf = '';
      }
      buf = buf ? `${buf}\n\n${p}` : p;
      // A single huge paragraph is cut on sentence boundaries.
      while (buf.length > MAX_CHUNK_CHARS * 1.5) {
        const cut = buf.lastIndexOf('. ', MAX_CHUNK_CHARS);
        const at = cut > 200 ? cut + 1 : MAX_CHUNK_CHARS;
        add(sec, buf.slice(0, at));
        buf = buf.slice(at).trim();
      }
    }
    if (buf) add(sec, buf);
  }
  return out;
}

export function parseFrontmatter(src: string): { meta: Record<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src.replace(/\r\n/g, '\n'));
  if (!m) return { meta: {}, body: src };
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return { meta, body: src.replace(/\r\n/g, '\n').slice(m[0].length) };
}
