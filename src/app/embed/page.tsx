import Link from 'next/link';

export const metadata = { title: 'Install docs · Embeddable AI chat widget (demo)' };

const SNIPPET = `<script src="https://YOUR-HOST/widget.js" data-site="acme-dental" async></script>`;

const SITE_JSON = `{
  "id": "acme-dental",
  "name": "Acme Dental",
  "assistantName": "Acme Assistant",
  "themeColor": "#0f766e",
  "welcomeMessage": "Hi! Ask me about Acme Dental.",
  "suggestedQuestions": ["How much is teeth whitening?", "Are you open on Saturdays?"],
  "allowedOrigins": ["https://www.acmedental.example", "https://*.acmedental.example"],
  "allowSameOrigin": false,
  "baseUrl": "https://www.acmedental.example",
  "contactHint": "calling the front desk on (555) 010-0142",
  "demo": false
}`;

const CURL = `curl -s -X POST "https://YOUR-HOST/api/chat?site=acme-dental" \\
  -H "origin: https://www.acmedental.example" \\
  -H "content-type: application/json" \\
  -d '{"message":"How much is teeth whitening?"}'`;

export default function Embed() {
  return (
    <div className="wrap">
      <nav className="nav" aria-label="Main">
        <strong><Link href="/">Embeddable AI chat widget</Link></strong>
        <Link href="/demo">Live demo</Link>
      </nav>
      <h1>Install</h1>
      <p>Paste this once, just before <code>&lt;/body&gt;</code> on every page that should show the chat button:</p>
      <pre><code>{SNIPPET}</code></pre>
      <p>
        That is the whole install. It works on plain HTML, WordPress, Shopify, Wix or any framework, because the script is
        self-contained and draws inside a Shadow DOM: your site’s CSS cannot break it, and it will not change your page’s styles.
      </p>

      <h2>Script attributes</h2>
      <table>
        <thead><tr><th>Attribute</th><th>Required</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td><code>data-site</code></td><td>yes</td><td>The site id from the owner’s config (below).</td></tr>
          <tr><td><code>data-position</code></td><td>no</td><td><code>right</code> (default) or <code>left</code>.</td></tr>
          <tr><td><code>data-api</code></td><td>no</td><td>API origin. Defaults to the host that served <code>widget.js</code>.</td></tr>
        </tbody>
      </table>

      <h2>Site configuration</h2>
      <p>
        Each business has a file <code>data/sites/&lt;id&gt;/site.json</code>. Appearance and behaviour are set there, not in the
        script tag, so they can be changed without asking the customer to edit their site.
      </p>
      <pre><code>{SITE_JSON}</code></pre>
      <table>
        <thead><tr><th>Field</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td><code>id</code></td><td>Lowercase letters, digits and dashes. Matches <code>data-site</code>.</td></tr>
          <tr><td><code>name</code>, <code>assistantName</code></td><td>Shown in the panel header and used in the model prompt.</td></tr>
          <tr><td><code>themeColor</code></td><td>6-digit hex. Text colour is chosen automatically for contrast.</td></tr>
          <tr><td><code>welcomeMessage</code></td><td>First message in the panel.</td></tr>
          <tr><td><code>suggestedQuestions</code></td><td>Up to 4 buttons shown before the visitor’s first question.</td></tr>
          <tr><td><code>allowedOrigins</code></td><td>Websites allowed to call the API from a browser. <code>https://*.example.com</code> matches subdomains but not the bare domain.</td></tr>
          <tr><td><code>allowSameOrigin</code></td><td>Also accept calls from the API’s own host. Used by this demo site; leave <code>false</code> otherwise.</td></tr>
          <tr><td><code>baseUrl</code></td><td>Used to turn relative source paths into full links. Empty means the API’s own origin.</td></tr>
          <tr><td><code>contactHint</code></td><td>Where visitors are sent when the content does not cover a question.</td></tr>
          <tr><td><code>demo</code></td><td>Shows a “demo” label in the widget.</td></tr>
        </tbody>
      </table>

      <h2>Adding the knowledge</h2>
      <p>The widget answers from an index file built from pages the owner points the ingestion script at:</p>
      <pre><code>{`npm run ingest -- --site acme-dental --sitemap https://www.acmedental.example/sitemap.xml
npm run ingest -- --site acme-dental --urls urls.txt
npm run ingest -- --site acme-dental --dir ./content`}</code></pre>
      <p>
        The index is a snapshot: re-run the script after the website changes. Pages that render their text only with
        JavaScript, PDFs and images are not read.
      </p>

      <h2>API</h2>
      <p><code>POST /api/chat?site=&lt;id&gt;</code> with <code>{'{"message": "...", "history": [...]}'}</code> returns:</p>
      <pre><code>{`{ "ok": true, "canAnswer": true, "answer": "…", "sources": [{ "title": "Pricing – Price list", "href": "https://…/pricing#price-list" }] }`}</code></pre>
      <p>When the content does not cover the question: <code>canAnswer: false</code>, a short “not covered” answer and no sources.</p>
      <pre><code>{CURL}</code></pre>

      <div className="note">
        <strong>Security note.</strong> The origin allow-list stops other websites from embedding your chat in a browser. It is
        not authentication: anyone can send a request with a forged <code>Origin</code> header from a script, which is why the
        API also has per-visitor and daily rate limits. Never put secrets in the script tag; there are none to put.
      </div>
    </div>
  );
}
