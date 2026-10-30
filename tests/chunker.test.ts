import { describe, expect, it } from 'vitest';
import { chunkPage, MAX_CHUNK_CHARS, pageSlug, parseFrontmatter, slugify } from '../src/lib/chunker';

const page = (markdown: string) => ({ title: 'Services', href: 'https://x.test/services', markdown });

describe('chunkPage', () => {
  it('splits by heading and keeps the heading path and anchor', () => {
    const chunks = chunkPage(page('# Services\n\nIntro paragraph that is long enough.\n\n## Fillings\n\nTooth-coloured fillings take one visit.\n\n### Cost\n\nFrom $150 per tooth, quoted first.'));
    expect(chunks.map((c) => c.heading)).toEqual(['', 'Fillings', 'Fillings > Cost']);
    expect(chunks[1].href).toBe('https://x.test/services#fillings');
    expect(chunks[2].text.startsWith('Services > Fillings > Cost\n')).toBe(true);
  });
  it('gives stable, unique ids and marks only the first chunk as overview', () => {
    const chunks = chunkPage(page('# Services\n\nIntro paragraph that is long enough.\n\n## A\n\nBody of section A is here.\n\n## B\n\nBody of section B is here.'));
    expect(chunks.map((c) => c.id)).toEqual(['services#1', 'services#2', 'services#3']);
    expect(chunks.filter((c) => c.overview)).toHaveLength(1);
    expect(chunks[0].overview).toBe(true);
  });
  it('splits long sections on paragraph boundaries', () => {
    const para = 'Sentence about teeth and care. '.repeat(20).trim();
    const chunks = chunkPage(page(`## Long\n\n${para}\n\n${para}\n\n${para}`));
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS * 1.6);
  });
  it('drops empty or tiny sections', () => {
    expect(chunkPage(page('# Services\n\n## Empty\n\n## Also\n\nok'))).toEqual([]);
  });
});

describe('helpers', () => {
  it('slugify and pageSlug', () => {
    expect(slugify("Children's dentistry")).toBe('children-s-dentistry');
    expect(pageSlug('https://x.test/about/team.html')).toBe('about-team');
    expect(pageSlug('/')).toBe('home');
  });
  it('parses frontmatter', () => {
    const { meta, body } = parseFrontmatter('---\ntitle: "Hello"\nurl: /demo/x\n---\n# Body');
    expect(meta).toEqual({ title: 'Hello', url: '/demo/x' });
    expect(body).toBe('# Body');
  });
});
