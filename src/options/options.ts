import { loadFonts } from '../content/ui/fonts';
import { resolveTheme } from '../content/ui/store';
import { DEFAULT_SETTINGS, GEMINI_MODELS, getSettings, MODELS, saveSettings, type Settings } from '../shared/settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const keys = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

function read(): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const el = $<HTMLInputElement>(k);
    if (!el) continue;
    out[k] = el.type === 'checkbox' ? el.checked : el.value.trim();
  }
  return out as Partial<Settings>;
}

async function init() {
  loadFonts();
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  const model = $<HTMLSelectElement>('model');
  for (const m of MODELS) model.append(new Option(m.label, m.id));
  const gModel = $<HTMLSelectElement>('geminiModel');
  for (const m of GEMINI_MODELS) gModel.append(new Option(m.label, m.id));
  const s = await getSettings();
  for (const k of keys) {
    const el = $<HTMLInputElement>(k);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = Boolean(s[k]);
    else el.value = String(s[k] ?? '');
  }
  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  const themeSel = $<HTMLSelectElement>('theme');
  const applyTheme = () => (document.documentElement.dataset.theme = resolveTheme(themeSel.value as Settings['theme'], dark.matches));
  applyTheme();
  themeSel.addEventListener('change', async () => {
    applyTheme();
    await saveSettings({ theme: themeSel.value as Settings['theme'] });
  });
  dark.addEventListener('change', applyTheme);
  const status = $('status');
  const saved = $('saved');
  $('save').addEventListener('click', async () => {
    await saveSettings(read());
    saved.textContent = 'נשמר';
    setTimeout(() => (saved.textContent = ''), 2500);
  });
  $('test').addEventListener('click', async () => {
    status.textContent = 'בודק…';
    status.textContent = await chrome.runtime.sendMessage({ type: 'test-key', settings: read() });
  });
  $('testGemini').addEventListener('click', async () => {
    const gs = $('geminiStatus');
    gs.textContent = 'בודק…';
    gs.textContent = await chrome.runtime.sendMessage({ type: 'test-gemini', settings: read() });
  });
  $('shortcuts').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
}
init();
