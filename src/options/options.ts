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
  const status = $('status');
  $('save').addEventListener('click', async () => {
    await saveSettings(read());
    status.textContent = '✅ נשמר';
    setTimeout(() => (status.textContent = ''), 2500);
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
