import type { FillItem } from '../shared/types';
import { extractFrame } from './extract';
import { tryOpenStoryBar } from './extract/story';
import { undoFill } from './fill';
import { extractAllPages, fillAcrossPages } from './extract/pages';
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
};
Object.assign(globalThis, api);

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
