import type { Chunk, Scored, Source } from './types';

// Plain BM25 over in-memory chunks: no vector database, no embedding calls, no cost,
// deterministic and easy to test. The trade-off (no paraphrase matching) is in the README.

const STOPWORDS = new Set(
  (
    'a an and are as at be but by can could did do does for from get got has have how i if in into is it its of on or ' +
    'that the their them there these they this to was were what when where which who why will with would you your ' +
    'me my we our us about any please tell know want need like also just offer offers provide provides'
  ).split(' '),
);

/** Lowercase, split on non-alphanumerics, drop stopwords, strip a trailing plural "s". */
export function tokenize(text: string): string[] {
  const raw = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const out: string[] = [];
  for (const t of raw) {
    if (STOPWORDS.has(t)) continue;
    out.push(t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);
  }
  return out;
}

export interface Index {
  chunks: Chunk[];
  tf: Map<string, number>[];
  len: number[];
  df: Map<string, number>;
  avgLen: number;
}

export function buildIndex(chunks: Chunk[]): Index {
  const tf: Map<string, number>[] = [];
  const len: number[] = [];
  const df = new Map<string, number>();
  for (const c of chunks) {
    const tokens = tokenize(`${c.title} ${c.heading} ${c.heading} ${c.text}`); // heading counts double
    const counts = new Map<string, number>();
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const t of counts.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    tf.push(counts);
    len.push(tokens.length);
  }
  const avgLen = len.length ? len.reduce((a, b) => a + b, 0) / len.length : 0;
  return { chunks, tf, len, df, avgLen };
}

const K1 = 1.5;
const B = 0.75;

// Keyword search cannot know that "how much" means "price". A tiny, generic expansion for the one
// intent nearly every business site is asked about; anything beyond this is where embeddings help.
const PRICE_INTENT = /\bhow much\b|\b(cost|costs|price|prices|pricing|fee|fees|charge|charges|expensive|cheap|afford\w*)\b/i;

export function queryTerms(query: string): string[] {
  const terms = tokenize(query);
  if (PRICE_INTENT.test(query)) terms.push('price', 'cost');
  return [...new Set(terms)];
}

/** Returns chunks that share at least one (non-stopword) term with the query, best first. */
export function search(index: Index, query: string, topK = 5): Scored[] {
  const terms = queryTerms(query);
  const n = index.chunks.length;
  if (!terms.length || !n) return [];

  const scored: Scored[] = [];
  for (let i = 0; i < n; i++) {
    let score = 0;
    for (const term of terms) {
      const f = index.tf[i].get(term);
      if (!f) continue;
      const df = index.df.get(term) ?? 0;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      score += (idf * (f * (K1 + 1))) / (f + K1 * (1 - B + (B * index.len[i]) / (index.avgLen || 1)));
    }
    if (score > 0) scored.push({ chunk: index.chunks[i], score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

const pageOf = (href: string) => href.split('#')[0];

/** One entry per chunk, in rank order, de-duplicated by link. */
export function sourcesOf(chunks: Chunk[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const c of chunks) {
    if (seen.has(c.href)) continue;
    seen.add(c.href);
    out.push({ title: c.heading && c.heading !== c.title ? `${c.title} – ${c.heading}` : c.title, href: c.href });
  }
  return out;
}

/** Ranked unique pages (used by the eval, which scores at page level). */
export function uniquePages(chunks: Chunk[]): string[] {
  return [...new Set(chunks.map((c) => pageOf(c.href)))];
}

/**
 * Keeps at most `perPage` chunks from each page, in rank order, up to `limit` chunks.
 * Without this one strong page fills every slot and a broad question is answered from one page.
 */
export function diversify(scored: Scored[], perPage = 2, limit = 8): Chunk[] {
  const used = new Map<string, number>();
  const out: Chunk[] = [];
  for (const { chunk } of scored) {
    const page = pageOf(chunk.href);
    const n = used.get(page) ?? 0;
    if (n >= perPage) continue;
    used.set(page, n + 1);
    out.push(chunk);
    if (out.length >= limit) break;
  }
  return out;
}

const BROAD =
  /\b(kinds?|types?|sorts?|overview|summar\w*|everything|all (?:your|the)|what (?:do|can|does) you (?:do|offer|provide|have)|what services|services (?:do )?you|options|range of|about (?:you|the)|tell me about)\b/i;

/** True for questions about the business in general rather than one specific thing. */
export function isBroadQuestion(message: string): boolean {
  return BROAD.test(message);
}

/**
 * Keyword search only finds pages that share words with the question, so a broad question
 * matches one or two pages. Adds the overview chunk of the other pages (up to `maxPages`
 * pages in total) so the answer can draw on the whole site.
 */
export function withOverviews(all: Chunk[], hits: Chunk[], maxPages = 6): Chunk[] {
  const out = [...hits];
  const pages = new Set(hits.map((c) => pageOf(c.href)));
  for (const c of all) {
    if (pages.size >= maxPages) break;
    if (!c.overview || pages.has(pageOf(c.href))) continue;
    pages.add(pageOf(c.href));
    out.push(c);
  }
  return out;
}

/** "What do you offer?" has no content words once generic verbs are stopwords, so it needs its own rule. */
const OVERVIEW = /\b(what (?:do|can|does) you (?:do|offer|provide|have)|what services|services (?:do )?you|overview|summar\w*|everything)\b/i;
export const isOverviewRequest = (message: string) => OVERVIEW.test(message);

/**
 * The context the model is allowed to see for one question: a wider pool ranked by BM25, capped per
 * page, plus page overviews for broad questions. Empty means "refuse without a model call".
 */
export function retrieveContext(index: Index, query: string, message = query): Chunk[] {
  let hits = diversify(search(index, query, 24), 2, 8);
  if (hits.length > 0 && isBroadQuestion(message)) hits = withOverviews(index.chunks, hits);
  else if (hits.length === 0 && isOverviewRequest(message)) hits = withOverviews(index.chunks, [], 6);
  return hits;
}
