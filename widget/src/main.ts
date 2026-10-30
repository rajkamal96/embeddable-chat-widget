import { css, readableOn } from './styles';

interface PublicConfig {
  id: string;
  name: string;
  assistantName: string;
  themeColor: string;
  welcomeMessage: string;
  suggestedQuestions: string[];
  demo: boolean;
}
interface Source { title: string; href: string }
interface ChatReply { ok: boolean; message?: string; answer?: string; canAnswer?: boolean; sources?: Source[] }
interface Turn { role: 'user' | 'assistant'; text: string; sources?: Source[]; error?: boolean }

const CHAT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/></svg>';

const script = (document.currentScript as HTMLScriptElement | null) ?? document.querySelector<HTMLScriptElement>('script[data-site][src*="widget"]');

function start(): void {
  const siteId = script?.dataset.site;
  if (!script || !siteId) return void console.warn('[chat-widget] missing data-site attribute');
  const w = window as unknown as { __chatWidgets?: Record<string, boolean> };
  w.__chatWidgets ??= {};
  if (w.__chatWidgets[siteId]) return;
  w.__chatWidgets[siteId] = true;

  const apiBase = (script.dataset.api || new URL(script.src, location.href).origin).replace(/\/$/, '');
  const side = script.dataset.position === 'left' ? 'left' : 'right';
  const q = `?site=${encodeURIComponent(siteId)}`;

  fetch(`${apiBase}/api/config${q}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((d: { ok: boolean; enabled: boolean; config: PublicConfig }) => {
      // Silent when the owner switched it off or this origin is not allowed: never break the host page.
      if (d.ok && d.enabled) mount(d.config, apiBase, q, side);
    })
    .catch(() => console.warn('[chat-widget] not loaded (site unknown, origin not allowed, or service off)'));
}

function mount(cfg: PublicConfig, apiBase: string, q: string, side: 'left' | 'right'): void {
  // A custom tag name is not matched by generic host rules like `div { ... }`; the inline
  // !important keeps the host element visible even then. Everything inside is in the shadow root.
  const host = document.createElement('ai-chat-widget');
  host.setAttribute('data-chat-widget', cfg.id);
  host.style.setProperty('display', 'block', 'important');
  host.style.setProperty('visibility', 'visible', 'important');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css(cfg.themeColor, readableOn(cfg.themeColor), side);
  const root = document.createElement('div');
  root.className = 'root';
  root.innerHTML = `
    <button class="launcher" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="panel">${CHAT_ICON}</button>
    <section class="panel" id="panel" role="dialog" aria-modal="false" hidden>
      <div class="head"><div class="t"><div class="name"></div><div class="sub"></div></div>
        <button class="close" type="button" aria-label="Close chat">&times;</button></div>
      <div class="log" role="log" aria-live="polite" aria-relevant="additions"></div>
      <div class="chips"></div>
      <form autocomplete="off">
        <label class="sr" for="q">Your question</label>
        <input id="q" type="text" maxlength="500" placeholder="Ask a question…" enterkeyhint="send" />
        <button class="send" type="submit">Send</button>
      </form>
      <div class="note"></div>
    </section>`;
  shadow.append(style, root);

  const $ = <T extends Element>(sel: string) => root.querySelector(sel) as T;
  const launcher = $<HTMLButtonElement>('.launcher');
  const panel = $<HTMLElement>('.panel');
  const log = $<HTMLElement>('.log');
  const chips = $<HTMLElement>('.chips');
  const form = $<HTMLFormElement>('form');
  const input = $<HTMLInputElement>('input');
  const sendBtn = $<HTMLButtonElement>('.send');

  launcher.setAttribute('aria-label', `Open chat with ${cfg.assistantName}`);
  panel.setAttribute('aria-label', `${cfg.name} chat`);
  $<HTMLElement>('.name').textContent = cfg.name;
  $<HTMLElement>('.sub').textContent = cfg.demo ? 'AI assistant · demo' : 'AI assistant';
  $<HTMLElement>('.note').textContent =
    (cfg.demo ? 'Demo with a fictional business. ' : '') +
    'Answers come only from this website’s content and can be wrong. Check the sources.';

  // Conversation survives page navigation within the tab; storage may be blocked, so it is optional.
  const key = `chatw:${cfg.id}`;
  let turns: Turn[] = [];
  try {
    turns = JSON.parse(sessionStorage.getItem(key) || '[]') as Turn[];
  } catch { /* ignore */ }
  const save = () => {
    try { sessionStorage.setItem(key, JSON.stringify(turns.slice(-20))); } catch { /* ignore */ }
  };

  function bubble(t: Turn): HTMLElement {
    const el = document.createElement('div');
    el.className = `msg ${t.role === 'user' ? 'user' : 'bot'}${t.error ? ' err' : ''}`;
    el.textContent = t.text; // always textContent: model output is never parsed as HTML
    if (t.sources?.length) {
      const box = document.createElement('div');
      box.className = 'src';
      box.innerHTML = '<b>Sources</b><ul></ul>';
      const ul = box.querySelector('ul') as HTMLUListElement;
      for (const s of t.sources) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.textContent = s.title;
        a.href = s.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        li.append(a);
        ul.append(li);
      }
      el.append(box);
    }
    return el;
  }
  const add = (t: Turn) => {
    const el = bubble(t);
    log.append(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };

  if (!turns.length) turns = [{ role: 'assistant', text: cfg.welcomeMessage }];
  turns.forEach(add);

  function renderChips() {
    chips.textContent = '';
    if (turns.some((t) => t.role === 'user')) return;
    for (const text of cfg.suggestedQuestions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = text;
      b.addEventListener('click', () => void ask(text));
      chips.append(b);
    }
  }
  renderChips();

  let busy = false;
  async function ask(message: string) {
    const text = message.trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    input.value = '';
    const history = turns.filter((t) => !t.error).slice(-6).map(({ role, text: tx }) => ({ role, text: tx }));
    const user: Turn = { role: 'user', text };
    turns.push(user);
    add(user);
    renderChips();
    const pending = add({ role: 'assistant', text: 'Looking through the website…' });
    pending.classList.add('pending');
    log.setAttribute('aria-busy', 'true');

    let reply: Turn;
    try {
      const res = await fetch(`${apiBase}/api/chat${q}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });
      const data = (await res.json().catch(() => ({}))) as ChatReply;
      reply =
        res.ok && data.ok && data.answer
          ? { role: 'assistant', text: data.answer, sources: data.sources }
          : { role: 'assistant', text: data.message || 'Something went wrong. Please try again.', error: true };
    } catch {
      reply = { role: 'assistant', text: 'I could not reach the assistant. Check your connection and try again.', error: true };
    }
    pending.replaceWith(bubble(reply));
    log.scrollTop = log.scrollHeight;
    log.removeAttribute('aria-busy');
    turns.push(reply);
    save();
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void ask(input.value);
  });

  function setOpen(open: boolean) {
    panel.hidden = !open;
    launcher.setAttribute('aria-expanded', String(open));
    if (open) {
      log.scrollTop = log.scrollHeight;
      input.focus();
    } else {
      launcher.focus();
    }
  }
  launcher.addEventListener('click', () => setOpen(panel.hidden));
  $<HTMLButtonElement>('.close').addEventListener('click', () => setOpen(false));

  // Escape closes; Tab stays inside the open panel so keyboard users do not wander into the page behind it.
  root.addEventListener('keydown', (e) => {
    if (panel.hidden) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      return setOpen(false);
    }
    if (e.key !== 'Tab') return;
    const items = [...panel.querySelectorAll<HTMLElement>('button, input, a[href]')].filter((el) => !(el as HTMLButtonElement).disabled);
    if (!items.length) return;
    const active = shadow.activeElement as HTMLElement | null;
    if (e.shiftKey && active === items[0]) {
      e.preventDefault();
      items[items.length - 1].focus();
    } else if (!e.shiftKey && active === items[items.length - 1]) {
      e.preventDefault();
      launcher.focus();
    }
  });

  document.body.append(host);
}

if (document.body) start();
else document.addEventListener('DOMContentLoaded', start, { once: true });
