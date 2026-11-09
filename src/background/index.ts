import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { buildContent, collectStories, reviewSystemPrompt, systemPrompt, type PdfBlock, type StoryBlock } from '../ai/prompt';
import { reviewWithClaude, solveWithClaude, SolveError, testKey } from '../ai/claude';
import { checkCoverage, mergeResults } from './coverage';
import { fetchDocument } from './documents';
import { addCost, deleteTask, fieldsHash, findPage, getTask, listTasks, previousPagesSummary, savePage, taskKey } from './tasks';
import { testGeminiKey, watchVideoCached } from '../ai/gemini';
import { getSettings } from '../shared/settings';
import type { DocumentRef, FillItem, FillOutcome, FrameSnapshot, PortMessage, SolveRequest, SolveResult, TaggedSnapshot } from '../shared/types';

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

async function collect(tabId: number): Promise<TaggedSnapshot[]> {
  try {
    const res = await inAllFrames<FrameSnapshot>(tabId, '__sabExtract');
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
async function getMap<T>(key: 'openers' | 'results'): Promise<TabMap<T>> {
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
  delete openers[tabId];
  delete results[tabId];
  await chrome.storage.session.set({ openers, results });
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
});

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
  if (tabId === undefined) {
    if (msg?.type === 'test-key') getSettings().then((s) => testKey({ ...s, ...msg.settings })).then(reply);
    if (msg?.type === 'test-gemini') getSettings().then((s) => testGeminiKey({ ...s, ...msg.settings })).then(reply);
    return msg?.type === 'test-key' || msg?.type === 'test-gemini';
  }
  (async () => {
    switch (msg?.type) {
      case 'scan': {
        const opener = await openerOf(tabId);
        return { snapshots: await collect(tabId), opener: opener !== null ? await collect(opener) : [] };
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
      case 'capture':
        try {
          return { dataUrl: await chrome.tabs.captureVisibleTab(sender.tab!.windowId, { format: 'jpeg', quality: 75 }) };
        } catch {
          return { dataUrl: null };
        }
      case 'get-last': {
        const results = await getMap<unknown>('results');
        return { result: results[tabId] ?? null };
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

async function readDocuments(refs: DocumentRef[], signal: AbortSignal, post: (m: PortMessage) => void) {
  const pdfs: PdfBlock[] = [];
  const texts: StoryBlock[] = [];
  const status: NonNullable<SolveResult['documents']> = [];
  for (const ref of refs.slice(0, MAX_DOCS)) {
    post({ type: 'status', text: `📄 קורא את "${ref.title}"…` });
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
  // MV3 stops an idle service worker after ~30s; a pending fetch doesn't count as activity.
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20000);

  port.onMessage.addListener(async (req: SolveRequest) => {
    if (tabId === undefined) return;
    try {
      const settings = await getSettings();
      if (!settings.apiKey) {
        chrome.runtime.openOptionsPage();
        throw new SolveError('צריך להכניס מפתח API של Claude בהגדרות (נפתח לך עכשיו).');
      }
      const snaps = await collect(tabId);
      const openerId = await openerOf(tabId);
      const opener = openerId !== null ? await collect(openerId) : [];
      const top = snaps.find((s) => s.isTop) ?? snaps[0];
      const pageUrl = top?.url ?? tabUrl ?? '';
      const key = taskKey(pageUrl);
      const hash = fieldsHash(snaps);
      const task = await getTask(key);
      const fields = snaps.reduce((n, s) => n + s.fields.length, 0);

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
      });

      const docs = await readDocuments(docRefs, abort.signal, post);
      // Google Docs text joins the stories (keeps the cached block identical on later pages).
      const allStories = [...stories, ...docs.texts.filter((t) => !stories.some((s) => s.text === t.text))];

      // --- videos: Gemini watches (picture + sound) and describes them ---
      const videoNotes: { url: string; text: string }[] = [];
      const videoStatus: SolveResult['videos'] = [];
      let videoCost = 0;
      if (videoUrls.length && !settings.geminiApiKey) {
        for (const url of videoUrls) videoStatus.push({ url, ok: false, message: 'אין מפתח Gemini בהגדרות – הסרטון לא נצפה' });
      } else if (videoUrls.length) {
        const questions =
          snaps.flatMap((s) => s.fields.map((f) => f.context)).join('\n---\n') ||
          snaps.map((s) => s.fullText).join('\n').slice(0, 6000);
        for (const [i, url] of videoUrls.entries()) {
          post({ type: 'status', text: `🎬 Gemini צופה בסרטון ${i + 1} מתוך ${videoUrls.length}… (סרטון ארוך יכול לקחת דקה-שתיים)` });
          try {
            const v = await watchVideoCached(settings, url, questions, abort.signal);
            videoNotes.push({ url, text: v.text });
            videoStatus.push({ url, ok: true, message: v.cached ? 'מהזיכרון (בחינם)' : undefined });
            videoCost += v.costUsd;
          } catch (e) {
            videoStatus.push({ url, ok: false, message: e instanceof Error ? e.message : String(e) });
          }
        }
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
      const callbacks = {
        onSearch: (query: string) => post({ type: 'search', query }),
        onThinking: (text: string) => post({ type: 'thinking', text }),
        onStatus: (text: string) => post({ type: 'status', text }),
      };
      post({ type: 'status', text: req.mode === 'review' ? 'Claude בודק את התשובות שלך…' : 'Claude עובד על התשובות…' });

      if (req.mode === 'review') {
        const review = await reviewWithClaude(settings, reviewSystemPrompt(settings), content, callbacks, abort.signal);
        review.costUsd += videoCost;
        await addCost(key, top?.title ?? '', pageUrl, review.costUsd);
        post({ type: 'review', review });
        return;
      }

      let result = await solveWithClaude(settings, systemPrompt(settings), content, callbacks, abort.signal);
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
      clearInterval(keepAlive);
      if (alive) port.disconnect();
    }
  });
});
