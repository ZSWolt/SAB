export const PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: "Segoe UI", Arial, "Noto Sans Hebrew", sans-serif; }
.root { --bg:#ffffff; --fg:#111827; --muted:#6b7280; --line:#e5e7eb; --accent:#4f46e5; --accent-fg:#fff; --soft:#eef2ff; --ok:#16a34a; --err:#dc2626; --card:#f9fafb; }
@media (prefers-color-scheme: dark) {
  .root { --bg:#111827; --fg:#f3f4f6; --muted:#9ca3af; --line:#374151; --accent:#818cf8; --accent-fg:#111827; --soft:#1e1b4b; --card:#1f2937; }
}
.fab { position: fixed; right: 0; top: 45%; z-index: 2147483646; width: 44px; height: 52px; border-radius: 12px 0 0 12px;
  background: var(--accent); color: var(--accent-fg); border: none; cursor: pointer; font-size: 15px; font-weight: 700;
  box-shadow: 0 4px 14px rgba(0,0,0,.25); display: flex; align-items: center; justify-content: center; }
.fab:hover { width: 50px; }
.fab-x { position: fixed; right: 30px; top: calc(45% - 10px); z-index: 2147483647; width: 20px; height: 20px; border-radius: 50%;
  border: none; background: #374151; color: #fff; font-size: 12px; cursor: pointer; line-height: 20px; padding: 0; display: none; }
.fab-wrap:hover .fab-x { display: block; }
.panel { position: fixed; top: 0; right: 0; height: 100vh; width: 420px; max-width: 100vw; z-index: 2147483647; background: var(--bg);
  color: var(--fg); border-left: 1px solid var(--line); box-shadow: -6px 0 24px rgba(0,0,0,.18); display: flex; flex-direction: column;
  direction: rtl; font-size: 14px; transform: translateX(105%); transition: transform .2s ease; }
.panel.open { transform: translateX(0); }
.head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.head h1 { font-size: 15px; margin: 0; flex: 1; }
.icon { background: none; border: none; color: var(--fg); cursor: pointer; font-size: 16px; padding: 4px 6px; border-radius: 6px; }
.icon:hover { background: var(--soft); }
.tabs { display: flex; border-bottom: 1px solid var(--line); }
.tab { flex: 1; padding: 9px 4px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--muted); cursor: pointer; font-size: 13px; }
.tab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
.tab .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--ok); margin-inline-start: 4px; vertical-align: middle; }
.body { flex: 1; overflow-y: auto; padding: 12px; }
.section { display: none; }
.section.active { display: block; }
.btn { background: var(--card); color: var(--fg); border: 1px solid var(--line); border-radius: 8px; padding: 7px 11px; cursor: pointer; font-size: 13px; }
.btn:hover { border-color: var(--accent); }
.btn.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); font-weight: 600; }
.btn:disabled { opacity: .5; cursor: default; }
.row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin: 8px 0; }
.big { width: 100%; padding: 11px; font-size: 15px; }
textarea { width: 100%; min-height: 60px; border: 1px solid var(--line); border-radius: 8px; padding: 8px; background: var(--bg); color: var(--fg); font-size: 13px; resize: vertical; direction: rtl; }
label.check { display: flex; gap: 6px; align-items: center; font-size: 13px; color: var(--fg); }
.muted { color: var(--muted); font-size: 12px; }
.status { background: var(--soft); border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; font-size: 13px; white-space: pre-wrap; }
.status.err { background: #fee2e2; color: #991b1b; }
.searches { font-size: 12px; color: var(--muted); margin: 4px 0 10px; }
.searches div:not(.video)::before { content: "🔎 "; }
.searches .video { font-size: 12px; margin-bottom: 3px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 10px; margin-bottom: 10px; }
.card h3 { margin: 0 0 6px; font-size: 13px; color: var(--accent); display: flex; gap: 6px; align-items: center; }
.card h3 span { flex: 1; }
.answer { white-space: pre-wrap; line-height: 1.55; font-size: 14px; }
.opt { display: inline-block; background: var(--soft); border-radius: 6px; padding: 2px 8px; margin-bottom: 6px; font-weight: 600; }
.mini { font-size: 12px; padding: 3px 8px; }
.ok { color: var(--ok); font-size: 12px; }
.bad { color: var(--err); font-size: 12px; }
.sources a { display: block; color: var(--accent); font-size: 12px; margin: 3px 0; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.story { white-space: pre-wrap; line-height: 1.7; font-size: 15px; background: var(--card); border-radius: 10px; padding: 12px; max-height: 60vh; overflow-y: auto; }
.fields div { font-size: 12px; border-bottom: 1px dashed var(--line); padding: 4px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toast { position: fixed; bottom: 20px; right: 20px; z-index: 2147483647; background: #111827; color: #fff; padding: 10px 14px; border-radius: 8px; font-size: 13px; direction: rtl; box-shadow: 0 4px 14px rgba(0,0,0,.3); }
.spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid var(--accent); border-top-color: transparent; border-radius: 50%; animation: spin .8s linear infinite; vertical-align: middle; margin-inline-end: 6px; }
@keyframes spin { to { transform: rotate(360deg); } }
`;
