import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { buildUserText, systemPrompt } from '../ai/prompt';
import { solveWithClaude, SolveError, testKey } from '../ai/claude';
import { getSettings } from '../shared/settings';
import type { FillItem, FillOutcome, FrameSnapshot, PortMessage, SolveRequest, TaggedSnapshot } from '../shared/types';

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
      .filter((s) => s.fields.length || s.story || s.fullText.trim())
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
    return msg?.type === 'test-key';
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
      case 'open-options':
        chrome.runtime.openOptionsPage();
        return true;
    }
    return null;
  })().then(reply, () => reply(null));
  return true;
});

// ---------- solving (long-lived port keeps the service worker alive while streaming) ----------

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'solve') return;
  const tabId = port.sender?.tab?.id;
  const abort = new AbortController();
  let alive = true;
  port.onDisconnect.addListener(() => {
    alive = false;
    abort.abort();
  });
  const post = (m: PortMessage) => alive && port.postMessage(m);

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
      const fields = snaps.reduce((n, s) => n + s.fields.length, 0);
      const hasText = snaps.some((s) => s.fullText.trim() || s.story) || req.manualStory.trim() || req.screenshot;
      if (!hasText) throw new SolveError('לא הצלחתי לקרוא כלום מהדף. תרענן את הדף ותנסה שוב.');
      post({ type: 'scan', fields, frames: snaps.length, story: [...snaps, ...opener].some((s) => s.story) || !!req.manualStory.trim(), opener: opener.length > 0 });

      const content: BetaContentBlockParam[] = [];
      if (req.screenshot?.startsWith('data:image/')) {
        const [meta, data] = req.screenshot.split(',');
        const media = meta.includes('png') ? 'image/png' : 'image/jpeg';
        content.push({ type: 'image', source: { type: 'base64', media_type: media, data } });
        content.push({ type: 'text', text: 'למעלה: צילום מסך של המשימה כפי שהיא נראית עכשיו.' });
      }
      content.push({ type: 'text', text: buildUserText(snaps, opener, req.note, req.manualStory) });

      const result = await solveWithClaude(
        settings,
        systemPrompt(settings),
        content,
        {
          onSearch: (query) => post({ type: 'search', query }),
          onThinking: (text) => post({ type: 'thinking', text }),
          onStatus: (text) => post({ type: 'status', text }),
        },
        abort.signal,
      );
      const results = await getMap<unknown>('results');
      results[tabId] = result;
      await chrome.storage.session.set({ results });
      post({ type: 'result', result });

      if (settings.autoFill) await sendToTop(tabId, { type: 'fill-shortcut' });
    } catch (e) {
      post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (alive) port.disconnect();
    }
  });
});
