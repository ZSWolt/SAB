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

function mockChat(body) {
  const ctx = body.messages[0].content.map((c) => c.text ?? '').join('\n');
  const cur = ctx.match(/<current_answers[^>]*>\n([\s\S]*?)\n<\/current_answers>/);
  // like the model: "תשובה N" is the item labelled "שאלה N" in current_answers
  const last = body.messages.at(-1);
  const asked = (typeof last.content === 'string' ? last.content : last.content.map((c) => c.text ?? '').join(' ')).match(/תשובה (\d+)/)?.[1];
  const list = cur ? JSON.parse(cur[1]) : [];
  const first = asked ? list.find((a) => a.label === `שאלה ${asked}`) ?? null : null;
  const say = first ? `קיצרתי את תשובה ${asked}.` : 'הסיפור מספר על באדי.';
  const events = [
    { type: 'message_start', message: { id: 'msg_c', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 500, output_tokens: 1 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: say.slice(0, 6) } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: say.slice(6) } },
    { type: 'content_block_stop', index: 0 },
  ];
  if (first) {
    const input = JSON.stringify({ answers: [{ question: first.question, part: first.part, answer: 'תשובה קצרה מהשיחה', field_id: first.field_id, option: null }] });
    events.push(
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_c', name: 'update_answers', input: {} } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: input } },
      { type: 'content_block_stop', index: 1 },
    );
  }
  events.push({ type: 'message_delta', delta: { stop_reason: first ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 60 } }, { type: 'message_stop' });
  return events;
}

function mockAnswer(body) {
  if (body.tools.some((t) => t.name === 'update_answers')) return mockChat(body);
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
  // like the model: number each answer as the page does ("שאלה 3"), not by its place in this reply
  const answers = visible.map((f, i) => ({
    how: f.kind === 'richtext' ? 'להדביק בשולחן הכתיבה' : null,
    question: `שאלה ${(f.question_text ?? "").match(/שאלה (\d+)/)?.[1] ?? i + 1}`,
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
  if (url.pathname.startsWith('/v1/models/')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ id: 'claude-opus-5-5', type: 'model', display_name: 'Claude Opus 5.5', created_at: '2026-01-01T00:00:00Z' }));
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
  const file = { '/task.html': 'task.html', '/frame.html': 'frame.html', '/popup.html': 'popup.html', '/page2.html': 'page2.html', '/paged.html': 'paged.html', '/many.html': 'many.html', '/tabs.html': 'tabs.html', '/cet-history.html': 'cet-history.html', '/genially.html': 'genially.html', '/drag.html': 'drag.html' }[url.pathname];
  if (!file) return res.writeHead(404).end();
  let html = readFileSync(resolve('tests/fixtures', file), 'utf8');
  // the iframe is served from another origin (127.0.0.1 vs localhost) to test cross-origin frames
  html = html.replace('__FRAME__', `http://127.0.0.1:${port}/frame.html`).replace('__GENIALLY__', `http://127.0.0.1:${port}/genially.html`).replace('__DRAG__', `http://127.0.0.1:${port}/drag.html`);
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
const shot = async (p, name) => process.env.SHOT_DIR && p.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
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
  if (process.env.SHOT || process.env.SHOT_DIR) await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto(`http://localhost:${port}/task.html?attempt=7`);
  await page.waitForSelector('#sab-helper-host', { state: 'attached' });
  await page.waitForSelector('#sab-helper-host >> .fab');
  const fabBox = await page.evaluate(() => {
    const r = document.querySelector('#sab-helper-host').shadowRoot.querySelector('.fab').getBoundingClientRect();
    return { left: r.left, bottom: innerHeight - r.bottom, w: r.width, h: r.height };
  });
  assert.ok(fabBox.left >= 16 && fabBox.left <= 32 && fabBox.bottom >= 16 && fabBox.bottom <= 32 && fabBox.w === 56 && fabBox.h === 56, JSON.stringify(fabBox));
  console.log('✓ button injected: round 56px, bottom-left corner');

  await page.keyboard.press('Alt+Shift+S');
  await page.waitForSelector('#sab-helper-host >> .panel.open');
  await page.waitForTimeout(400);
  const panelLeft = await page.evaluate(() => document.querySelector('#sab-helper-host').shadowRoot.querySelector('.panel').getBoundingClientRect().left);
  assert.ok(Math.abs(panelLeft) < 2, `panel left ${panelLeft}`);
  console.log('✓ Alt+Shift+S opens the panel on the left side');
  await page.click('#sab-helper-host >> .head .icon-btn[title="סגור"]');
  await page.waitForSelector('#sab-helper-host >> .panel:not(.open)', { state: 'attached' });
  console.log('✓ ✕ closes the panel');

  // hide everything, then bring it back with the shortcut
  await page.hover('#sab-helper-host >> .fab');
  await page.click('#sab-helper-host >> .fab-x');
  await page.waitForSelector('#sab-helper-host >> .root[style*="none"]', { state: 'attached' });
  await page.keyboard.press('Alt+Shift+S');
  await page.waitForSelector('#sab-helper-host >> .panel.open');
  console.log('✓ hidden button comes back with Alt+Shift+S');

  // quick look runs by itself when the panel opens; "what was found" opens into tags and the question list
  await page.waitForSelector('#sab-helper-host >> .scan-head .ss >> text=/3 שאלות/');
  assert.equal(await page.evaluate(() => document.querySelector('#sab-helper-host').shadowRoot.querySelectorAll('.questions .item').length), 0, 'closed by default');
  await page.click('#sab-helper-host >> .scan-head');
  await page.waitForFunction(() => document.querySelector('#sab-helper-host').shadowRoot.querySelectorAll('.questions .item').length === 3);
  await page.waitForSelector('#sab-helper-host >> .tag >> text=/סיפור: /');
  await page.waitForSelector('#sab-helper-host >> .tag >> text=סרטון אחד');
  await page.waitForSelector('#sab-helper-host >> .questions >> text=/תאר את דמות הכלה/');
  console.log('✓ "what was found on the page": 3 fields (one in a cross-origin iframe) + hidden story');
  await shot(page, '1-scan');
  // "detect again": a question that shows up later is picked up by the always-visible button
  await page.click('#sab-helper-host >> .scan-head'); // close the card: the button stays visible
  await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div class="question" id="late"><p>שאלה 9: שאלה שנטענה מאוחר?</p><textarea></textarea></div>'));
  await page.click('#sab-helper-host >> .scan-again');
  await page.waitForSelector('#sab-helper-host >> .scan-head .ss >> text=/4 שאלות/');
  await page.waitForSelector('#sab-helper-host >> .toast >> text=/זוהו 4 שאלות \\(קודם 3\\)/');
  await page.evaluate(() => document.querySelector('#late').remove());
  await page.click('#sab-helper-host >> .tabbar >> text=תשובות');
  await page.click('#sab-helper-host >> .head button[title="זהה מחדש את הדף"]');
  await page.click('#sab-helper-host >> .tabbar >> text=לוח');
  await page.waitForSelector('#sab-helper-host >> .scan-head .ss >> text=/3 שאלות/');
  console.log('✓ "detect again" button (in the card and in the header) re-reads the page and says what changed');
  // story tab (story site: the fixture has the sab-story-site meta that stands in for classe.world)
  await page.click('#sab-helper-host >> .tabbar >> text=סיפור');
  await page.waitForSelector('#sab-helper-host >> article.story >> text=/הכלה יצאה לצוד פרפרים/');
  await page.waitForSelector('#sab-helper-host >> text=פתח את בר הסיפור');
  await page.click('#sab-helper-host >> .tabbar >> text=לוח');
  console.log('✓ story tab shows the detected story');

  // solve
  await page.click('#sab-helper-host >> .btn.primary.big');
  await page.waitForSelector('#sab-helper-host >> .rl >> text=2/3', { timeout: 20000 });
  const req = requests.at(-1);
  const doc = req.body.messages[0].content.find((c) => c.type === 'document');
  assert.ok(doc, 'PDF sent as a document block');
  assert.equal(Buffer.from(doc.source.data, 'base64').toString().slice(0, 5), '%PDF-');
  const storyBlock = req.body.messages[0].content.find((c) => c.type === 'text' && c.text.includes('<story'));
  assert.deepEqual(storyBlock.cache_control, { type: 'ephemeral' }, 'story block is cached');
  console.log('✓ PDF linked in the task is downloaded and sent; story block marked for caching');

  await page.waitForSelector('#sab-helper-host >> .tabbar button[data-tab="answers"][aria-selected="true"]');
  await page.waitForSelector('#sab-helper-host >> .answers .qbadge >> text=שאלה 1');
  await page.waitForSelector('#sab-helper-host >> .tabbar .tcount >> text=2');
  console.log('✓ results open the answers tab, each answer with its question number');
  await page.waitForSelector('#sab-helper-host >> .chip.bad >> text=חסר');
  await page.click('#sab-helper-host >> .seg >> text=/חסר/');
  assert.equal(await page.evaluate(() => document.querySelector('#sab-helper-host').shadowRoot.querySelectorAll('.answers .item').length), 1, 'filter shows only the missing one');
  await page.click('#sab-helper-host >> .seg >> text=/הכול/');
  console.log('✓ dashboard counters and filter (missing shows only the missing question)');
  await shot(page, '2-missing');
  await page.click('#sab-helper-host >> text=השלם חסר');
  await page.waitForSelector('#sab-helper-host >> .rl >> text=3/3', { timeout: 20000 });
  const onlyReq = requests.at(-1).body.messages[0].content.map((c) => c.text ?? '').join('\n');
  assert.ok(onlyReq.includes('תענה **רק** עליהם'));
  assert.equal(JSON.parse(onlyReq.match(/<fields>\n([\s\S]*?)\n<\/fields>/)[1]).length, 1);
  console.log('✓ missing-answer warning, and "complete the missing" answers only that field');
  // the completed question 3 sits in its place, not at the end
  const order = await page.evaluate(() => [...document.querySelector('#sab-helper-host').shadowRoot.querySelectorAll('.answers .qbadge')].map((b) => b.textContent));
  assert.deepEqual(order, ['שאלה 1', 'שאלה 2', 'שאלה 3'], `answers tab in question order: ${order}`);
  // each answer shows marked; the explanation only after "פירוט"
  const host = () => page.evaluate(() => document.querySelector('#sab-helper-host').shadowRoot.querySelector('.list.answers').textContent);
  assert.ok((await host()).includes('עגנון'), 'the chosen option is shown');
  assert.ok(!(await host()).includes('כי הוא כתב אותו'), 'explanation hidden until "פירוט"');
  await page.click('#sab-helper-host >> .answers .item >> nth=1 >> button.more');
  await page.waitForSelector('#sab-helper-host >> .answers .qmore >> text=כי הוא כתב אותו');
  await page.click('#sab-helper-host >> .answers .item >> nth=1 >> button.more');
  console.log('✓ answers tab: sorted by question number, answers marked, explanation behind "פירוט"');
  const userText = req.body.messages[0].content.map((c) => c.text ?? '').join('\n');
  assert.ok(userText.includes('הכלה יצאה לצוד פרפרים'), 'story sent');
  const ws = req.body.tools.find((t) => t.type === 'web_search_20260209');
  assert.ok(ws, 'web search tool sent');
  assert.equal(ws.user_location, undefined, 'no user_location (the API rejects country IL)');
  assert.equal(req.body.thinking.type, 'adaptive');
  assert.equal(req.body.fallbacks, 'default');
  assert.ok(String(req.headers['anthropic-beta']).includes('server-side-fallback-2026-07-01'));
  const g = geminiRequests.at(-1);
  assert.ok(g, 'gemini called');
  assert.equal(g.headers['x-goog-api-key'], 'AIza-test');
  assert.deepEqual(g.body.input[0], { type: 'video', uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.ok(userText.includes('<video url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"'), 'video description sent to Claude');
  assert.ok(userText.includes('כתבתי את הסיפור בקיץ'));
  console.log('✓ video: Gemini watched the YouTube video and Claude got the description');
  console.log('✓ solve: story + web search + answers shown');
  await shot(page, '3-answers');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });

  // fill
  await page.click('#sab-helper-host >> text=/מלא הכול בדף/');
  await page.waitForFunction(() => document.querySelector('#q1').value === 'תשובה לבדיקה');
  assert.equal(await page.isChecked('#q2b'), true);
  const frame = page.frames().find((f) => f.url().includes('frame.html'));
  await frame.waitForFunction(() => document.querySelector('#q3').value === '1966');
  console.log('✓ fill: textarea, radio and cross-origin iframe input');

  await page.click('#sab-helper-host >> button[title="בטל מילוי"]');
  await page.waitForFunction(() => document.querySelector('#q1').value === '');
  console.log('✓ undo fill');

  // chat tab: ask to shorten answer 1 → text streams in, an "updated" card, fill it, and the board shows it
  // the panel sends the answers on screen with the chat, so it works even if the tab's stored result is gone
  await sw.evaluate(async () => chrome.storage.session.set({ results: {} }));
  await page.click('#sab-helper-host >> .tabbar >> text=שיחה');
  await page.fill('#sab-helper-host >> .cbox textarea', 'תקצר את תשובה 1');
  await page.press('#sab-helper-host >> .cbox textarea', 'Enter');
  await page.waitForSelector('#sab-helper-host >> .msg-bot >> text=/קיצרתי את תשובה 1/', { timeout: 20000 });
  const chatReq = requests.at(-1).body;
  assert.ok(chatReq.tools.some((t) => t.name === 'update_answers'));
  assert.deepEqual(chatReq.messages[0].content[0].cache_control, { type: 'ephemeral' }, 'chat context is cached');
  const chatCtx = chatReq.messages[0].content.map((c) => c.text ?? '').join('\n');
  const sent = JSON.parse(chatCtx.match(/<current_answers[^>]*>\n([\s\S]*?)\n<\/current_answers>/)[1]);
  assert.deepEqual(sent.map((a) => a.label), ['שאלה 1', 'שאלה 2', 'שאלה 3'], 'answers numbered like the answers tab');
  assert.equal(sent[0].answer, 'תשובה לבדיקה', 'the chat knows the answer already written');
  await page.waitForSelector('#sab-helper-host >> .upd >> text=תשובה קצרה מהשיחה');
  await shot(page, '6-chat');
  await page.click('#sab-helper-host >> .upd >> text=מלא בשדה');
  await page.waitForFunction(() => document.querySelector('#q1').value === 'תשובה קצרה מהשיחה');
  await page.click('#sab-helper-host >> .tabbar >> text=תשובות');
  await page.waitForSelector('#sab-helper-host >> .answers >> text=תשובה קצרה מהשיחה');
  console.log('✓ chat tab: streamed reply, updated answer card, fill, and the answers tab shows the new answer');

  // board after a result: summary card that leads to the answers
  await page.click('#sab-helper-host >> .tabbar >> text=לוח');
  await page.click('#sab-helper-host >> text=פתח את התשובות');
  await page.waitForSelector('#sab-helper-host >> .tabbar button[data-tab="answers"][aria-selected="true"]');
  await page.click('#sab-helper-host >> .tabbar >> text=לוח');

  // same page again → saved answers, no new request
  const before = requests.length;
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
  await page2.waitForSelector('#sab-helper-host >> .rl >> text=1/1', { timeout: 20000 });
  const p2 = requests.at(-1).body.messages[0].content;
  const p2text = p2.map((c) => c.text ?? '').join('\n');
  assert.ok(p2text.includes('הכלה יצאה לצוד פרפרים'), 'story from page 1');
  assert.ok(p2.some((c) => c.type === 'document'), 'PDF from page 1');
  assert.ok(p2text.includes('<previous_pages'), 'earlier answers included');
  await page2.waitForSelector('#sab-helper-host >> text=/הסיפור נלקח מעמוד קודם/');
  console.log('✓ page 2: story + PDF + earlier answers remembered from page 1');

  // history tab
  await page2.click('#sab-helper-host >> .tabbar >> text=היסטוריה');
  await page2.waitForSelector('#sab-helper-host >> text=/הוצאה החודש/');
  await page2.waitForSelector('#sab-helper-host >> .hist >> text=משימה בספרות');
  await shot(page2, '5-history');
  console.log('✓ history tab lists the task with its cost');

  // check me
  await page2.fill('#q5', 'הפרפרים מסמלים חופש');
  await page2.click('#sab-helper-host >> .tabbar >> text=לוח');
  await page2.click('#sab-helper-host >> .btn.review');
  await page2.waitForSelector('#sab-helper-host >> text=/ציון ממוצע 55/', { timeout: 20000 });
  await page2.waitForSelector('#sab-helper-host >> .tabbar button[data-tab="answers"][aria-selected="true"]');
  await page2.waitForSelector('#sab-helper-host >> .reviews .qbadge >> text=שאלה 5');
  // both answers and grades exist → a switch between them
  await page2.click('#sab-helper-host >> .seg >> text=תשובות');
  await page2.waitForSelector('#sab-helper-host >> .list.answers');
  await page2.click('#sab-helper-host >> .seg >> text=ציונים');
  await page2.waitForSelector('#sab-helper-host >> .list.reviews');
  console.log('✓ check-me grades show in the answers tab, with a switch to the answers');
  await page2.waitForSelector('#sab-helper-host >> .reviews >> text=/מה הקשר בין הפרפרים לכלה/');
  await page2.waitForSelector('#sab-helper-host >> text=/כתבת: הפרפרים מסמלים חופש/');
  console.log('✓ check-me shows the real question text and what the student wrote');
  const rv = requests.at(-1).body;
  assert.ok(rv.tools.some((t) => t.name === 'submit_review'));
  assert.ok(rv.messages[0].content.map((c) => c.text ?? '').join('\n').includes('הפרפרים מסמלים חופש'));
  await shot(page2, '4-review');
  await page2.click('#sab-helper-host >> .reviews button.crow >> nth=0');
  await page2.click('#sab-helper-host >> text=/החלף בגרסה המשופרת/');
  await page2.waitForFunction(() => document.querySelector('#q5').value === 'תשובה משופרת מהבדיקה');
  console.log('✓ check-me: grade + comments, and "replace with improved" fills the field');
  // a task split into pages (buttons 3 2 1 at the bottom, the page HTML is rebuilt on every switch)
  await page.goto(`http://localhost:${port}/paged.html?attempt=99`);
  await page.waitForSelector('#sab-helper-host', { state: 'attached' });
  await page.evaluate(() => document.querySelector('.pager span[data-p="2"]').click()); // the student is on page 2
  await page.waitForFunction(() => window.__cur === 2);
  await page.keyboard.press('Alt+Shift+A');
  await page.waitForSelector('#sab-helper-host >> .card >> text=/עמוד \\d מתוך 3/', { timeout: 10000 });
  await page.waitForTimeout(400);
  await shot(page, '2-working');
  console.log('✓ working screen shows live page progress ("עמוד N מתוך 3")');
  await page.waitForSelector('#sab-helper-host >> .rl >> text=3/3', { timeout: 30000 });
  const pagedText = requests.at(-1).body.messages[0].content.map((c) => c.text ?? '').join('\n');
  for (const t of ['מה שם הגיבור', 'מי כתב את הסיפור', 'באיזו שנה נכתב', 'עמוד 3 מתוך 3']) assert.ok(pagedText.includes(t), t);
  const pagedFields = JSON.parse(pagedText.match(/<fields>\n([\s\S]*?)\n<\/fields>/)[1]);
  assert.deepEqual(pagedFields.map((f) => [f.id.split(':').slice(1).join(':'), f.page]), [['w|p1.t0|top|0', 1], ['w|p2.t0|top|0', 2], ['w|p3.t0|top|0', 3]]);
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
  await popup.waitForSelector('#sab-helper-host >> .rl >> text=1/1', { timeout: 20000 });
  const popupText = requests.at(-1).body.messages[0].content.map((c) => c.text ?? '').join('\n');
  assert.ok(popupText.includes('<opener_window'), 'opener window context sent');
  assert.ok(popupText.includes('הכלה יצאה לצוד פרפרים'), 'story from opener sent');
  console.log('✓ popup window: panel injected, Alt+Shift+A solves, story from the opening window included');
  // theme switch from the settings sheet
  await page.keyboard.press('Alt+Shift+S');
  await page.click('#sab-helper-host >> button[title="הגדרות"]');
  await page.click('#sab-helper-host >> .swatch >> text=כהה');
  await page.waitForSelector('#sab-helper-host >> .root[data-theme="focus"]', { state: 'attached' });
  await page.click('#sab-helper-host >> .swatch >> text=בית ספר');
  await page.waitForSelector('#sab-helper-host >> .root[data-theme="school"]', { state: 'attached' });
  console.log('✓ theme switch in the settings sheet (focus, school)');

  // screenshots of every look
  if (process.env.SHOT_DIR) {
    await page.setViewportSize({ width: 1100, height: 760 });
    for (const theme of ['notebook', 'focus', 'school']) {
      await sw.evaluate(async (t) => {
        const { settings } = await chrome.storage.local.get('settings');
        await chrome.storage.local.set({ settings: { ...settings, theme: t } });
      }, theme);
      await page.waitForSelector(`#sab-helper-host >> .root[data-theme="${theme}"]`, { state: 'attached' });
      await page.click('#sab-helper-host >> button[title="חזרה"]').catch(() => {});
      await page.click('#sab-helper-host >> .tabbar >> text=לוח');
      await page.waitForTimeout(150);
      await shot(page, `t-${theme}-1-board`);
      await page.click('#sab-helper-host >> .tabbar >> text=תשובות');
      await page.click('#sab-helper-host >> .answers button.more >> nth=1').catch(() => {});
      await shot(page, `t-${theme}-2-answers`);
      for (const [tab, name] of [['שיחה', '4-chat'], ['סיפור', '3-story'], ['היסטוריה', '3-history']]) {
        await page.click(`#sab-helper-host >> .tabbar >> text=${tab}`);
        await page.waitForTimeout(200);
        await shot(page, `t-${theme}-${name}`);
      }
      await page.click('#sab-helper-host >> button[title="הגדרות"]');
      await page.waitForTimeout(200);
      await shot(page, `t-${theme}-3-settings`);
      await page.click('#sab-helper-host >> button[title="חזרה"]');
    }
    await sw.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, theme: 'auto' } });
    });
  }

  // CET history: section tabs at the top (המשימה | מפת מקורות | שולחן כתיבה | שיתוף), all read
  const tabsPage = await ctx.newPage();
  await tabsPage.goto(`http://localhost:${port}/tabs.html`);
  await tabsPage.waitForSelector('#sab-helper-host', { state: 'attached' });
  await tabsPage.click('a[data-t="3"]'); // the student is on the writing desk
  await tabsPage.waitForFunction(() => window.__tab === 3 && document.querySelector('#main h2')?.textContent === 'שולחן כתיבה');
  await tabsPage.keyboard.press('Alt+Shift+A');
  await tabsPage.waitForSelector('#sab-helper-host >> .rl >> text=3/3', { timeout: 30000 });
  const tabsText = requests.at(-1).body.messages[0].content.map((c) => c.text ?? '').join('\n');
  for (const t of ['מה הייתה מטרת הדיון', 'מקור א: פרוטוקול מועצת העם', 'האם הייתה הצבעה', 'מי קרא את ההכרזה', 'לשונית "מפת מקורות"']) assert.ok(tabsText.includes(t), t);
  assert.ok(!tabsText.includes('מייל של חבר'), 'the share tab is skipped');
  const tabFields = JSON.parse(tabsText.match(/<fields>\n([\s\S]*?)\n<\/fields>/)[1]);
  assert.deepEqual(tabFields.map((f) => [f.id.split(':').slice(1).join(':'), f.section]), [['w|p1.t1|top|0', 'המשימה'], ['w|p1.t3|top|0', 'שולחן כתיבה'], ['w|p1.t3|top|1', 'שולחן כתיבה']]);
  assert.equal(await tabsPage.evaluate(() => window.__tab), 3, 'back on the tab the student was on');
  await tabsPage.waitForSelector('#sab-helper-host >> .answers .qpage >> text=שולחן כתיבה');
  console.log('✓ CET section tabs: read every tab (not "שיתוף") and went back to the writing desk');
  await tabsPage.click('#sab-helper-host >> text=/מלא הכול בדף/');
  await tabsPage.waitForFunction(() => Object.keys(window.__vals).length === 3, null, { timeout: 20000 });
  assert.deepEqual(await tabsPage.evaluate(() => window.__vals), { a: 'תשובה לבדיקה', b: 'תשובה לבדיקה', c: 'עגנון' });
  await tabsPage.waitForFunction(() => window.__tab === 3);
  console.log('✓ CET section tabs: filled answers on every tab and returned to the writing desk');
  await tabsPage.close();

  // CET history as in the real task: pages 1-4 at the bottom, tabs on pages 3-4, a writing desk
  // with an editor toolbar, a sources map with "+ idea" boxes, and a drag activity without fields
  const hist = await ctx.newPage();
  await hist.goto(`http://localhost:${port}/cet-history.html`);
  await hist.waitForSelector('#sab-helper-host', { state: 'attached' });
  await hist.evaluate(() => document.querySelector('#pager span[data-p="3"]').click());
  await hist.waitForFunction(() => window.__page === 3 && document.querySelector('a[data-t="3"]'));
  await hist.click('a[data-t="3"]');
  await hist.waitForFunction(() => window.__tab === 3 && document.querySelector('#edframe'));
  await hist.keyboard.press('Alt+Shift+A');
  await hist.waitForSelector('#sab-helper-host >> .rl >> text=1/1', { timeout: 40000 });
  const histText = requests.at(-1).body.messages[0].content.map((c) => c.text ?? '').join('\n');
  const histFields = JSON.parse(histText.match(/<fields>\n([\s\S]*?)\n<\/fields>/)[1]);
  assert.deepEqual(histFields.map((f) => [f.id.split(':').slice(1).join(':').replace(/\|f[^|]+\|/, '|IFRAME|'), f.kind, f.page, f.section]), [['w|p3.t3|IFRAME|0', 'richtext', 3, 'שולחן כתיבה']], `only the essay editor is a question: ${JSON.stringify(histFields)}`);
  assert.ok(histFields[0].question_text.includes('האם התקיימה או לא התקיימה הצבעה'), 'the editor carries the task question');
  for (const t of ['אניטה שפירא', 'שאלה 4 (32 נקודות)', 'עמוד 3 מתוך 4 · לשונית "מפת מקורות"', 'סכנת הפלישה של צבאות ערב מוקטנת בעיני הבריטים', 'אחה"ב מתנגדת להכרזה']) assert.ok(histText.includes(t), `read: ${t}`);
  const histImages = requests.at(-1).body.messages[0].content.filter((c) => c.type === 'image');
  assert.ok(histImages.length >= 1, 'pictures of the activities sent');
  assert.equal(histText.split('לשונית "שולחן כתיבה" ===').length - 1, 1, 'the writing desk on page 4 is the same one: read once');
  assert.ok(!histText.includes('מייל של חבר'), 'share tab skipped');
  assert.deepEqual(await hist.evaluate(() => [window.__page, window.__tab]), [3, 3], 'back on page 3, writing desk');
  await hist.waitForSelector('#sab-helper-host >> .ahow >> text=להדביק בשולחן הכתיבה');
  await hist.setViewportSize({ width: 1100, height: 760 });
  await shot(hist, '9-cet-history');
  assert.equal(await hist.evaluate(() => document.querySelector('#sab-helper-host').shadowRoot.querySelectorAll('.chip.bad').length), 0, 'nothing marked missing');
  console.log('✓ CET history: pages then tabs, only the real question (no toolbar / "+ idea" boxes), nothing missing, "מה לעשות" shown');
  await hist.click('#sab-helper-host >> text=/מלא הכול בדף/');
  await hist.waitForFunction(() => window.__vals.essay === 'תשובה לבדיקה', null, { timeout: 20000 });
  await hist.waitForFunction(() => window.__page === 3 && window.__tab === 3);
  console.log('✓ CET history: the essay is filled into the writing desk editor (an iframe), after going back to its page and tab');
  // diagnostic report
  await hist.click('#sab-helper-host >> .tabbar >> text=לוח');
  await hist.click('#sab-helper-host >> .scan-head');
  const [dl] = await Promise.all([hist.waitForEvent('download'), hist.click('#sab-helper-host >> text=דוח אבחון')]);
  const report = JSON.parse(readFileSync(await dl.path(), 'utf8'));
  assert.equal(report.report, 'sab-diagnostics');
  assert.ok(report.walk.units.length >= 5 && report.walk.units.some((u) => u.heading.includes('שולחן כתיבה')), 'walk units in the report');
  assert.ok(report.lastResult.answers.length === 1 && report.outline.pages === 4, 'answers and outline in the report');
  assert.ok(!JSON.stringify(report).includes('תשובה לבדיקה'), 'no answer text in the report');
  console.log('✓ diagnostic report: outline, what was read on each page/tab, numbering, no answer text');
  await hist.close();

  // a long task on a site that isn't classe: no story is picked up, and the answers tab scrolls
  const many = await ctx.newPage();
  await many.setViewportSize({ width: 1100, height: 700 });
  await many.goto(`http://localhost:${port}/many.html`);
  await many.waitForSelector('#sab-helper-host', { state: 'attached' });
  await many.keyboard.press('Alt+Shift+S');
  await many.waitForSelector('#sab-helper-host >> .scan-head .ss >> text=/15 שאלות/');
  assert.ok(!(await many.evaluate(() => document.querySelector('#sab-helper-host').shadowRoot.querySelector('.scan-head .ss').textContent)).includes('סיפור'), 'no story off classe');
  await many.click('#sab-helper-host >> .tabbar >> text=סיפור');
  await many.waitForSelector('#sab-helper-host >> text=/זיהוי אוטומטי של סיפור פועל רק בספרות/');
  assert.equal(await many.isVisible('#sab-helper-host >> text=פתח את בר הסיפור'), false);
  console.log('✓ off classe: no automatic story, the story tab offers pick / paste');
  await many.click('#sab-helper-host >> .tabbar >> text=לוח');
  await many.click('#sab-helper-host >> .btn.primary.big');
  await many.waitForSelector('#sab-helper-host >> .rl >> text=15/15', { timeout: 20000 });
  const manyStory = requests.at(-1).body.messages[0].content.map((c) => c.text ?? '').join('\n');
  assert.ok(!manyStory.includes('<story'), 'no story sent off classe');
  await many.waitForSelector('#sab-helper-host >> .answers .qbadge >> text=שאלה 15');
  const scroll = await many.evaluate(async () => {
    const body = document.querySelector('#sab-helper-host').shadowRoot.querySelector('.body');
    const before = body.scrollTop;
    body.scrollTop = 10000;
    await new Promise((r) => setTimeout(r, 50));
    return { sh: body.scrollHeight, ch: body.clientHeight, before, after: body.scrollTop };
  });
  assert.ok(scroll.sh > scroll.ch && scroll.after > scroll.before, `answers tab scrolls ${JSON.stringify(scroll)}`);
  // the mouse wheel scrolls it too
  await many.evaluate(() => (document.querySelector('#sab-helper-host').shadowRoot.querySelector('.body').scrollTop = 0));
  await many.mouse.move(200, 400);
  await many.mouse.wheel(0, 600);
  await many.waitForTimeout(300);
  assert.ok(await many.evaluate(() => document.querySelector('#sab-helper-host').shadowRoot.querySelector('.body').scrollTop) > 0, 'wheel scrolls the answers tab');
  const lastVisible = await many.evaluate(() => {
    const body = document.querySelector('#sab-helper-host').shadowRoot.querySelector('.body');
    body.scrollTop = 10000;
    const items = body.querySelectorAll('.answers .item');
    const r = items[items.length - 1].getBoundingClientRect();
    const b = body.getBoundingClientRect();
    return r.bottom <= b.bottom + 1 && r.top >= b.top;
  });
  assert.ok(lastVisible, 'question 15 can be scrolled into view');
  await shot(many, '8-scroll');
  console.log('✓ answers tab scrolls (15 questions, wheel and to the last one)');
  await many.close();

  // first run: no key → "connect Claude" card, paste the key in the panel
  await sw.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, apiKey: '' } });
  });
  const fresh = await ctx.newPage();
  await fresh.goto(`http://localhost:${port}/page2.html`);
  await fresh.waitForSelector('#sab-helper-host', { state: 'attached' });
  await fresh.keyboard.press('Alt+Shift+S');
  await fresh.waitForSelector('#sab-helper-host >> text=חבר את Claude');
  assert.equal(await fresh.isDisabled('#sab-helper-host >> .btn.primary.big'), true, 'solve is disabled without a key');
  await fresh.waitForTimeout(400);
  await shot(fresh, '0-connect');
  await fresh.fill('#sab-helper-host >> .connect input', 'sk-ant-test');
  await fresh.click('#sab-helper-host >> text=שמור ובדוק');
  await fresh.waitForSelector('#sab-helper-host >> text=חבר את Claude', { state: 'detached' });
  assert.equal(await fresh.isDisabled('#sab-helper-host >> .btn.primary.big'), false);
  assert.equal(await sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings.apiKey), 'sk-ant-test');
  console.log('✓ first run: connect Claude from the panel, key checked and saved');
  await fresh.close();

  if (process.env.SHOT_DIR) {
    const id = new URL(sw.url()).host;
    const op = await ctx.newPage();
    await op.setViewportSize({ width: 900, height: 1100 });
    await op.goto(`chrome-extension://${id}/options.html`);
    await op.waitForTimeout(300);
    await shot(op, '6-options');
    await op.emulateMedia({ colorScheme: 'dark' });
    await op.reload();
    await op.waitForTimeout(300);
    await shot(op, '7-options-dark');
    await op.close();
  }
  ok = true;
} finally {
  await ctx.close();
  server.close();
}
console.log(ok ? '\nALL E2E CHECKS PASSED' : '\nE2E FAILED');
process.exit(ok ? 0 : 1);
