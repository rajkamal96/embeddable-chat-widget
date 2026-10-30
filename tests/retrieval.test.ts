import { describe, expect, it } from 'vitest';
import { SITES } from '../src/generated/sites';
import {
  buildIndex, diversify, isBroadQuestion, retrieveContext, search, sourcesOf, tokenize, uniquePages, withOverviews,
} from '../src/lib/retrieve';
import type { Chunk } from '../src/lib/types';

const index = buildIndex(SITES['acme-dental'].index.chunks);
const pages = (q: string) => uniquePages(search(index, q, 8).map((h) => h.chunk));
const topPage = (q: string) => pages(q)[0];

describe('tokenize', () => {
  it('drops stopwords and strips plurals', () => {
    expect(tokenize('How much are the cleanings for kids?')).toEqual(['much', 'cleaning', 'kid']);
  });
  it('keeps words ending in ss', () => {
    expect(tokenize('business')).toEqual(['business']);
  });
});

describe('search (BM25 over the Acme Dental sample)', () => {
  it('finds the right page for specific questions', () => {
    // BM25 is not always right at rank 1 (the services page outranks pricing for "how much is whitening"),
    // so these two check the top 3 pages, which is what the model actually receives.
    expect(pages('How much is teeth whitening?').slice(0, 3)).toContain('/demo/pricing');
    expect(pages('Are you open on Saturday?').slice(0, 3)).toContain('/demo/hours-location');
    expect(topPage('Which insurance plans are accepted?')).toBe('/demo/insurance-payment');
    expect(topPage('What is the late cancellation fee?')).toBe('/demo/new-patients');
  });
  it('returns nothing when no term overlaps', () => {
    expect(search(index, 'what is the weather in Paris')).toEqual([]);
    expect(search(index, 'veneers')).toEqual([]);
    expect(retrieveContext(index, 'Do you offer veneers?')).toEqual([]); // "offer" is a stopword
  });
  it('returns nothing for a query made only of stopwords', () => {
    expect(search(index, 'what do you')).toEqual([]);
  });
  it('is deterministic', () => {
    expect(search(index, 'implant cost').map((h) => h.chunk.id)).toEqual(search(index, 'implant cost').map((h) => h.chunk.id));
  });
});

const mk = (id: string, href: string, overview = false): Chunk => ({ id, title: href, heading: '', href, text: 'x', overview });

describe('diversify and overviews', () => {
  it('caps chunks per page', () => {
    const scored = [mk('a1', '/a#1'), mk('a2', '/a#2'), mk('a3', '/a#3'), mk('b1', '/b'), mk('c1', '/c')].map((chunk, i) => ({ chunk, score: 9 - i }));
    expect(diversify(scored, 2, 8).map((c) => c.id)).toEqual(['a1', 'a2', 'b1', 'c1']);
  });
  it('adds overview chunks of other pages for broad questions', () => {
    const all = [mk('a1', '/a', true), mk('b1', '/b', true), mk('b2', '/b'), mk('c1', '/c', true)];
    expect(withOverviews(all, [all[0]], 6).map((c) => c.id)).toEqual(['a1', 'b1', 'c1']);
    expect(withOverviews(all, [all[0]], 2).map((c) => c.id)).toEqual(['a1', 'b1']);
  });
  it('"What do you offer?" still gets page overviews even though every word is a stopword', () => {
    const ctx = retrieveContext(index, 'What do you offer?');
    expect(new Set(ctx.map((c) => c.href.split('#')[0])).size).toBeGreaterThanOrEqual(5);
    expect(ctx.every((c) => c.overview)).toBe(true);
  });
  it('detects broad questions', () => {
    expect(isBroadQuestion('What do you offer?')).toBe(true);
    expect(isBroadQuestion('Give me an overview of your services')).toBe(true);
    expect(isBroadQuestion('How much is a filling?')).toBe(false);
  });
});

describe('sourcesOf', () => {
  it('dedupes by link and labels with heading', () => {
    const c: Chunk[] = [
      { id: '1', title: 'Pricing', heading: 'Price list', href: '/p#price-list', text: '' },
      { id: '2', title: 'Pricing', heading: 'Price list', href: '/p#price-list', text: '' },
    ];
    expect(sourcesOf(c)).toEqual([{ title: 'Pricing – Price list', href: '/p#price-list' }]);
  });
});
