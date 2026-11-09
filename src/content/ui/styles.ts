/*
 * SAB panel styles. Direction (unslop): a school notebook.
 * Quiet graphite chrome, one accent in ballpoint-pen blue for the primary action and the selection.
 * Moments: the answer sheet, the correct option marked with a highlighter, the grade circled in red pen.
 * Spacing on a 4px grid. One easing curve. Design approach: unslop by Damir Sokolovsky (@heydamir), CC BY 4.0.
 */
export const PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.root {
  --bg: #fafafa; --card: #ffffff; --raised: #f4f4f5; --line: rgba(23, 23, 23, 0.08); --line-strong: rgba(23, 23, 23, 0.14);
  --text: #171717; --text-2: #525252; --muted: #737373;
  --ink: #1d4ed8; --ink-hover: #1e40af; --ink-soft: rgba(29, 78, 216, 0.12); --on-ink: #ffffff; --sel: #1d4ed8;
  --hl: rgba(253, 224, 71, 0.75); --pen: #c8312b;
  --pos: #16a34a; --neg: #dc2626; --warn-bg: #fdf6e3; --warn-line: rgba(161, 98, 7, 0.22);
  --shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --font: "SAB Plex Hebrew", "IBM Plex Sans Hebrew", "Segoe UI", Arial, sans-serif;
  --mono: "SAB Plex Mono", "IBM Plex Mono", ui-monospace, Consolas, monospace;
  font-family: var(--font); color: var(--text); font-size: 14px; line-height: 20px; color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  .root {
    --bg: #141415; --card: #19191b; --raised: #232325; --line: rgba(237, 237, 237, 0.08); --line-strong: rgba(237, 237, 237, 0.14);
    --text: #ededed; --text-2: #a1a1a6; --muted: #85858b;
    --ink: #e9e9ea; --ink-hover: #ffffff; --ink-soft: rgba(122, 162, 255, 0.16); --on-ink: #141415; --sel: #7aa2ff;
    --hl: rgba(250, 204, 21, 0.35); --pen: #ff6b5e;
    --pos: #4cc38a; --neg: #e5484d; --warn-bg: #221d12; --warn-line: rgba(250, 204, 21, 0.18);
    --shadow: none;
    color-scheme: dark;
  }
}
button { font: inherit; color: inherit; }
svg { flex: none; display: block; }

/* launcher on the page edge */
.fab-wrap { position: fixed; right: 0; top: 45%; z-index: 2147483646; direction: rtl; font-family: var(--font); }
.fab { width: 40px; height: 48px; border-radius: 10px 0 0 10px; border: 1px solid var(--line-strong); border-right: 0;
  background: var(--card); color: var(--text-2); cursor: pointer; display: flex; align-items: center; justify-content: center;
  box-shadow: var(--shadow); transition: color 150ms var(--ease), background-color 150ms var(--ease); }
.fab:hover { color: var(--text); background: var(--raised); }
.fab-x { position: absolute; top: -8px; right: 28px; width: 20px; height: 20px; border-radius: 10px; border: 1px solid var(--line-strong);
  background: var(--card); color: var(--muted); cursor: pointer; display: none; align-items: center; justify-content: center; padding: 0; }
.fab-wrap:hover .fab-x { display: flex; }
.fab-x:hover { color: var(--text); }

/* panel */
.panel { position: fixed; top: 0; right: 0; height: 100vh; width: 416px; max-width: 100vw; z-index: 2147483647; background: var(--bg);
  border-left: 1px solid var(--line-strong); box-shadow: var(--shadow); display: flex; flex-direction: column; direction: rtl;
  transform: translateX(104%); transition: transform 320ms var(--ease); }
.panel.open { transform: translateX(0); }

.head { height: 52px; flex: none; display: flex; align-items: center; gap: 4px; padding: 0 16px 0 8px; }
.brand { flex: 1; display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.brand b { font-size: 16px; font-weight: 500; letter-spacing: 0.01em; }
.brand span { font-size: 13px; color: var(--text-2); }
.brand small { font-family: var(--mono); font-size: 11px; color: var(--muted); }
.icon-btn { width: 32px; height: 32px; border-radius: 8px; border: 0; background: transparent; color: var(--muted); cursor: pointer; padding: 0;
  display: inline-flex; align-items: center; justify-content: center; transition: color 150ms var(--ease), background-color 150ms var(--ease); }
.icon-btn:hover { color: var(--text); background: var(--raised); }
.icon-btn.sm { width: 28px; height: 28px; border-radius: 6px; }

.tabs { display: flex; gap: 4px; padding: 0 12px; border-bottom: 1px solid var(--line); flex: none; }
.tab { height: 36px; padding: 0 8px; background: none; border: 0; color: var(--muted); cursor: pointer; font-size: 13px;
  display: inline-flex; align-items: center; gap: 6px; transition: color 150ms var(--ease); }
.tab:hover { color: var(--text); }
.tab.active { color: var(--text); box-shadow: inset 0 -2px 0 var(--sel); }
.tab .dot { width: 6px; height: 6px; border-radius: 3px; background: var(--text-2); }

.body { flex: 1; overflow-y: auto; padding: 16px; }
.section { display: none; }
.section.active { display: flex; flex-direction: column; gap: 12px; }
.foot { display: none; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--line); background: var(--bg); flex: none; }
.foot.show { display: flex; }
.foot .btn.primary { flex: 1; justify-content: space-between; }

/* buttons */
.btn { height: 36px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--line-strong); background: var(--card); color: var(--text);
  cursor: pointer; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap;
  transition: background-color 150ms var(--ease), border-color 150ms var(--ease), color 150ms var(--ease), transform 120ms var(--ease); }
.btn:hover { background: var(--raised); }
.btn:active { transform: scale(0.98); }
.btn:disabled { opacity: 0.5; cursor: default; transform: none; }
.btn.primary { background: var(--ink); border-color: var(--ink); color: var(--on-ink); font-weight: 500; }
.btn.primary:hover { background: var(--ink-hover); border-color: var(--ink-hover); }
.btn.big { height: 44px; width: 100%; font-size: 14px; justify-content: space-between; padding: 0 16px; }
.btn .lbl { display: inline-flex; align-items: center; gap: 8px; }
.btn.ghost { border-color: transparent; background: transparent; color: var(--text-2); }
.btn.ghost:hover { background: var(--raised); color: var(--text); }
.btn.sm { height: 28px; padding: 0 8px; font-size: 12px; border-radius: 6px; }
.btn:focus-visible, .icon-btn:focus-visible, .tab:focus-visible, .fab:focus-visible, a:focus-visible { outline: 2px solid var(--sel); outline-offset: 2px; }
.kbd { display: inline-flex; gap: 4px; direction: ltr; }
.kbd kbd { font-family: var(--mono); font-size: 11px; line-height: 16px; padding: 0 4px; border-radius: 4px; border: 1px solid currentColor; opacity: 0.7; }

.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tools { display: flex; gap: 4px; flex-wrap: wrap; margin: 0 -8px; }
textarea { width: 100%; min-height: 64px; border: 1px solid var(--line-strong); border-radius: 8px; padding: 8px 12px; background: var(--card);
  color: var(--text); font: inherit; font-size: 13px; resize: vertical; direction: rtl; }
textarea:focus { outline: 2px solid var(--ink-soft); border-color: var(--sel); }
textarea::placeholder { color: var(--muted); }
label.check { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--text-2); cursor: pointer; }
label.check input { accent-color: var(--sel); width: 16px; height: 16px; margin: 0; }
.muted { color: var(--muted); font-size: 12px; }
.label { font-size: 12px; color: var(--muted); margin-top: 8px; }

/* meta list: status, searches, documents, videos, scan results */
.status { display: flex; align-items: center; gap: 8px; min-height: 24px; font-size: 14px; color: var(--text); }
.status .st { white-space: pre-wrap; }
.status .cost, .num { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.status .cost { margin-inline-start: auto; font-size: 12px; color: var(--muted); }
.status.err { color: var(--neg); align-items: flex-start; }
.status svg { color: var(--muted); }
.status.err svg { color: var(--neg); margin-top: 2px; }
.note { font-size: 13px; color: var(--text-2); white-space: pre-wrap; }
.note:empty { display: none; }
.meta { display: flex; flex-direction: column; gap: 4px; }
.meta:empty { display: none; }
.m { display: flex; align-items: center; gap: 8px; min-height: 24px; font-size: 13px; color: var(--text-2); }
.m svg { color: var(--muted); }
.m .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.m.bad, .m.bad svg { color: var(--neg); }
.fields { display: flex; flex-direction: column; }
.fields .m { border-bottom: 1px solid var(--line); min-height: 32px; }
.fields .pg { font-family: var(--mono); font-size: 11px; color: var(--muted); width: 36px; flex: none; }

/* notices */
.warn { background: var(--warn-bg); border: 1px solid var(--warn-line); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px; font-size: 13px; align-items: flex-start; }
.warn .wt { display: flex; align-items: center; gap: 8px; font-weight: 500; }
.warn ul { margin: 0; padding: 0 20px 0 0; color: var(--text-2); display: flex; flex-direction: column; gap: 4px; }
.info { background: var(--raised); border-radius: 12px; padding: 12px; font-size: 13px; color: var(--text-2); display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.info:empty, .notices:empty { display: none; }
.notices { display: flex; flex-direction: column; gap: 8px; }

/* the answer sheet */
.cards { display: flex; flex-direction: column; gap: 8px; }
.cards:empty { display: none; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px 16px; }
.card-h { display: flex; align-items: center; gap: 4px; min-height: 28px; margin: 0 0 4px -8px; }
.card-h .q { flex: 1; font-size: 12px; color: var(--muted); }
.out { font-size: 12px; margin-inline-end: 4px; }
.out.ok { color: var(--pos); } .out.bad { color: var(--neg); }
.answer { font-size: 15px; line-height: 24px; white-space: pre-wrap; color: var(--text); }
.answer.sec { font-size: 14px; line-height: 22px; color: var(--text-2); }
.opt { margin-bottom: 8px; font-size: 15px; line-height: 24px; }
/* signature: the correct option marked with a highlighter */
.hl { background: linear-gradient(transparent 38%, var(--hl) 38%, var(--hl) 94%, transparent 94%); padding: 0 4px; border-radius: 2px; font-weight: 500; }
.sub { font-size: 12px; color: var(--muted); margin: 12px 0 4px; }
details summary { cursor: pointer; font-size: 13px; color: var(--text-2); margin-top: 12px; list-style: none; display: flex; align-items: center; gap: 8px; }
details summary::-webkit-details-marker { display: none; }
details summary::before { content: ""; width: 6px; height: 6px; border-left: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg); margin-top: -4px; transition: transform 150ms var(--ease); }
details[open] summary::before { transform: rotate(-45deg); margin-top: 2px; }
details .answer { margin-top: 8px; }
.card .acts { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
/* moment: the grade circled in red pen */
.grade { font-family: var(--mono); font-variant-numeric: tabular-nums; font-size: 14px; color: var(--pen); width: 40px; height: 32px; flex: none;
  display: inline-flex; align-items: center; justify-content: center; border: 1.5px solid var(--pen);
  border-radius: 52% 48% 50% 46% / 50% 46% 54% 50%; transform: rotate(-6deg); margin-inline-start: 8px; }

/* sources */
.sources { display: flex; flex-direction: column; gap: 4px; }
.sources:empty { display: none; }
.sources a { display: flex; align-items: center; gap: 8px; min-height: 28px; color: var(--text); text-decoration: none; font-size: 13px; border-radius: 6px; }
.sources a:hover .t { text-decoration: underline; }
.sources a svg { color: var(--muted); }
.sources .dom { font-family: var(--mono); font-size: 11px; color: var(--muted); margin-inline-start: auto; direction: ltr; flex: none; }
.sources .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

/* story */
.story { white-space: pre-wrap; font-size: 15px; line-height: 26px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; max-height: 56vh; overflow-y: auto; }
.story.empty { color: var(--muted); font-size: 13px; line-height: 20px; }
.story h2 { font-size: 16px; line-height: 24px; font-weight: 500; margin: 0 0 8px; }

/* history */
.stat { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.stat .muted { font-size: 13px; color: var(--text-2); }
.stat .num { font-size: 28px; line-height: 32px; font-weight: 500; margin-top: 4px; }
.hist-list { display: flex; flex-direction: column; }
.hist { display: flex; align-items: center; gap: 4px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.hist .hm { flex: 1; min-width: 0; }
.hist .ht { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hist .hd { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }

.toast { position: fixed; bottom: 24px; right: 24px; z-index: 2147483647; background: #171717; color: #ededed; padding: 12px 16px; border-radius: 10px;
  font-size: 13px; line-height: 20px; direction: rtl; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18); max-width: 360px; font-family: var(--font); }
.spinner { width: 16px; height: 16px; border: 1.5px solid var(--muted); border-top-color: transparent; border-radius: 8px; animation: spin 800ms linear infinite; flex: none; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .panel { transition: none; } }
`;
