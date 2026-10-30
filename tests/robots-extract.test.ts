import { describe, expect, it } from 'vitest';
import { extractHtml, parseSitemap } from '../src/lib/extract';
import { isAllowed, parseRobots } from '../src/lib/robots';

describe('robots.txt', () => {
  const txt = `
User-agent: *
Disallow: /private/
Allow: /private/public.html
Disallow: /*.pdf$

User-agent: ChatWidgetIngest
Disallow: /blocked
`;
  it('uses the group for our agent when present, else *', () => {
    const ours = parseRobots(txt, 'ChatWidgetIngest');
    expect(isAllowed(ours, '/blocked/page')).toBe(false);
    expect(isAllowed(ours, '/private/x')).toBe(true); // only our own group applies
    const other = parseRobots(txt, 'SomeoneElse');
    expect(isAllowed(other, '/private/x')).toBe(false);
  });
  it('longest matching rule wins, with wildcards and $', () => {
    const r = parseRobots(txt, 'SomeoneElse');
    expect(isAllowed(r, '/private/public.html')).toBe(true);
    expect(isAllowed(r, '/files/a.pdf')).toBe(false);
    expect(isAllowed(r, '/files/a.pdf.html')).toBe(true);
    expect(isAllowed(r, '/about')).toBe(true);
  });
  it('allows everything when there are no rules', () => {
    expect(isAllowed(parseRobots('', 'x'), '/anything')).toBe(true);
  });
});

describe('extractHtml', () => {
  const html = `<html><head><title>Site | Pricing</title></head><body>
    <header><nav><a href="/">Home</a></nav></header>
    <div class="cookie">We use cookies</div>
    <main><h1>Pricing</h1><p>Intro text here.</p>
      <h2>Price list</h2><ul><li>Cleaning: $120</li><li>Check-up: $95</li></ul>
      <table><tr><th>Item</th><th>Cost</th></tr><tr><td>Filling</td><td>$150</td></tr></table>
      <script>alert(1)</script></main>
    <footer>Copyright</footer></body></html>`;
  it('keeps main content as headings, lists and tables and drops boilerplate', () => {
    const { title, markdown } = extractHtml(html);
    expect(title).toBe('Pricing');
    expect(markdown).toContain('## Price list');
    expect(markdown).toContain('- Cleaning: $120');
    expect(markdown).toContain('- Filling | $150');
    for (const junk of ['Home', 'cookies', 'Copyright', 'alert']) expect(markdown).not.toContain(junk);
  });
  it('parses sitemaps and sitemap indexes', () => {
    const xml = '<urlset><url><loc>https://x.test/a</loc></url><url><loc>https://x.test/b</loc></url></urlset>';
    expect(parseSitemap(xml).urls).toEqual(['https://x.test/a', 'https://x.test/b']);
    const idx = '<sitemapindex><sitemap><loc>https://x.test/s1.xml</loc></sitemap></sitemapindex>';
    expect(parseSitemap(idx)).toEqual({ urls: [], sitemaps: ['https://x.test/s1.xml'] });
  });
});
