import { describe, expect, it } from 'vitest';
import { corsHeaders, isOriginAllowed, normalizeOrigin, originMatches } from '../src/lib/cors';
import { createLimiter } from '../src/lib/rateLimit';
import { ChatRequestSchema, ModelOutputSchema } from '../src/lib/schemas';
import { SiteConfigSchema } from '../src/lib/sites';

describe('origin allow-list', () => {
  const allowed = ['https://www.acme.example', 'https://*.shop.example', 'http://localhost:3000'];
  it('accepts exact matches and ignores paths and trailing slashes', () => {
    expect(isOriginAllowed('https://www.acme.example', allowed)).toBe(true);
    expect(isOriginAllowed('https://www.acme.example/', allowed)).toBe(true);
  });
  it('rejects other hosts, schemes and ports', () => {
    expect(isOriginAllowed('https://evil.example', allowed)).toBe(false);
    expect(isOriginAllowed('http://www.acme.example', allowed)).toBe(false);
    expect(isOriginAllowed('http://localhost:3001', allowed)).toBe(false);
    expect(isOriginAllowed('https://www.acme.example.evil.test', allowed)).toBe(false);
  });
  it('rejects a missing or malformed origin', () => {
    expect(isOriginAllowed(null, allowed)).toBe(false);
    expect(isOriginAllowed('not a url', allowed)).toBe(false);
    expect(isOriginAllowed('null', allowed)).toBe(false);
    expect(isOriginAllowed('file:///x', ['file:///x'])).toBe(false);
  });
  it('wildcards match subdomains only, not the apex or look-alikes', () => {
    expect(originMatches('https://*.shop.example', 'https://a.shop.example')).toBe(true);
    expect(originMatches('https://*.shop.example', 'https://a.b.shop.example')).toBe(true);
    expect(originMatches('https://*.shop.example', 'https://shop.example')).toBe(false);
    expect(originMatches('https://*.shop.example', 'https://evilshop.example')).toBe(false);
    expect(originMatches('https://*.shop.example', 'http://a.shop.example')).toBe(false);
  });
  it('refuses malformed wildcards', () => {
    expect(originMatches('https://*', 'https://a.example')).toBe(false);
    expect(originMatches('*', 'https://a.example')).toBe(false);
  });
  it('same-origin is opt-in', () => {
    expect(isOriginAllowed('https://api.example', [], { requestOrigin: 'https://api.example' })).toBe(false);
    expect(isOriginAllowed('https://api.example', [], { sameOrigin: true, requestOrigin: 'https://api.example' })).toBe(true);
  });
  it('echoes the specific origin, never *', () => {
    expect(corsHeaders('https://www.acme.example')['Access-Control-Allow-Origin']).toBe('https://www.acme.example');
    expect(normalizeOrigin('https://a.example/path?q=1')).toBe('https://a.example');
  });
});

describe('rate limiter', () => {
  const limiter = () => createLimiter({ windowMs: 60_000, maxPerWindow: 3, maxPerDay: 5 });
  it('blocks a visitor after the window is full, then recovers', () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) expect(l.check('a', 1000 + i).ok).toBe(true);
    const blocked = l.check('a', 2000);
    expect(blocked).toMatchObject({ ok: false, reason: 'visitor' });
    expect(l.check('b', 2000).ok).toBe(true);
    expect(l.check('a', 1000 + 61_000).ok).toBe(true);
  });
  it('enforces a global daily cap and resets next day', () => {
    const l = limiter();
    const t0 = Date.parse('2026-01-01T10:00:00Z');
    for (let i = 0; i < 5; i++) expect(l.check(`k${i}`, t0 + i).ok).toBe(true);
    expect(l.check('new', t0 + 10)).toMatchObject({ ok: false, reason: 'daily' });
    expect(l.check('new', t0 + 24 * 3600_000).ok).toBe(true);
  });
  it('reports a positive retry time', () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) l.check('a', 1000);
    const r = l.check('a', 1001);
    expect(r.ok === false && r.retryAfterSec).toBeGreaterThan(0);
  });
});

describe('zod schemas', () => {
  it('validates chat requests', () => {
    expect(ChatRequestSchema.safeParse({ message: 'hi there' }).success).toBe(true);
    expect(ChatRequestSchema.safeParse({ message: ' ' }).success).toBe(false);
    expect(ChatRequestSchema.safeParse({ message: 'x'.repeat(501) }).success).toBe(false);
    expect(ChatRequestSchema.safeParse({ message: 'ok ok', history: [{ role: 'system', text: 'x' }] }).success).toBe(false);
  });
  it('validates model output', () => {
    expect(ModelOutputSchema.safeParse({ answer: 'a', sourceIds: ['x#1'], canAnswer: true }).success).toBe(true);
    expect(ModelOutputSchema.safeParse({ answer: 'a', canAnswer: true }).success).toBe(false);
    expect(ModelOutputSchema.safeParse({ answer: 1, sourceIds: [], canAnswer: true }).success).toBe(false);
    expect(ModelOutputSchema.safeParse({ answer: 'a', sourceIds: [], canAnswer: 'yes' }).success).toBe(false);
  });
  it('validates site config', () => {
    const ok = { id: 'acme', name: 'Acme', themeColor: '#0f766e', welcomeMessage: 'Hi', allowedOrigins: ['https://a.example'] };
    expect(SiteConfigSchema.safeParse(ok).success).toBe(true);
    expect(SiteConfigSchema.safeParse({ ...ok, themeColor: 'red' }).success).toBe(false);
    expect(SiteConfigSchema.safeParse({ ...ok, id: 'Bad Id' }).success).toBe(false);
    expect(SiteConfigSchema.safeParse({ ...ok, allowedOrigins: [] }).success).toBe(false);
  });
});
