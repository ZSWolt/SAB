// End-to-end check in a real Chromium with the built extension and a mock Claude API.
// Run: npm run build && npm run e2e
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // pre-installed globally, or npm i -D playwright
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const dist = resolve('dist');
const requests = [];

function sse(res, events) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  res.end();
}

function mockAnswer(body) {
  const text = body.messages[0].content.map((c) => c.text ?? '').join('\n');
  const fields = JSON.parse(text.match(/<fields>\n([\s\S]*?)\n<\/fields>/)[1]);
  const answers = fields.map((f, i) => ({
    question: `שאלה ${i + 1}`,
    part: '',
    answer: f.kind === 'radio' ? 'כי הוא כתב אותו' : f.kind === 'text' ? '1966' : 'תשובה לבדיקה',
    field_id: f.id,
    option: f.kind === 'radio' ? 'עגנון' : null,
  }));
  const input = JSON.stringify({ answers, sources: [{ title: 'פרס נובל', url: 'https://www.nobelprize.org/' }], notes: '' });
  return [
    { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 1 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"עגנון פרס נובל שנה"}' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'submit_answers', input: {} } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: input.slice(0, 40) } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: input.slice(40) } },
    { type: 'content_block_stop', index: 1 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 200 } },
    { type: 'message_stop' },
  ];
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' });
    return res.end();
  }
  if (url.pathname === '/v1/messages') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw);
      requests.push({ body, headers: req.headers });
      sse(res, mockAnswer(body));
    });
    return;
  }
  const file = { '/task.html': 'task.html', '/frame.html': 'frame.html', '/popup.html': 'popup.html' }[url.pathname];
  if (!file) return res.writeHead(404).end();
  let html = readFileSync(resolve('tests/fixtures', file), 'utf8');
  // the iframe is served from another origin (127.0.0.1 vs localhost) to test cross-origin frames
  html = html.replace('__FRAME__', `http://127.0.0.1:${port}/frame.html`);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const ctx = await chromium.launchPersistentContext('', {
  headless: true,
  channel: 'chromium', // the new headless mode, which supports extensions
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
let ok = false;
try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  await sw.evaluate(
    (base) => chrome.storage.local.set({ settings: { apiKey: 'sk-ant-test', apiBaseUrl: base, model: 'claude-opus-5-5' } }),
    `http://localhost:${port}`,
  );
  // close the options tab opened on install
  for (const p of ctx.pages()) if (p.url().startsWith('chrome-extension://')) await p.close();

  const page = await ctx.newPage();
  if (process.env.SHOT) await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto(`http://localhost:${port}/task.html`);
  await page.waitForSelector('#sab-helper-host', { state: 'attached' });
  console.log('✓ button injected');

  await page.keyboard.press('Alt+Shift+S');
  await page.waitForSelector('#sab-helper-host >> .panel.open');
  console.log('✓ Alt+Shift+S opens the panel');
  await page.click('#sab-helper-host >> .head .icon[title^="סגור"]');
  await page.waitForSelector('#sab-helper-host >> .panel:not(.open)', { state: 'attached' });
  console.log('✓ ✕ closes the panel');

  // hide everything, then bring it back with the shortcut
  await page.hover('#sab-helper-host >> .fab');
  await page.click('#sab-helper-host >> .fab-x');
  await page.waitForSelector('#sab-helper-host >> .root[style*="none"]', { state: 'attached' });
  await page.keyboard.press('Alt+Shift+S');
  await page.waitForSelector('#sab-helper-host >> .panel.open');
  console.log('✓ hidden button comes back with Alt+Shift+S');

  // scan
  await page.click('#sab-helper-host >> text=בדוק מה זוהה');
  await page.waitForSelector('#sab-helper-host >> text=/נמצאו 3 שדות/');
  await page.waitForSelector('#sab-helper-host >> text=/זוהה סיפור/');
  console.log('✓ scan: 3 fields (one in a cross-origin iframe) + hidden story');

  // solve
  await page.click('#sab-helper-host >> .btn.primary.big');
  await page.waitForSelector('#sab-helper-host >> text=/מוכן – 3 תשובות/', { timeout: 20000 });
  const req = requests.at(-1);
  const userText = req.body.messages[0].content.map((c) => c.text ?? '').join('\n');
  assert.ok(userText.includes('הכלה יצאה לצוד פרפרים'), 'story sent');
  assert.ok(req.body.tools.some((t) => t.type === 'web_search_20260209'), 'web search tool sent');
  assert.equal(req.body.thinking.type, 'adaptive');
  assert.equal(req.body.fallbacks, 'default');
  assert.ok(String(req.headers['anthropic-beta']).includes('server-side-fallback-2026-07-01'));
  await page.waitForSelector('#sab-helper-host >> text=עגנון פרס נובל שנה');
  console.log('✓ solve: story + web search + answers shown');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });

  // fill
  await page.click('#sab-helper-host >> text=/מלא הכול בדף/');
  await page.waitForFunction(() => document.querySelector('#q1').value === 'תשובה לבדיקה');
  assert.equal(await page.isChecked('#q2b'), true);
  const frame = page.frames().find((f) => f.url().includes('frame.html'));
  await frame.waitForFunction(() => document.querySelector('#q3').value === '1966');
  console.log('✓ fill: textarea, radio and cross-origin iframe input');

  await page.click('#sab-helper-host >> text=/בטל מילוי/');
  await page.waitForFunction(() => document.querySelector('#q1').value === '');
  console.log('✓ undo fill');

  // popup window
  await page.keyboard.press('Alt+Shift+S'); // close panel so the button is clickable
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.click('#openTask')]);
  await popup.waitForLoadState();
  await popup.waitForSelector('#sab-helper-host', { state: 'attached' });
  await popup.keyboard.press('Alt+Shift+A');
  await popup.waitForSelector('#sab-helper-host >> text=/מוכן – 1 תשובות/', { timeout: 20000 });
  const popupText = requests.at(-1).body.messages[0].content.map((c) => c.text ?? '').join('\n');
  assert.ok(popupText.includes('<opener_window'), 'opener window context sent');
  assert.ok(popupText.includes('הכלה יצאה לצוד פרפרים'), 'story from opener sent');
  console.log('✓ popup window: panel injected, Alt+Shift+A solves, story from the opening window included');
  ok = true;
} finally {
  await ctx.close();
  server.close();
}
console.log(ok ? '\nALL E2E CHECKS PASSED' : '\nE2E FAILED');
process.exit(ok ? 0 : 1);
