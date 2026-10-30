// Thin provider layer. Only Gemini is implemented, behind a small interface so another
// provider can be dropped in by changing one function.

export type LlmErrorCode = 'not_configured' | 'rate_limited' | 'unavailable' | 'bad_output';

export class LlmError extends Error {
  constructor(
    public code: LlmErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

export interface JsonRequest {
  system: string;
  turns: Turn[];
  schema: unknown;
  maxOutputTokens?: number;
}

export type GenerateJson = (req: JsonRequest) => Promise<unknown>;

// gemini-2.5-flash returned 404 for new API keys, so the default is a newer model and
// GEMINI_MODEL can override it. No thinkingConfig is sent.
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const TIMEOUT_MS = 20_000;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

export const generateJson: GenerateJson = async (req) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new LlmError('not_configured', 'GEMINI_API_KEY is not set');
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  // GEMINI_API_BASE exists so tests can point at a local stub; leave it unset in production.
  const base = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${base}/models/${encodeURIComponent(model)}:generateContent`;

  const body = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: req.turns.map((t) => ({
      role: t.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: t.text }],
    })),
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: req.maxOutputTokens ?? 600,
      responseMimeType: 'application/json',
      responseSchema: req.schema,
    },
  };

  // One retry for transient server errors, none for quota errors.
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      console.error('Gemini request error:', e instanceof Error ? e.name : 'unknown');
      if (attempt === 0) continue;
      throw new LlmError('unavailable', 'The model did not respond in time');
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 429) {
      console.error('Gemini quota/rate limit (429)');
      throw new LlmError('rate_limited', 'Model quota reached');
    }
    if (res.status >= 500 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 600));
      continue;
    }
    if (!res.ok) {
      // Log status and Google's error text (e.g. "model not found"); never the key or the request body.
      const detail = await res.text().catch(() => '');
      console.error('Gemini request failed with status', res.status, detail.slice(0, 300));
      throw new LlmError('unavailable', `Model request failed (${res.status})`);
    }

    const data = (await res.json()) as GeminiResponse;
    if (data.promptFeedback?.blockReason) throw new LlmError('bad_output', 'The request was blocked by the model');
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    try {
      return JSON.parse(text);
    } catch {
      throw new LlmError('bad_output', 'The model returned invalid JSON');
    }
  }
  throw new LlmError('unavailable', 'The model is unavailable');
};
