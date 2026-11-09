import type { FillItem } from '../shared/types';
import { extractFrame } from './extract';
import { tryOpenStoryBar } from './extract/story';
import { fillFields, undoFill } from './fill';
import { pageStructure } from './structure';
import { Panel } from './ui/panel';

// Runs in every frame. The background calls these through chrome.scripting.executeScript
// (same isolated world), so each frame answers for itself, including cross-origin iframes.
const api = {
  __sabExtract: () => extractFrame(),
  __sabFill: (items: FillItem[]) => fillFields(items),
  __sabUndo: () => undoFill(),
  __sabOpenStory: () => tryOpenStoryBar(),
  __sabStructure: () => pageStructure(),
};
Object.assign(globalThis, api);

const w = window as unknown as { __sabPanel?: Panel };
const isTop = window === window.top;

if (isTop && !w.__sabPanel && document.documentElement) {
  const panel = new Panel();
  w.__sabPanel = panel;

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
