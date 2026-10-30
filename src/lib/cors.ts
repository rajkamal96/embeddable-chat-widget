// Origin allow-list. This keeps casual copy-paste of the endpoint off other websites'
// pages. It is NOT authentication: the Origin header can be set by any non-browser client.

export function normalizeOrigin(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Pattern is an exact origin, or "https://*.example.com" for any subdomain (not the apex). */
export function originMatches(pattern: string, origin: string): boolean {
  const o = normalizeOrigin(origin);
  if (!o) return false;
  if (!pattern.includes('*')) return normalizeOrigin(pattern) === o;

  const m = /^(https?):\/\/\*\.([a-z0-9.-]+)(:\d+)?$/i.exec(pattern.trim());
  if (!m) return false; // refuse malformed wildcards instead of guessing
  const [, scheme, suffix, port = ''] = m;
  const ou = new URL(o);
  if (ou.protocol !== `${scheme.toLowerCase()}:`) return false;
  if ((ou.port ? `:${ou.port}` : '') !== port) return false;
  const host = ou.hostname.toLowerCase();
  const s = suffix.toLowerCase();
  return host.endsWith(`.${s}`) && host.length > s.length + 1;
}

export function isOriginAllowed(
  origin: string | null,
  allowed: string[],
  opts: { sameOrigin?: boolean; requestOrigin?: string } = {},
): boolean {
  if (!origin) return false; // browsers always send Origin on cross-origin POST
  const o = normalizeOrigin(origin);
  if (!o) return false;
  if (opts.sameOrigin && opts.requestOrigin && normalizeOrigin(opts.requestOrigin) === o) return true;
  return allowed.some((p) => originMatches(p, o));
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}
