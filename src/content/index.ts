import type { FillItem } from '../shared/types';
import { extractFrame } from './extract';
import { tryOpenStoryBar } from './extract/story';
import { fillFields, undoFill } from './fill';
import { findFieldGroups } from './extract/fields';
import { extractAllPages, fillAcrossPages, navGoto, navOutline, onWalkProgress } from './extract/pages';
import { pageStructure } from './structure';
import { Panel } from './ui/panel';

// Runs in every frame. The background calls these through chrome.scripting.executeScript
// (same isolated world), so each frame answers for itself, including cross-origin iframes.
const api = {
  // Reads every page when the task has page buttons (1 2 3…), unless turned off in the settings.
  __sabExtract: (opts?: { allPages?: boolean }) => (opts?.allPages === false ? extractFrame() : extractAllPages()),
  __sabFill: (items: FillItem[]) => fillAcrossPages(items),
  __sabUndo: () => undoFill(),
  __sabOpenStory: () => tryOpenStoryBar(),
  __sabStructure: () => pageStructure(),
  // --- the background's page/tab walk (top frame answers; other frames return null) ---
  __sabNav: (op: { op: 'outline' | 'goto' | 'hide' | 'show'; page?: number; tab?: number }) => {
    if (window !== window.top) return null;
    if (op.op === 'outline') return navOutline();
    if (op.op === 'goto') return navGoto(op.page ?? 0, op.tab ?? 0);
    const host = document.getElementById('sab-helper-host');
    if (host) host.style.visibility = op.op === 'hide' ? 'hidden' : '';
    return true;
  },
  /** This frame's address, so the background can find the same iframe again after it is rebuilt. */
  __sabWhere: () => ({ url: location.href, top: window === window.top }),
  /** Fills fields of this frame by their position among the page's field groups. */
  __sabFillAt: (items: (FillItem & { pos: number })[]) => {
    const groups = findFieldGroups();
    return items.map((it) => {
      const g = groups[it.pos];
      if (!g) return { fieldId: it.fieldId, ok: false, message: 'השדה לא נמצא בדף' };
      const [res] = fillFields([{ ...it, fieldId: g.id }]);
      return { ...res, fieldId: it.fieldId };
    });
  },
};
Object.assign(globalThis, api);

// While walking through the task's pages, tell the background which page we're on (and when we're
// paused because the tab is in the background), so the panel can show it.
onWalkProgress((p) => {
  try {
    chrome.runtime.sendMessage({ type: 'walk-progress', ...p }).catch(() => {});
  } catch {
    /* extension was updated */
  }
});

const w = window as unknown as { __sabPanel?: Panel; __sabVersion?: string };
const isTop = window === window.top;
const version = chrome.runtime.getManifest().version;

// After the extension updates, the old panel in an open tab is dead: replace it with a new one.
if (isTop && w.__sabVersion !== version && document.documentElement) {
  document.querySelectorAll('#sab-helper-host').forEach((el) => el.remove());
  const panel = new Panel();
  w.__sabPanel = panel;
  w.__sabVersion = version;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'toggle') panel.toggle();
    if (msg?.type === 'solve-shortcut') panel.solve();
    if (msg?.type === 'fill-shortcut') panel.fillLast();
  });

  // Fallback for when Chrome didn't bind the shortcuts (taken by another extension).
  document.addEventListener(
    'keydown',
    (e) => {
      if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
      const k = e.code;
      if (k === 'KeyS') panel.toggle();
      else if (k === 'KeyA') panel.solve();
      else if (k === 'KeyF') panel.fillLast();
      else return;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
}
