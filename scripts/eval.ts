import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { SITES } from '../src/generated/sites';
import { createHandlers } from '../src/lib/handler';
import { createLimiter } from '../src/lib/rateLimit';
import { buildIndex, retrieveContext, search, uniquePages } from '../src/lib/retrieve';

// Retrieval eval: no model is called, so it is free and deterministic.
//   npm run eval                    retrieval hit rates + pre-model refusal rate
//   npm run eval -- --live          also runs the full pipeline against the real model
//                                   (needs GEMINI_API_KEY; spends free-tier quota)
//   npm run eval -- --site <id>     a different site (data/eval/<id>.json)

interface Q { q: string; type: 'answerable' | 'uncovered' | 'off-topic' | 'injection'; expect: string[] }

async function main() {
  const { values } = parseArgs({ options: { site: { type: 'string', default: 'acme-dental' }, live: { type: 'boolean', default: false } } });
  const site = SITES[values.site!];
  if (!site) throw new Error(`Unknown site "${values.site}"`);
  const file = JSON.parse(readFileSync(join(process.cwd(), 'data', 'eval', `${values.site}.json`), 'utf8')) as { note: string; questions: Q[] };
  const index = buildIndex(site.index.chunks);

  const retrieve = (q: string) => retrieveContext(index, q); // the same function the API uses

  const ans = file.questions.filter((x) => x.type === 'answerable');
  const non = file.questions.filter((x) => x.type !== 'answerable');
  let top1 = 0;
  let top3 = 0;
  const misses: string[] = [];
  for (const { q, expect } of ans) {
    const pages = uniquePages(search(index, q, 24).map((h) => h.chunk));
    const rank = pages.findIndex((p) => expect.includes(p));
    if (rank === 0) top1++;
    if (rank >= 0 && rank < 3) top3++;
    if (rank !== 0) misses.push(`  - "${q}"\n      expected ${expect.join(' | ')}; got ${pages.slice(0, 3).join(', ') || '(nothing)'}${rank > 0 ? ` (found at rank ${rank + 1})` : ''}`);
  }

  const refusedEarly: Q[] = [];
  const reachModel: Q[] = [];
  for (const x of non) (retrieve(x.q).length === 0 ? refusedEarly : reachModel).push(x);

  const pct = (a: number, b: number) => `${a}/${b} (${Math.round((100 * a) / b)}%)`;
  console.log(`Site: ${values.site}   Questions: ${file.questions.length} (${ans.length} answerable, ${non.length} not answerable)`);
  console.log(`Note: ${file.note}\n`);
  console.log('Retrieval (answerable questions, page level, no model)');
  console.log(`  Top-1 hit rate: ${pct(top1, ans.length)}`);
  console.log(`  Top-3 hit rate: ${pct(top3, ans.length)}`);
  if (misses.length) console.log(`  Not top-1:\n${misses.join('\n')}`);
  console.log('\nUnanswerable questions (off-topic, uncovered, prompt injection)');
  console.log(`  Refused before any model call (zero keyword overlap): ${pct(refusedEarly.length, non.length)}`);
  console.log(`  Reach the model (rely on the prompt + citation gate): ${pct(reachModel.length, non.length)}`);
  for (const x of reachModel) console.log(`    - [${x.type}] "${x.q}"`);

  if (!values.live) {
    console.log('\nLive model check: not run (use --live with GEMINI_API_KEY). The pre-model numbers above say nothing about answer quality.');
    return;
  }
  if (!process.env.GEMINI_API_KEY) throw new Error('--live needs GEMINI_API_KEY in the environment');

  const origin = site.config.allowedOrigins[0];
  const handlers = createHandlers({ sites: SITES, limiter: createLimiter({ windowMs: 1000, maxPerWindow: 1e6, maxPerDay: 1e6 }) });
  let answeredOk = 0;
  let refusedOk = 0;
  const bad: string[] = [];
  for (const x of file.questions) {
    const res = await handlers.chat(new Request(`https://eval.local/api/chat?site=${values.site}`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ message: x.q }) }));
    const body = (await res.json()) as { canAnswer?: boolean; sources?: { href: string }[]; message?: string };
    if (x.type === 'answerable') {
      const cited = (body.sources ?? []).some((s) => x.expect.some((e) => new URL(s.href).pathname === e));
      if (body.canAnswer && cited) answeredOk++;
      else bad.push(`  - answerable not answered/cited correctly: "${x.q}" (${res.status} ${body.message ?? ''})`);
    } else if (body.canAnswer === false) refusedOk++;
    else bad.push(`  - should have refused: "${x.q}" (${res.status} ${body.message ?? ''})`);
    await new Promise((r) => setTimeout(r, 4500)); // stay under free-tier request-per-minute limits
  }
  console.log('\nLive pipeline');
  console.log(`  Answerable: answered with an expected source: ${pct(answeredOk, ans.length)}`);
  console.log(`  Unanswerable: refused: ${pct(refusedOk, non.length)}`);
  if (bad.length) console.log(bad.join('\n'));
  console.log('  Answer text was not graded; only the refusal decision and citations were checked.');
}

main().catch((e) => {
  console.error('Eval failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
