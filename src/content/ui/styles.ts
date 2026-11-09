/*
 * SAB panel styles: one screen, three looks (data-theme on .root).
 *   notebook: graphite, ballpoint blue, highlighter, red pen
 *   focus:    dark, high contrast, sky blue
 *   school:   light warm, orange like the school site's page buttons
 * 4px grid, one easing curve. Design approach: unslop by Damir Sokolovsky (@heydamir), CC BY 4.0.
 */
export const PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.root {
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --font: "SAB Plex Hebrew", "IBM Plex Sans Hebrew", "Segoe UI", Arial, sans-serif;
  --mono: "SAB Plex Mono", "IBM Plex Mono", ui-monospace, Consolas, monospace;
  font-family: var(--font); color: var(--text); font-size: 14px; line-height: 20px;
}
.root[data-theme="notebook"] {
  --bg: #fafafa; --card: #ffffff; --raised: #f4f4f5; --line: rgba(23,23,23,0.08); --strong: rgba(23,23,23,0.14);
  --text: #171717; --text2: #525252; --muted: #6b6b6b; --accent: #1d4ed8; --accent-hover: #1e40af; --on-accent: #ffffff;
  --sel: #1d4ed8; --soft: rgba(29,78,216,0.10); --hl: rgba(253,224,71,0.75); --pen: #c8312b;
  --warn-bg: #fdf6e3; --warn-line: rgba(161,98,7,0.24); --warn-text: #713f12; --pos: #15803d; --neg: #b91c1c;
  --shadow: 0 8px 24px rgba(0,0,0,0.08); color-scheme: light;
}
.root[data-theme="focus"] {
  --bg: #111113; --card: #18181b; --raised: #232327; --line: rgba(242,242,243,0.08); --strong: rgba(242,242,243,0.16);
  --text: #f2f2f3; --text2: #b4b4ba; --muted: #8e8e95; --accent: #7cc4ff; --accent-hover: #a5d6ff; --on-accent: #0b1220;
  --sel: #7cc4ff; --soft: rgba(124,196,255,0.14); --hl: rgba(250,204,21,0.34); --pen: #ff8a7a;
  --warn-bg: #231e10; --warn-line: rgba(250,204,21,0.22); --warn-text: #f5d76e; --pos: #4cc38a; --neg: #ff6b6b;
  --shadow: none; color-scheme: dark;
}
.root[data-theme="school"] {
  --bg: #fbfaf8; --card: #ffffff; --raised: #f4f2ee; --line: rgba(28,25,23,0.08); --strong: rgba(28,25,23,0.15);
  --text: #1c1917; --text2: #57534e; --muted: #71695f; --accent: #c2410c; --accent-hover: #9a3412; --on-accent: #ffffff;
  --sel: #c2410c; --soft: rgba(194,65,12,0.10); --hl: rgba(253,224,71,0.75); --pen: #b42318;
  --warn-bg: #fdf3e7; --warn-line: rgba(194,65,12,0.22); --warn-text: #7c2d12; --pos: #15803d; --neg: #b42318;
  --shadow: 0 8px 24px rgba(0,0,0,0.08); color-scheme: light;
}
button, input, textarea { font: inherit; color: inherit; }
svg { flex: none; display: block; }
:focus-visible { outline: 2px solid var(--sel); outline-offset: 2px; }

/* launcher */
.fab-wrap { position: fixed; right: 0; top: 45%; z-index: 2147483646; direction: rtl; }
.fab { width: 40px; height: 48px; border-radius: 10px 0 0 10px; border: 1px solid var(--strong); border-right: 0; background: var(--card);
  color: var(--text2); cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: var(--shadow);
  transition: color 150ms var(--ease), background-color 150ms var(--ease); }
.fab:hover { color: var(--text); background: var(--raised); }
.fab-x { position: absolute; top: -8px; right: 28px; width: 20px; height: 20px; border-radius: 10px; border: 1px solid var(--strong);
  background: var(--card); color: var(--muted); cursor: pointer; display: none; align-items: center; justify-content: center; padding: 0; }
.fab-wrap:hover .fab-x, .fab-x:focus-visible { display: flex; }

/* panel shell */
.panel { position: fixed; top: 0; right: 0; height: 100vh; width: 416px; max-width: 100vw; z-index: 2147483647; background: var(--bg);
  border-left: 1px solid var(--strong); box-shadow: var(--shadow); display: flex; flex-direction: column; direction: rtl;
  transform: translateX(104%); transition: transform 320ms var(--ease); }
.panel.open { transform: translateX(0); }
.head { height: 52px; flex: none; display: flex; align-items: center; gap: 4px; padding: 0 16px 0 8px; border-bottom: 1px solid var(--line); }
.head.sheet { padding: 0 8px; gap: 8px; }
.brand { flex: 1; display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.brand b { font-size: 16px; font-weight: 500; }
.brand span { font-size: 13px; color: var(--text2); }
.brand small { font-family: var(--mono); font-size: 11px; color: var(--muted); }
.sheet-title { flex: 1; font-size: 16px; font-weight: 500; }
.body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.foot { flex: none; display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--line); background: var(--bg); }
.foot:empty { display: none; }
.foot .btn.primary { flex: 1; justify-content: space-between; }

/* controls */
.icon-btn { width: 32px; height: 32px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); cursor: pointer; padding: 0;
  display: inline-flex; align-items: center; justify-content: center; transition: color 150ms var(--ease), background-color 150ms var(--ease); }
.icon-btn:hover { color: var(--text); background: var(--raised); }
.icon-btn.sm { width: 28px; height: 28px; border-radius: 6px; }
.icon-btn.box { width: 36px; height: 36px; border: 1px solid var(--strong); background: var(--card); color: var(--text2); }
.btn { height: 36px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--strong); background: var(--card); color: var(--text);
  cursor: pointer; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap;
  transition: background-color 150ms var(--ease), border-color 150ms var(--ease), color 150ms var(--ease), transform 120ms var(--ease); }
.btn:hover { background: var(--raised); }
.btn:active { transform: scale(0.98); }
.btn:disabled { opacity: 0.45; cursor: default; transform: none; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 500; }
.btn.primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
.btn.big { height: 44px; width: 100%; font-size: 14px; justify-content: space-between; padding: 0 16px; }
.btn.ghost { border-color: transparent; background: transparent; color: var(--text2); }
.btn.ghost:hover { background: var(--raised); color: var(--text); }
.btn.sm { height: 28px; padding: 0 8px; font-size: 12px; border-radius: 6px; }
a.btn { text-decoration: none; }
.btn .lbl { display: inline-flex; align-items: center; gap: 8px; }
.btn .sub { font-size: 12px; color: var(--muted); font-weight: 400; }
.kbd { display: inline-flex; gap: 4px; direction: ltr; opacity: 0.8; }
.kbd kbd { font-family: var(--mono); font-size: 11px; line-height: 16px; padding: 0 4px; border-radius: 4px; border: 1px solid currentColor; }
.field { display: flex; flex-direction: column; gap: 8px; font-size: 13px; color: var(--text2); }
textarea, input[type=password], input[type=text] { width: 100%; border: 1px solid var(--strong); border-radius: 8px; background: var(--card); color: var(--text); font-size: 13px; }
textarea { min-height: 64px; padding: 8px 12px; resize: vertical; direction: rtl; }
input[type=password], input[type=text] { height: 36px; padding: 0 12px; direction: ltr; text-align: right; font-family: var(--mono); }
textarea:focus, input:focus { outline: 2px solid var(--soft); border-color: var(--sel); }
::placeholder { color: var(--muted); }
.check { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text2); cursor: pointer; }
.check input { width: 16px; height: 16px; margin: 0; accent-color: var(--sel); }
.tools { display: flex; gap: 4px; flex-wrap: wrap; margin: 0 -8px; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.muted { font-size: 12px; color: var(--muted); }
.label { font-size: 12px; color: var(--muted); }

/* cards and lists */
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
.card.pad { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.collapse-h { width: 100%; height: 40px; border: 0; background: transparent; color: var(--text); font-size: 13px; display: flex; align-items: center; gap: 8px; padding: 0 12px; cursor: pointer; text-align: right; }
.collapse-h .t { flex: 1; }
.collapse-h svg { color: var(--muted); transition: transform 150ms var(--ease); }
.collapse-h[aria-expanded="true"] svg.chev { transform: rotate(180deg); }
.collapse-b { border-top: 1px solid var(--line); padding: 8px 12px; display: flex; flex-direction: column; gap: 4px; }
.m { display: flex; align-items: center; gap: 8px; min-height: 24px; font-size: 13px; color: var(--text2); }
.m svg { color: var(--muted); }
.m .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.m.bad, .m.bad svg { color: var(--neg); }
.list { background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.item { border-bottom: 1px solid var(--line); }
.item:last-child { border-bottom: 0; }
.qrow { width: 100%; border: 0; background: transparent; text-align: right; display: flex; gap: 12px; padding: 12px; cursor: pointer; align-items: flex-start; color: var(--text); transition: background-color 150ms var(--ease); }
.qrow:hover { background: var(--raised); }
.qnum { font-family: var(--mono); font-size: 12px; color: var(--muted); width: 16px; flex: none; line-height: 20px; }
.qmain { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.qtext { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qtext.strong { font-size: 13px; color: var(--text); }
.qans { font-size: 14px; line-height: 22px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.qside { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex: none; }
.qstatus { font-size: 12px; color: var(--muted); }
.qstatus.ok { color: var(--pos); } .qstatus.bad { color: var(--neg); }
.qpage { font-size: 11px; color: var(--muted); }
.qmore { padding: 0 40px 12px 12px; display: flex; flex-direction: column; gap: 8px; font-size: 13px; line-height: 20px; color: var(--text2); }
.qmore .full { font-size: 14px; line-height: 22px; color: var(--text); white-space: pre-wrap; }
.qmore .sec { white-space: pre-wrap; }
.qmore.review { padding-right: 64px; }
/* signature: the correct option marked with a highlighter */
.hl { background: linear-gradient(transparent 40%, var(--hl) 40%, var(--hl) 94%, transparent 94%); padding: 0 4px; font-weight: 500; }
/* moment: the grade circled in red pen */
.grade { font-family: var(--mono); font-size: 14px; color: var(--pen); width: 40px; height: 32px; flex: none; display: flex; align-items: center; justify-content: center;
  border: 1.5px solid var(--pen); border-radius: 52% 48% 50% 46% / 50% 46% 54% 50%; transform: rotate(-6deg); font-variant-numeric: tabular-nums; }

/* working steps */
.steps { list-style: none; margin: 0; padding: 0; }
.step { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 12px; border-bottom: 1px solid var(--line); }
.step:last-child { border-bottom: 0; }
.step .lbl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.step .meta { font-size: 12px; color: var(--muted); max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.step.wait .lbl, .step.skip .lbl { color: var(--muted); }
.dot { width: 20px; height: 20px; border-radius: 10px; flex: none; display: flex; align-items: center; justify-content: center; }
.dot.done { background: var(--soft); color: var(--sel); }
.dot.run { border: 1.5px solid var(--sel); border-top-color: transparent; animation: spin 800ms linear infinite; }
.dot.pause { border: 1.5px solid var(--warn-text); color: var(--warn-text); }
.dot.wait, .dot.skip { border: 1.5px dashed var(--strong); }
.dot.fail { border: 1.5px solid var(--neg); color: var(--neg); }

/* notices */
.banner { border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px; font-size: 13px; align-items: flex-start; }
.banner .bt { display: flex; align-items: center; gap: 8px; font-weight: 500; }
.banner.warn { background: var(--warn-bg); border: 1px solid var(--warn-line); }
.banner.warn .bt { color: var(--warn-text); }
.banner.info { background: var(--raised); color: var(--text2); }
.banner.err { background: var(--warn-bg); border: 1px solid var(--warn-line); color: var(--text); }
.banner.err .bt { color: var(--neg); }
.banner .txt { color: var(--text2); }
.status { display: flex; align-items: center; gap: 8px; min-height: 24px; }
.status .t { flex: 1; }
.status svg { color: var(--muted); }
.status .cost { font-family: var(--mono); font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.note { font-size: 13px; color: var(--text2); white-space: pre-wrap; }
.thinking { font-size: 12px; line-height: 16px; color: var(--muted); }

/* sources */
.sources a { display: flex; align-items: center; gap: 8px; min-height: 28px; color: var(--text); text-decoration: none; font-size: 13px; }
.sources a:hover .t { text-decoration: underline; }
.sources a svg { color: var(--muted); }
.sources .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sources .dom { font-family: var(--mono); font-size: 11px; color: var(--muted); direction: ltr; flex: none; }

/* sheets */
.story { white-space: pre-wrap; font-size: 15px; line-height: 26px; padding: 16px; max-height: 56vh; overflow-y: auto; }
.story h2 { font-size: 16px; line-height: 24px; font-weight: 500; margin: 0 0 8px; white-space: normal; }
.story.empty { font-size: 13px; line-height: 20px; color: var(--muted); }
.stat .num { font-family: var(--mono); font-size: 28px; line-height: 32px; margin-top: 4px; font-variant-numeric: tabular-nums; }
.hist { display: flex; align-items: center; gap: 4px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.hist .open { flex: 1; min-width: 0; border: 0; background: transparent; text-align: right; cursor: pointer; padding: 0; color: var(--text); }
.hist .ht { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hist .hd { font-size: 12px; color: var(--muted); }
.hist .cost { font-family: var(--mono); font-size: 12px; color: var(--muted); }
.seg { display: flex; gap: 4px; background: var(--raised); padding: 4px; border-radius: 10px; }
.seg button { flex: 1; height: 32px; border: 0; border-radius: 6px; background: transparent; color: var(--text2); font-size: 13px; cursor: pointer; }
.seg button[aria-pressed="true"] { background: var(--card); color: var(--text); box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
.swatches { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.swatch { border: 1px solid var(--strong); border-radius: 10px; background: var(--card); padding: 8px; display: flex; flex-direction: column; gap: 8px; cursor: pointer; font-size: 12px; color: var(--text2); align-items: center; }
.swatch[aria-pressed="true"] { border-color: var(--sel); color: var(--text); box-shadow: 0 0 0 1px var(--sel); }
.swatch i { display: block; width: 100%; height: 24px; border-radius: 6px; }
.keys-list .m { justify-content: space-between; border-bottom: 1px solid var(--line); min-height: 36px; }

.toast { position: fixed; bottom: 24px; right: 24px; z-index: 2147483647; background: #171717; color: #ededed; padding: 12px 16px; border-radius: 10px;
  font-size: 13px; line-height: 20px; direction: rtl; box-shadow: 0 8px 24px rgba(0,0,0,0.18); max-width: 360px; font-family: var(--font); }
.spinner { width: 16px; height: 16px; border: 1.5px solid var(--muted); border-top-color: transparent; border-radius: 8px; animation: spin 800ms linear infinite; flex: none; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .panel { transition: none; } .dot.run, .spinner { animation-duration: 2.4s; } }
`;
