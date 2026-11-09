import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { buildChatContent, buildContent, chatSystemPrompt, collectStories, reviewSystemPrompt, systemPrompt, type PdfBlock, type StoryBlock } from '../ai/prompt';
import { chatWithClaude, reviewWithClaude, solveWithClaude, SolveError, testKey } from '../ai/claude';
import { checkCoverage, enrich, mergeResults } from './coverage';
import { fetchDocument } from './documents';
import { addCost, deleteTask, fieldsHash, findPage, getTask, listTasks, previousPagesSummary, savePage, taskKey } from './tasks';
import { testGeminiKey, watchVideoCached } from '../ai/gemini';
import { getSettings, saveSettings } from '../shared/settings';
import type { ChatMessage, DocumentRef, FillItem, FillOutcome, FrameSnapshot, PortMessage, SolveRequest, SolveResult, StepId, StepState, TaggedSnapshot } from '../shared/types';

// ---------- frames ----------

/** Runs one of the content-script functions in every frame of a tab and tags results by frame. */
async function inAllFrames<T>(tabId: number, fn: string, args: unknown[] = [], frameIds?: number[]) {
  const results = await chrome.scripting.executeScript({
    target: frameIds ? { tabId, frameIds } : { tabId, allFrames: true },
    func: (name: string, a: unknown[]) => {
      const f = (globalThis as unknown as Record<string, (...x: unknown[]) => unknown>)[name];
      return typeof f === 'function' ? f(...a) : null;
    },
    args: [fn, args],
  });
  return results
    .filter((r) => r.result !== null && r.result !== undefined)
    .map((r) => ({ frameId: r.frameId, result: r.result as T }));
}

async function collect(tabId: number, allPages = true): Promise<TaggedSnapshot[]> {
  try {
    const res = await inAllFrames<FrameSnapshot>(tabId, '__sabExtract', [{ allPages }]);
    return res
      .map(({ frameId, result }) => ({ ...result, frameId }))
      .filter((s) => s.fields.length || s.story || s.fullText.trim() || s.videos?.length || s.documents?.length)
      .sort((a, b) => Number(b.isTop) - Number(a.isTop) || a.frameId - b.frameId);
  } catch {
    return [];
  }
}

// ---------- per-tab session state ----------

type TabMap<T> = Record<number, T>;
async function getMap<T>(key: 'openers' | 'results' | 'chats'): Promise<TabMap<T>> {
  const got = await chrome.storage.session.get(key);
  return (got[key] as TabMap<T> | undefined) ?? {};
}

// ---------- popup / new-window tracking ----------
// Assignments often open in a new window. Remember which tab opened it, so the story or
// instructions from the original window are sent along.

chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.id === undefined || tab.openerTabId === undefined) return;
  const openers = await getMap<number>('openers');
  openers[tab.id] = tab.openerTabId;
  await chrome.storage.session.set({ openers });
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const openers = await getMap<number>('openers');
  const results = await getMap<unknown>('results');
  const chats = await getMap<unknown>('chats');
  delete chats[tabId];
  delete openers[tabId];
  delete results[tabId];
  await chrome.storage.session.set({ openers, results, chats });
});

async function openerOf(tabId: number): Promise<number | null> {
  const openers = await getMap<number>('openers');
  const id = openers[tabId];
  if (id === undefined) return null;
  try {
    await chrome.tabs.get(id);
    return id;
  } catch {
    return null;
  }
}

// ---------- commands (keyboard shortcuts) and toolbar icon ----------

async function sendToTop(tabId: number | undefined, msg: object) {
  if (tabId === undefined) return;
  try {
    await chrome.tabs.sendMessage(tabId, msg, { frameId: 0 });
  } catch {
    // Page loaded before the extension was installed/updated: inject and retry.
    try {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tabId, msg, { frameId: 0 });
    } catch {
      /* chrome:// pages etc. */
    }
  }
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  const tabId = tab?.id ?? (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
  const map: Record<string, string> = { 'toggle-panel': 'toggle', solve: 'solve-shortcut', fill: 'fill-shortcut' };
  if (map[command]) await sendToTop(tabId, { type: map[command] });
});

chrome.action.onClicked.addListener((tab) => sendToTop(tab.id, { type: 'toggle' }));

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
  // After an update, put the new content script into tabs that are already open.
  if (reason === 'update') {
    // v5: the dashboard's school look becomes the default; move "auto" over once
    const st = await getSettings();
    const { themeV5 } = await chrome.storage.local.get('themeV5');
    if (!themeV5) {
      if (st.theme === 'auto') await saveSettings({ theme: 'school' });
      await chrome.storage.local.set({ themeV5: true });
    }
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    for (const t of tabs) {
      if (t.id !== undefined) chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, files: ['content.js'] }).catch(() => {});
    }
  }
});

// ---------- auto-update (unpacked install) ----------
// The Windows updater replaces the files on disk; the extension notices the new build.json and reloads.
let activeSolves = 0;

async function reloadIfUpdatedOnDisk() {
  if (activeSolves > 0) return;
  try {
    const res = await fetch(chrome.runtime.getURL('build.json'), { cache: 'no-store' });
    const { version } = (await res.json()) as { version?: string };
    if (version && version !== chrome.runtime.getManifest().version) chrome.runtime.reload();
  } catch {
    /* no build.json: local dev build */
  }
}
chrome.alarms.create('sab-update-check', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => a.name === 'sab-update-check' && reloadIfUpdatedOnDisk());
chrome.runtime.onStartup.addListener(reloadIfUpdatedOnDisk);
(globalThis as unknown as { __sabCheckUpdate?: () => Promise<void> }).__sabCheckUpdate = reloadIfUpdatedOnDisk; // for tests

// ---------- one-shot messages from the panel ----------

function groupByFrame(items: FillItem[]) {
  const byFrame = new Map<number, FillItem[]>();
  for (const it of items) {
    const [frame, ...rest] = it.fieldId.split(':');
    const frameId = Number(frame);
    if (!Number.isFinite(frameId) || !rest.length) continue;
    const list = byFrame.get(frameId) ?? [];
    list.push({ ...it, fieldId: rest.join(':') });
    byFrame.set(frameId, list);
  }
  return byFrame;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = sender.tab?.id;
  // key checks come from the options page and from the panel's first-run "connect Claude" card
  if (msg?.type === 'test-key') {
    getSettings().then((s) => testKey({ ...s, ...msg.settings })).then(reply);
    return true;
  }
  if (msg?.type === 'test-gemini') {
    getSettings().then((s) => testGeminiKey({ ...s, ...msg.settings })).then(reply);
    return true;
  }
  if (tabId === undefined) return false;
  (async () => {
    switch (msg?.type) {
      case 'scan': {
        const opener = await openerOf(tabId);
        // Quick look without clicking through pages: free, and safe to run while a solve is going on.
        return { snapshots: await collect(tabId, false), opener: opener !== null ? await collect(opener, false) : [] };
      }
      case 'fill': {
        const out: FillOutcome[] = [];
        for (const [frameId, items] of groupByFrame(msg.items as FillItem[])) {
          const res = await inAllFrames<FillOutcome[]>(tabId, '__sabFill', [items], [frameId]).catch(() => []);
          const got = res[0]?.result ?? items.map((i) => ({ fieldId: i.fieldId, ok: false, message: 'המסגרת לא זמינה' }));
          out.push(...got.map((o) => ({ ...o, fieldId: `${frameId}:${o.fieldId}` })));
        }
        return out;
      }
      case 'undo': {
        const res = await inAllFrames<number>(tabId, '__sabUndo').catch(() => []);
        return res.reduce((n, r) => n + (r.result || 0), 0);
      }
      case 'open-story': {
        const res = await inAllFrames<string | null>(tabId, '__sabOpenStory').catch(() => []);
        return res.find((r) => r.result)?.result ?? null;
      }
      case 'structure':
        return (await inAllFrames<object>(tabId, '__sabStructure').catch(() => [])).map((r) => ({ frameId: r.frameId, ...r.result }));
      case 'walk-progress': {
        const p = msg as { page: number; total: number; waiting: boolean };
        livePorts.get(tabId)?.({
          type: 'step',
          id: 'pages',
          state: p.waiting ? 'pause' : 'run',
          label: `עמוד ${p.page} מתוך ${p.total}`,
          meta: p.waiting ? 'מחכה שתחזור ללשונית' : 'קורא',
        });
        return true;
      }
      case 'capture':
        // only the visible tab can be captured: if the student switched away, skip instead of capturing another tab
        if (!sender.tab?.active) return { dataUrl: null };
        try {
          return { dataUrl: await chrome.tabs.captureVisibleTab(sender.tab!.windowId, { format: 'jpeg', quality: 75 }) };
        } catch {
          return { dataUrl: null };
        }
      case 'get-last': {
        const results = await getMap<unknown>('results');
        return { result: results[tabId] ?? null };
      }
      case 'chat-load': {
        const chats = await getMap<ChatMessage[]>('chats');
        return chats[tabId] ?? [];
      }
      case 'chat-save': {
        const chats = await getMap<ChatMessage[]>('chats');
        chats[tabId] = (msg.chat as ChatMessage[]).slice(-40);
        await chrome.storage.session.set({ chats });
        return true;
      }
      case 'history-list':
        return listTasks();
      case 'history-delete':
        await deleteTask(msg.key);
        return listTasks();
      case 'history-open': {
        const task = await getTask(msg.key);
        const page = task?.pages.at(-1);
        return page ? { result: page.result, at: page.at, title: task!.title, url: task!.url } : null;
      }
      case 'open-options':
        chrome.runtime.openOptionsPage();
        return true;
    }
    return null;
  })().then(reply, () => reply(null));
  return true;
});

// ---------- solving (long-lived port keeps the service worker alive while streaming) ----------

const MAX_DOCS = 3;
/** Solve ports by tab, so page-walk progress from the content script reaches the right panel. */
const livePorts = new Map<number, (m: PortMessage) => void>();


async function readDocuments(refs: DocumentRef[], signal: AbortSignal, post: (m: PortMessage) => void) {
  const pdfs: PdfBlock[] = [];
  const texts: StoryBlock[] = [];
  const status: NonNullable<SolveResult['documents']> = [];
  for (const ref of refs.slice(0, MAX_DOCS)) {
    post({ type: 'status', text: `קורא את "${ref.title}"` });
    try {
      const doc = await fetchDocument(ref, signal);
      if (doc.kind === 'pdf') pdfs.push({ title: ref.title, base64: doc.base64 });
      else texts.push({ title: ref.title, text: doc.text });
      status.push({ title: ref.title, url: ref.url, ok: true });
    } catch (e) {
      status.push({ title: ref.title, url: ref.url, ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { pdfs, texts, status };
}

function uniqueDocs(snaps: TaggedSnapshot[], opener: TaggedSnapshot[], tabUrl?: string): DocumentRef[] {
  const out = new Map<string, DocumentRef>();
  if (tabUrl && /\.pdf(?:$|[?#])/i.test(tabUrl)) {
    const url = tabUrl.split('#')[0];
    out.set(url, { url, fetchUrl: url, kind: 'pdf', title: decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? 'PDF'), embedded: true });
  }
  for (const d of [...snaps, ...opener].flatMap((s) => s.documents ?? []).sort((a, b) => Number(b.embedded) - Number(a.embedded))) {
    if (!out.has(d.url)) out.set(d.url, d);
  }
  return [...out.values()];
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'solve') return;
  const tabId = port.sender?.tab?.id;
  const tabUrl = port.sender?.tab?.url;
  const abort = new AbortController();
  let alive = true;
  port.onDisconnect.addListener(() => {
    alive = false;
    abort.abort();
  });
  const post = (m: PortMessage) => alive && port.postMessage(m);
  const step = (id: StepId, state: StepState, label: string, meta?: string) => post({ type: 'step', id, state, label, meta });
  if (tabId !== undefined) livePorts.set(tabId, post);
  activeSolves++;
  // MV3 stops an idle service worker after ~30s; a pending fetch doesn't count as activity.
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20000);

  port.onMessage.addListener(async (req: SolveRequest) => {
    if (tabId === undefined) return;
    try {
      const settings = await getSettings();
      if (!settings.apiKey) throw new SolveError('צריך לחבר את Claude: מדביקים מפתח API במסך הפתיחה או בהגדרות');
      step('pages', 'run', 'קורא את הדף');
      const snaps = await collect(tabId, settings.readAllPages);
      const pagesRead = Math.max(1, ...snaps.map((s) => s.pages ?? 1));
      const markers = snaps.reduce((n, s) => n + (s.questionMarkers ?? 0), 0);
      const openerId = await openerOf(tabId);
      const opener = openerId !== null ? await collect(openerId, false) : [];
      const top = snaps.find((s) => s.isTop) ?? snaps[0];
      const pageUrl = top?.url ?? tabUrl ?? '';
      const key = taskKey(pageUrl);
      const hash = fieldsHash(snaps);
      const task = await getTask(key);
      const fields = snaps.reduce((n, s) => n + s.fields.length, 0);
      step('pages', 'done', pagesRead > 1 ? `קרא ${pagesRead} עמודים` : 'קרא את הדף', `${Math.max(fields, markers)} שאלות`);

      // --- check me: grade what the student already wrote ---
      if (req.mode === 'review' && !snaps.some((s) => s.fields.some((f) => f.value?.trim()))) {
        throw new SolveError('לא מצאתי בדף תשובות שכתבת. תכתוב קודם את התשובות שלך, ואז תלחץ "בדוק אותי".');
      }

      // --- already solved this exact page? show it for free ---
      const solvedPage = req.mode === 'solve' && !req.force && !req.onlyFields?.length ? findPage(task, hash) : null;
      if (solvedPage) {
        const results = await getMap<unknown>('results');
        results[tabId] = solvedPage.result;
        await chrome.storage.session.set({ results });
        post({ type: 'cached', result: solvedPage.result, at: solvedPage.at });
        return;
      }

      const hasText =
        snaps.some((s) => s.fullText.trim() || s.story || s.videos?.length || s.documents?.length) ||
        req.manualStory.trim() ||
        req.screenshot;
      if (!hasText) throw new SolveError('לא הצלחתי לקרוא כלום מהדף. תרענן את הדף ותנסה שוב.');

      // --- story & documents: from this page, or remembered from an earlier page of the task ---
      let stories = collectStories(snaps, opener, req.manualStory);
      let docRefs = uniqueDocs(snaps, opener, tabUrl);
      let storyFromMemory = false;
      if (!stories.length && !docRefs.length && task && (task.stories.length || task.documents.length)) {
        stories = task.stories;
        docRefs = task.documents;
        storyFromMemory = true;
      }
      const videoUrls = [...new Set([...snaps, ...opener].flatMap((s) => (s.videos ?? []).map((v) => v.url)))].slice(0, 4);
      post({
        type: 'scan',
        fields,
        frames: snaps.length,
        story: stories.length > 0,
        opener: opener.length > 0,
        videos: videoUrls.length,
        documents: docRefs.length,
        pages: Math.max(1, ...snaps.map((s) => s.pages ?? 1)),
      });

      if (stories.length || docRefs.length) step('story', 'run', 'סיפור ומסמכים', docRefs.length ? `${docRefs.length} מסמכים` : '');
      const docs = await readDocuments(docRefs, abort.signal, post);
      // Google Docs text joins the stories (keeps the cached block identical on later pages).
      const allStories = [...stories, ...docs.texts.filter((t) => !stories.some((s) => s.text === t.text))];
      if (allStories.length || docs.pdfs.length) {
        step('story', 'done', 'סיפור', storyFromMemory ? 'מעמוד קודם' : allStories[0]?.title?.slice(0, 40) || (docs.pdfs[0]?.title ?? ''));
      } else {
        step('story', 'skip', 'סיפור', docs.status.some((d) => !d.ok) ? 'המסמך לא נקרא' : 'לא נמצא');
      }

      // --- videos: Gemini watches (picture + sound) and describes them ---
      const videoNotes: { url: string; text: string }[] = [];
      const videoStatus: SolveResult['videos'] = [];
      let videoCost = 0;
      if (videoUrls.length && !settings.geminiApiKey) {
        for (const url of videoUrls) videoStatus.push({ url, ok: false, message: 'אין מפתח Gemini בהגדרות, אז הסרטון לא נצפה' });
        step('videos', 'skip', 'סרטון', 'אין מפתח Gemini');
      } else if (videoUrls.length) {
        const questions =
          snaps.flatMap((s) => s.fields.map((f) => f.context)).join('\n---\n') ||
          snaps.map((s) => s.fullText).join('\n').slice(0, 6000);
        for (const [i, url] of videoUrls.entries()) {
          step('videos', 'run', videoUrls.length > 1 ? `סרטון ${i + 1} מתוך ${videoUrls.length}` : 'סרטון', 'Gemini צופה');
          try {
            const v = await watchVideoCached(settings, url, questions, abort.signal, (text) => post({ type: 'status', text }));
            videoNotes.push({ url, text: v.text });
            videoStatus.push({ url, ok: true, message: v.cached ? 'מהזיכרון (בחינם)' : undefined });
            videoCost += v.costUsd;
          } catch (e) {
            videoStatus.push({ url, ok: false, message: e instanceof Error ? e.message : String(e) });
          }
        }
        const watched = videoStatus.filter((v) => v.ok).length;
        step('videos', watched ? 'done' : 'fail', videoUrls.length > 1 ? `${videoUrls.length} סרטונים` : 'סרטון', watched === videoUrls.length ? 'נצפה' : `${watched} מתוך ${videoUrls.length} נצפו`);
      }

      const content = buildContent({
        mode: req.mode,
        snaps,
        opener,
        note: req.note,
        stories: allStories,
        pdfs: docs.pdfs,
        videos: videoNotes,
        missingVideos: videoStatus,
        previousPages: req.mode === 'solve' ? previousPagesSummary(task, hash) : '',
        onlyFields: req.onlyFields,
        screenshot: req.screenshot,
      });
      let searches = 0;
      const callbacks = {
        onSearch: (query: string) => {
          searches++;
          step('search', 'run', 'מחפש', query.slice(0, 48));
          post({ type: 'search', query });
        },
        onThinking: (text: string) => post({ type: 'thinking', text }),
        onStatus: (text: string) => post({ type: 'status', text }),
      };
      step('write', 'run', req.mode === 'review' ? 'בודק את התשובות שלך' : 'כותב תשובות');
      const finishSteps = () => {
        if (searches) step('search', 'done', 'חיפש', `${searches} חיפושים`);
        step('write', 'done', req.mode === 'review' ? 'בדק' : 'כתב');
      };

      if (req.mode === 'review') {
        const review = await reviewWithClaude(settings, reviewSystemPrompt(settings), content, callbacks, abort.signal);
        finishSteps();
        review.items = enrich(review.items, snaps, true);
        review.costUsd += videoCost;
        await addCost(key, top?.title ?? '', pageUrl, review.costUsd);
        post({ type: 'review', review });
        return;
      }

      let result = await solveWithClaude(settings, systemPrompt(settings), content, callbacks, abort.signal);
      finishSteps();
      result.answers = enrich(result.answers, snaps);
      if (markers > fields) result.questionGap = { markers, fields };
      result.videos = videoStatus;
      result.documents = docs.status;
      result.storyFromMemory = storyFromMemory;
      result.costUsd += videoCost;
      const addedCost = result.costUsd;

      const results = await getMap<SolveResult>('results');
      if (req.onlyFields?.length && results[tabId]) result = mergeResults(results[tabId], result);
      Object.assign(result, checkCoverage(snaps, result));
      results[tabId] = result;
      await chrome.storage.session.set({ results });
      await savePage(
        key,
        { title: top?.title ?? '', url: pageUrl, stories: allStories, documents: docRefs },
        { url: pageUrl, fieldsHash: hash, result, at: Date.now() },
        addedCost,
      );
      post({ type: 'result', result });

      if (settings.autoFill) await sendToTop(tabId, { type: 'fill-shortcut' });
    } catch (e) {
      post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (tabId !== undefined && livePorts.get(tabId) === post) livePorts.delete(tabId);
      activeSolves = Math.max(0, activeSolves - 1);
      clearInterval(keepAlive);
      if (alive) port.disconnect();
    }
  });
});

// ---------- chat: talk with the assistant about the open task ----------

/** After a chat edit, keep the question text and page the old answer had. */
function carryOver(prev: SolveResult | null, answers: SolveResult['answers']) {
  const old = new Map((prev?.answers ?? []).filter((a) => a.field_id).map((a) => [a.field_id, a]));
  return answers.map((a) => {
    const o = a.field_id ? old.get(a.field_id) : undefined;
    return o ? { ...a, questionText: a.questionText ?? o.questionText, page: a.page ?? o.page } : a;
  });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'chat') return;
  const tabId = port.sender?.tab?.id;
  const tabUrl = port.sender?.tab?.url;
  const abort = new AbortController();
  let alive = true;
  port.onDisconnect.addListener(() => {
    alive = false;
    abort.abort();
  });
  const post = (m: PortMessage) => alive && port.postMessage(m);
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20000);

  port.onMessage.addListener(async (req: { messages: ChatMessage[] }) => {
    if (tabId === undefined) return;
    try {
      const settings = await getSettings();
      if (!settings.apiKey) throw new SolveError('צריך לחבר את Claude: מדביקים מפתח API במסך הפתיחה או בהגדרות');
      // a quick look only: never click through pages while chatting
      const snaps = await collect(tabId, false);
      const top = snaps.find((s) => s.isTop) ?? snaps[0];
      const pageUrl = top?.url ?? tabUrl ?? '';
      const key = taskKey(pageUrl);
      const task = await getTask(key);
      const results = await getMap<SolveResult>('results');
      let result: SolveResult | null = results[tabId] ?? null;
      let stories = collectStories(snaps, [], '');
      if (!stories.length && task?.stories.length) stories = task.stories;
      const hash = fieldsHash(snaps);

      const reply = await chatWithClaude(
        settings,
        chatSystemPrompt(settings),
        buildChatContent({ snaps, stories, result, previousPages: previousPagesSummary(task, hash) }, req.messages),
        {
          onSearch: (q) => post({ type: 'status', text: `מחפש: ${q}` }),
          onThinking: () => {},
          onStatus: (text) => post({ type: 'status', text }),
          onText: (text) => post({ type: 'chat-delta', text }),
        },
        abort.signal,
      );

      const answers = carryOver(result, enrich(reply.answers, snaps));
      if (answers.length) {
        const next: SolveResult = { answers, sources: [], notes: '', model: '', searches: [], videos: [], costUsd: reply.costUsd };
        result = result ? mergeResults(result, next) : next;
        Object.assign(result, checkCoverage(snaps, result));
        results[tabId] = result;
        await chrome.storage.session.set({ results });
        await savePage(
          key,
          { title: top?.title ?? '', url: pageUrl, stories, documents: task?.documents ?? [] },
          { url: pageUrl, fieldsHash: task?.pages.at(-1)?.fieldsHash ?? hash, result, at: Date.now() },
          reply.costUsd,
        );
      } else {
        await addCost(key, top?.title ?? '', pageUrl, reply.costUsd);
      }
      post({ type: 'chat-done', text: reply.text, answers, costUsd: reply.costUsd, result: answers.length ? result : null });
    } catch (e) {
      post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      clearInterval(keepAlive);
      if (alive) port.disconnect();
    }
  });
});
