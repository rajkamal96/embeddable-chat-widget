import { join } from 'node:path';
import { Marked } from 'marked';
import { slugify } from '../../lib/chunker';
import { readMarkdownDir } from '../../lib/ingest';

// The fake business site is rendered from the same markdown the index is built from,
// so every source link the widget returns lands on a real page and heading.
const marked = new Marked({
  renderer: {
    heading(token) {
      return `<h${token.depth} id="${slugify(token.text)}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
    },
  },
});

export interface DemoPage {
  slug: string;
  title: string;
  html: string;
}

export function demoPages(): DemoPage[] {
  const dir = join(process.cwd(), 'data', 'sites', 'acme-dental', 'content');
  return readMarkdownDir(dir).map((p) => ({
    slug: p.href.replace(/^\/demo\/?/, ''),
    title: p.title,
    html: marked.parse(p.markdown, { async: false }) as string,
  }));
}
