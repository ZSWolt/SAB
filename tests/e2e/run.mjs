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
const geminiRequests = [];

function sse(res, events) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  res.end();
}

function toolEvents(body, name, input) {
  return [
    { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 1 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name, input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: input } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 200 } },
    { type: 'message_stop' },
  ];
}

let skipIframeField = true;

function mockAnswer(body) {
  const text = body.messages[0].content.map((c) => c.text ?? '').join('\n');
  const fields = JSON.parse(text.match(/<fields>\n([\s\S]*?)\n<\/fields>/)[1]);
  if (body.tools.some((t) => t.name === 'submit_review')) {
    const items = fields.filter((f) => f.already_filled).map((f) => ({
      question: 'שאלה 5', part: '', field_id: f.id, grade: 55, correct: 'הזכרת את הפרפרים', missing: 'חסר קשר לדמות הכלה', improved: 'תשובה משופרת מהבדיקה',
    }));
    return toolEvents(body, 'submit_review', JSON.stringify({ items, overall: 'כיוון טוב', sources: [] }));
  }
  // first time on the main task page: "forget" the field in the iframe, to test "complete the missing ones"
  const isOnly = text.includes('תענה **רק** עליהם');
  const visible = !isOnly && skipIframeField && fields.length === 3 ? fields.filter((f) => f.kind !== 'text') : fields;
  if (visible !== fields) skipIframeField = false;
  const answers = visible.map((f, i) => ({
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
  if (url.pathname === '/v1beta/interactions') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      geminiRequests.push({ body: JSON.parse(raw), headers: req.headers });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'בסרטון הסופר אומר: "כתבתי את הסיפור בקיץ".' }] }] }));
    });
    return;
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
  if (url.pathname === '/story.pdf') {
    res.writeHead(200, { 'content-type': 'application/pdf' });
    return res.end('%PDF-1.4\n% fake story pdf for the test\n%%EOF');
  }
  const file = { '/task.html': 'task.html', '/frame.html': 'frame.html', '/popup.html': 'popup.html', '/page2.html': 'page2.html', '/paged.html': 'paged.html' }[url.pathname];
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
    (base) =>
      chrome.storage.local.set({
        settings: { apiKey: 'sk-ant-test', apiBaseUrl: base, model: 'claude-opus-5-5', geminiApiKey: 'AIza-test', geminiBaseUrl: base },
      }),
    `http://localhost:${port}`,
  );
  // close the options tab opened on install
  for (const p of ctx.pages()) if (p.url().startsWith('chrome-extension://')) await p.close();

  const page = await ctx.newPage();
  if (process.env.SHOT) await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto(`http://localhost:${port}/task.html?attempt=7`);
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
  await page.waitForSelector('#sab-helper-host >> text=/1 סרטוני יוטיוב/');
  console.log('✓ scan: 3 fields (one in a cross-origin iframe) + hidden story');

  // solve
  await page.click('#sab-helper-host >> .btn.primary.big');
  await page.waitForSelector('#sab-helper-host >> text=/מוכן – 2 תשובות/', { timeout: 20000 });
  const req = requests.at(-1);
  const doc = req.body.messages[0].content.find((c) => c.type === 'document');
  assert.ok(doc, 'PDF sent as a document block');
  assert.equal(Buffer.from(doc.source.data, 'base64').toString().slice(0, 5), '%PDF-');
  const storyBlock = req.body.messages[0].content.find((c) => c.type === 'text' && c.text.includes('<story'));
  assert.deepEqual(storyBlock.cache_control, { type: 'ephemeral' }, 'story block is cached');
  await page.waitForSelector('#sab-helper-host >> text=/📄 נקרא/');
  console.log('✓ PDF linked in the task is downloaded and sent; story block marked for caching');

  await page.waitForSelector('#sab-helper-host >> text=/1 שדות לא קיבלו תשובה/');
  await page.click('#sab-helper-host >> text=השלם את החסר');
  await page.waitForSelector('#sab-helper-host >> text=/מוכן – 3 תשובות/', { timeout: 20000 });
  const onlyReq = requests.at(-1).body.messages[0].content.map((c) => c.text ?? '').join('\n');
  assert.ok(onlyReq.includes('תענה **רק** עליהם'));
  assert.equal(JSON.parse(onlyReq.match(/<fields>\n([\s\S]*?)\n<\/fields>/)[1]).length, 1);
  console.log('✓ missing-answer warning, and "complete the missing" answers only that field');
  const userText = req.body.messages[0].content.map((c) => c.text ?? '').join('\n');
  assert.ok(userText.includes('הכלה יצאה לצוד פרפרים'), 'story sent');
  const ws = req.body.tools.find((t) => t.type === 'web_search_20260209');
  assert.ok(ws, 'web search tool sent');
  assert.equal(ws.user_location, undefined, 'no user_location (the API rejects country IL)');
  assert.equal(req.body.thinking.type, 'adaptive');
  assert.equal(req.body.fallbacks, 'default');
  assert.ok(String(req.headers['anthropic-beta']).includes('server-side-fallback-2026-07-01'));
  await page.waitForSelector('#sab-helper-host >> text=עגנון פרס נובל שנה');
  const g = geminiRequests.at(-1);
  assert.ok(g, 'gemini called');
  assert.equal(g.headers['x-goog-api-key'], 'AIza-test');
  assert.deepEqual(g.body.input[0], { type: 'video', uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.ok(userText.includes('<video url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"'), 'video description sent to Claude');
  assert.ok(userText.includes('כתבתי את הסיפור בקיץ'));
  await page.waitForSelector('#sab-helper-host >> text=/🎬 נצפה/');
  console.log('✓ video: Gemini watched the YouTube video and Claude got the description');
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

  // same page again → saved answers, no new request
  const before = requests.length;
  await page.click('#sab-helper-host >> .tab >> text=משימה');
  await page.click('#sab-helper-host >> .btn.primary.big');
  await page.waitForSelector('#sab-helper-host >> text=/כבר פתרת את הדף הזה/');
  assert.equal(requests.length, before, 'no API call for an already solved page');
  console.log('✓ already solved page: saved answers shown for free');

  // page 2 of the same task (no story on it) → story comes from memory
  // (same tab, like clicking "next page")
  const page2 = page;
  await page2.goto(`http://localhost:${port}/page2.html?attempt=7`);
  await page2.waitForSelector('#sab-helper-host', { state: 'attached' });
  await page2.keyboard.press('Alt+Shift+A');
  await page2.waitForSelector('#sab-helper-host >> text=/מוכן – 1 תשובות/', { timeout: 20000 });
  const p2 = requests.at(-1).body.messages[0].content;
  const p2text = p2.map((c) => c.text ?? '').join('\n');
  assert.ok(p2text.includes('הכלה יצאה לצוד פרפרים'), 'story from page 1');
  assert.ok(p2.some((c) => c.type === 'document'), 'PDF from page 1');
  assert.ok(p2text.includes('<previous_pages'), 'earlier answers included');
  await page2.waitForSelector('#sab-helper-host >> text=/הסיפור נלקח מעמוד קודם/');
  console.log('✓ page 2: story + PDF + earlier answers remembered from page 1');

  // history tab
  await page2.click('#sab-helper-host >> .tab >> text=היסטוריה');
  await page2.waitForSelector('#sab-helper-host >> text=/הוצאה החודש/');
  await page2.waitForSelector('#sab-helper-host >> .hist >> text=משימה בספרות');
  console.log('✓ history tab lists the task with its cost');

  // check me
  await page2.fill('#q5', 'הפרפרים מסמלים חופש');
  await page2.click('#sab-helper-host >> .tab >> text=משימה');
  await page2.click('#sab-helper-host >> text=/בדוק אותי/');
  await page2.waitForSelector('#sab-helper-host >> text=/ציון ממוצע: 55/', { timeout: 20000 });
  const rv = requests.at(-1).body;
  assert.ok(rv.tools.some((t) => t.name === 'submit_review'));
  assert.ok(rv.messages[0].content.map((c) => c.text ?? '').join('\n').includes('הפרפרים מסמלים חופש'));
  await page2.click('#sab-helper-host >> text=/החלף בגרסה המשופרת/');
  await page2.waitForFunction(() => document.querySelector('#q5').value === 'תשובה משופרת מהבדיקה');
  console.log('✓ check-me: grade + comments, and "replace with improved" fills the field');
  // a task split into pages (buttons 3 2 1 at the bottom, the page HTML is rebuilt on every switch)
  await page.goto(`http://localhost:${port}/paged.html?attempt=99`);
  await page.waitForSelector('#sab-helper-host', { state: 'attached' });
  await page.evaluate(() => document.querySelector('.pager span[data-p="2"]').click()); // the student is on page 2
  await page.waitForFunction(() => window.__cur === 2);
  await page.keyboard.press('Alt+Shift+A');
  await page.waitForSelector('#sab-helper-host >> text=/מוכן – 3 תשובות/', { timeout: 30000 });
  const pagedText = requests.at(-1).body.messages[0].content.map((c) => c.text ?? '').join('\n');
  for (const t of ['מה שם הגיבור', 'מי כתב את הסיפור', 'באיזו שנה נכתב', 'עמוד 3 מתוך 3']) assert.ok(pagedText.includes(t), t);
  const pagedFields = JSON.parse(pagedText.match(/<fields>\n([\s\S]*?)\n<\/fields>/)[1]);
  assert.deepEqual(pagedFields.map((f) => [f.id.split(':')[1], f.page]), [['p1.0', 1], ['p2.0', 2], ['p3.0', 3]]);
  assert.equal(await page.evaluate(() => window.__cur), 2, 'back on the page the student was on');
  console.log('✓ paged task: read all 3 pages and went back to the page the student was on');

  await page.click('#sab-helper-host >> text=/מלא הכול בדף/');
  await page.waitForFunction(() => Object.keys(window.__state).length === 3, null, { timeout: 20000 });
  assert.deepEqual(await page.evaluate(() => window.__state), { 1: 'תשובה לבדיקה', 2: 'עגנון', 3: '1966' });
  await page.waitForFunction(() => window.__cur === 2);
  console.log('✓ paged task: filled answers on every page (text, radio, input) and returned to page 2');

  await page.goto(`http://localhost:${port}/task.html?attempt=7`);
  await page.waitForSelector('#sab-helper-host', { state: 'attached' });

  // popup window
  // (panel is closed after navigation, so the button is clickable)
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
