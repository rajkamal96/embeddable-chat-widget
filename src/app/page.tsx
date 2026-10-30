import Link from 'next/link';

export default function Home() {
  return (
    <div className="wrap">
      <nav className="nav" aria-label="Main">
        <strong>Embeddable AI chat widget</strong>
        <Link href="/demo">Live demo</Link>
        <Link href="/embed">Install docs</Link>
      </nav>
      <h1>An AI chat widget that answers only from your own content</h1>
      <p>
        A business pastes one <code>&lt;script&gt;</code> tag. Visitors ask questions and get answers taken from that
        business’s own pages, with links to the sources. When the content doesn’t cover a question, the widget says so
        instead of guessing.
      </p>
      <p>
        <Link className="cta" href="/demo">Try it on a fake dental site</Link>
        <Link className="cta" href="/embed">See the install snippet</Link>
      </p>
      <div className="note">
        <strong>This is a portfolio demo.</strong> “Acme Dental” is fictional. The widget runs on a free-tier model, so it
        has rate limits and can be wrong; every answer shows its sources so you can check. It is not a client product.
      </div>
      <h2>What it does</h2>
      <ul>
        <li>Shadow DOM widget (about 4 kB gzipped), no framework needed on the host site, keyboard accessible, works on phones.</li>
        <li>Keyword (BM25) retrieval over an index built from the owner’s pages. No vector database.</li>
        <li>Every answer must cite a retrieved passage; otherwise the widget refuses.</li>
        <li>Per-site origin allow-list, per-visitor rate limit, daily cap and an off switch.</li>
      </ul>
    </div>
  );
}
