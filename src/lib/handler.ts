import { corsHeaders, isOriginAllowed, normalizeOrigin } from './cors';
import { generateJson as defaultGenerate, LlmError, type GenerateJson } from './llm';
import { notCoveredMessage, systemPrompt } from './prompts';
import { defaultLimiter, type Limiter } from './rateLimit';
import { buildIndex, retrieveContext, sourcesOf, type Index } from './retrieve';
import { ChatRequestSchema, MODEL_OUTPUT_JSON_SCHEMA, ModelOutputSchema } from './schemas';
import { publicConfig, type Site, type SiteRegistry } from './sites';
import type { Chunk, Source } from './types';

export interface Deps {
  sites: SiteRegistry;
  limiter: Limiter;
  generate: GenerateJson;
  /** Defaults to process.env.CHAT_ENABLED !== 'false'. Injectable for tests. */
  isEnabled?: () => boolean;
}

/** Resolve a stored link (relative or absolute) into a public http(s) URL, server-side. */
export function resolveHref(href: string, site: Site['config'], requestOrigin: string): string | null {
  try {
    const u = new URL(href, site.baseUrl || requestOrigin);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

const indexCache = new WeakMap<Site, Index>();
function indexFor(site: Site): Index {
  let idx = indexCache.get(site);
  if (!idx) {
    idx = buildIndex(site.index.chunks);
    indexCache.set(site, idx);
  }
  return idx;
}

function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip')?.trim() || 'unknown'
  );
}

export function createHandlers(overrides: Partial<Deps> & { sites: SiteRegistry }) {
  const deps: Deps = {
    limiter: overrides.limiter ?? defaultLimiter(),
    generate: overrides.generate ?? defaultGenerate,
    isEnabled: overrides.isEnabled ?? (() => process.env.CHAT_ENABLED !== 'false'),
    sites: overrides.sites,
  };

  function json(body: unknown, status: number, origin: string | null, extra: HeadersInit = {}) {
    const headers = new Headers(extra);
    if (origin) for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v);
    headers.set('Cache-Control', 'no-store');
    return Response.json(body, { status, headers });
  }
  const fail = (status: number, error: string, message: string, origin: string | null, extra?: HeadersInit) =>
    json({ ok: false, error, message }, status, origin, extra);

  /** Shared gate: finds the site and checks the browser origin against its allow-list. */
  function gate(req: Request): { site: Site; origin: string; requestOrigin: string } | Response {
    const url = new URL(req.url);
    const site = deps.sites[url.searchParams.get('site') ?? ''];
    if (!site) return fail(404, 'unknown_site', 'Unknown site.', null);
    const requestOrigin = url.origin;
    // Browsers omit Origin on same-origin GET requests (the demo page loading its own config).
    // That is only accepted for sites that opted into allowSameOrigin, and only when the browser says same-origin.
    const origin =
      req.headers.get('origin') ??
      (site.config.allowSameOrigin && req.headers.get('sec-fetch-site') === 'same-origin' ? requestOrigin : null);
    const allowed = isOriginAllowed(origin, site.config.allowedOrigins, {
      sameOrigin: site.config.allowSameOrigin,
      requestOrigin,
    });
    if (!allowed || !origin) return fail(403, 'origin_not_allowed', 'This website is not allowed to use the chat.', null);
    return { site, origin: normalizeOrigin(origin) as string, requestOrigin };
  }

  async function chat(req: Request): Promise<Response> {
    const g = gate(req);
    if (g instanceof Response) return g;
    const { site, origin, requestOrigin } = g;
    const { config } = site;

    if (!deps.isEnabled?.()) return fail(503, 'disabled', 'The assistant is switched off right now.', origin);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail(400, 'bad_request', 'Invalid request.', origin);
    }
    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(400, 'bad_request', parsed.error.issues[0]?.message ?? 'Invalid request.', origin);
    }
    const { message } = parsed.data;
    const pastUser = (parsed.data.history ?? []).filter((t) => t.role === 'user').slice(-3).map((t) => t.text);

    const limit = deps.limiter.check(`${config.id}:${clientIp(req)}`);
    if (!limit.ok) {
      const msg =
        limit.reason === 'daily'
          ? 'The demo has reached its free daily limit. Please try again tomorrow.'
          : 'You are sending messages quickly. Please wait a few minutes and try again.';
      return fail(429, 'rate_limited', msg, origin, { 'Retry-After': String(limit.retryAfterSec) });
    }

    const notCovered = () =>
      json({ ok: true, canAnswer: false, answer: notCoveredMessage(config), sources: [] }, 200, origin);

    try {
      const index = indexFor(site);
      // Follow-ups often lean on the previous question ("what about Saturdays?").
      const query = [...pastUser.slice(-1), message].join(' ');
      const hits = retrieveContext(index, query, message);

      // Zero keyword overlap: refuse without spending a model call.
      if (hits.length === 0) return notCovered();

      const byId = new Map<string, Chunk>(hits.map((c) => [c.id, c]));
      const raw = await deps.generate({
        system: systemPrompt(config, hits),
        turns: [...pastUser.map((text) => ({ role: 'user' as const, text })), { role: 'user', text: message }],
        schema: MODEL_OUTPUT_JSON_SCHEMA,
        maxOutputTokens: 400,
      });
      const out = ModelOutputSchema.parse(raw);

      // Citation gating: drop any id that was not retrieved. No valid citation, no answer.
      const cited = [...new Set(out.sourceIds)].flatMap((id) => byId.get(id) ?? []);
      if (!out.canAnswer || cited.length === 0) return notCovered();

      const sources: Source[] = [];
      for (const s of sourcesOf(cited)) {
        const href = resolveHref(s.href, config, requestOrigin);
        if (href) sources.push({ title: s.title, href });
      }
      if (sources.length === 0) return notCovered();
      return json({ ok: true, canAnswer: true, answer: out.answer, sources }, 200, origin);
    } catch (err) {
      if (err instanceof LlmError) {
        if (err.code === 'not_configured') return fail(503, 'unavailable', 'The assistant is not set up yet.', origin);
        if (err.code === 'rate_limited') {
          return fail(429, 'rate_limited', 'The free model quota is used up for now. Please try again later.', origin);
        }
        if (err.code === 'bad_output') {
          return fail(502, 'bad_output', 'I could not produce a reliable answer. Please rephrase and try again.', origin);
        }
        return fail(503, 'unavailable', 'The assistant is temporarily unavailable. Please try again shortly.', origin);
      }
      if (err instanceof Error && err.name === 'ZodError') {
        return fail(502, 'bad_output', 'I could not produce a reliable answer. Please rephrase and try again.', origin);
      }
      console.error('Chat error:', err instanceof Error ? err.message : err);
      return fail(500, 'server_error', 'Something went wrong. Please try again.', origin);
    }
  }

  function config(req: Request): Response {
    const g = gate(req);
    if (g instanceof Response) return g;
    return json({ ok: true, enabled: deps.isEnabled?.() ?? true, config: publicConfig(g.site.config) }, 200, g.origin);
  }

  /** CORS preflight: answered only for allowed origins, so other sites get no CORS headers. */
  function options(req: Request): Response {
    const g = gate(req);
    if (g instanceof Response) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(g.origin) });
  }

  return { chat, config, options };
}
