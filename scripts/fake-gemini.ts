import { createServer } from 'node:http';

// A FAKE Gemini endpoint for local testing without an API key or quota:
//   npx tsx scripts/fake-gemini.ts            (listens on :4010)
//   GEMINI_API_BASE=http://127.0.0.1:4010 GEMINI_API_KEY=fake npm start
// It does no language understanding. It cites the first source it is given and quotes it, or
// refuses when the question mentions "wisdom". It proves the plumbing (schema, citation gate,
// UI), not answer quality. Never use it to judge the real model.

const port = Number(process.env.PORT ?? 4010);

createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    try {
      const data = JSON.parse(body) as {
        systemInstruction: { parts: { text: string }[] };
        contents: { parts: { text: string }[] }[];
      };
      const system = data.systemInstruction.parts[0].text;
      const question = data.contents.at(-1)?.parts[0].text ?? '';
      const ids = [...system.matchAll(/<source id="([^"]+)"/g)].map((m) => m[1]);
      const first = /<source id="[^"]+"[^>]*>\n([\s\S]*?)\n<\/source>/.exec(system)?.[1] ?? '';
      const refuse = /wisdom|admin password/i.test(question) || ids.length === 0;
      const out = refuse
        ? { answer: 'Not covered.', sourceIds: [], canAnswer: false }
        : { answer: `(fake model) ${first.split('\n').slice(1).join(' ').slice(0, 220)}`, sourceIds: ids.slice(0, 2), canAnswer: true };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }));
    } catch {
      res.writeHead(400);
      res.end('{"error":{"message":"bad request"}}');
    }
  });
}).listen(port, '127.0.0.1', () => console.log(`fake gemini on http://127.0.0.1:${port}`));
