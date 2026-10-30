/** Styles live inside the shadow root, so host-site CSS can neither break nor be broken by them. */
export function css(accent: string, onAccent: string, side: 'left' | 'right'): string {
  return `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.root {
  --accent: ${accent}; --on-accent: ${onAccent};
  --bg: #ffffff; --fg: #1a1f24; --muted: #5b6670; --line: #dde3e8; --bubble: #eef2f5; --err: #b42318;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 15px; line-height: 1.45; color: var(--fg);
  position: fixed; bottom: 20px; ${side}: 20px; z-index: 2147483000;
}
@media (prefers-color-scheme: dark) {
  .root { --bg: #161b20; --fg: #eaeef1; --muted: #9aa6b0; --line: #2d363e; --bubble: #232b32; --err: #ff8a80; }
}
button { font: inherit; cursor: pointer; }
:focus-visible { outline: 3px solid #2563eb; outline-offset: 2px; }
.launcher {
  display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 50%;
  border: 0; background: var(--accent); color: var(--on-accent); box-shadow: 0 4px 14px rgba(0,0,0,.28);
}
.launcher svg { width: 26px; height: 26px; }
.panel {
  position: absolute; bottom: 68px; ${side}: 0; width: 370px; max-width: calc(100vw - 24px);
  height: min(560px, calc(100vh - 110px)); display: flex; flex-direction: column;
  background: var(--bg); border: 1px solid var(--line); border-radius: 14px; overflow: hidden;
  box-shadow: 0 12px 40px rgba(0,0,0,.28);
}
.panel[hidden] { display: none; }
.head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: var(--accent); color: var(--on-accent); }
.head .t { flex: 1; min-width: 0; }
.head .name { font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.head .sub { font-size: 12px; opacity: .9; }
.close { border: 0; background: transparent; color: inherit; width: 36px; height: 36px; border-radius: 8px; font-size: 22px; line-height: 1; }
.close:hover { background: rgba(255,255,255,.18); }
.log { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.msg { max-width: 88%; padding: 9px 12px; border-radius: 12px; background: var(--bubble); white-space: pre-wrap; overflow-wrap: anywhere; }
.msg.user { align-self: flex-end; background: var(--accent); color: var(--on-accent); }
.msg.err { color: var(--err); }
.msg.pending { color: var(--muted); font-style: italic; }
.src { margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--line); font-size: 13px; white-space: normal; }
.src b { color: var(--muted); font-weight: 600; }
.src ul { margin: 4px 0 0; padding-left: 18px; }
.src a { color: inherit; text-decoration: underline; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 10px; }
.chip { border: 1px solid var(--line); background: var(--bg); color: var(--fg); border-radius: 999px; padding: 6px 11px; font-size: 13px; }
.chip:hover { border-color: var(--accent); }
form { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--line); }
input[type=text] { flex: 1; min-width: 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); color: var(--fg); font: inherit; }
.send { border: 0; border-radius: 10px; padding: 0 14px; background: var(--accent); color: var(--on-accent); font-weight: 600; }
.send:disabled { opacity: .55; cursor: default; }
.note { padding: 0 14px 10px; font-size: 11.5px; color: var(--muted); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 480px) {
  .root { bottom: 14px; ${side}: 14px; }
  .panel { position: fixed; inset: 0; width: auto; max-width: none; height: 100dvh; border-radius: 0; border: 0; }
  input[type=text] { font-size: 16px; }
}
@media (prefers-reduced-motion: no-preference) {
  .panel { animation: pop .16s ease-out; }
  @keyframes pop { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
}
`;
}

/** Black or white text, whichever has more contrast on the accent colour. */
export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? '#111111' : '#ffffff';
}
