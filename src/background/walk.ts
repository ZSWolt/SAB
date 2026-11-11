import type { FrameSnapshot, TaggedSnapshot } from '../shared/types';
import { firstQuestion, looksLikeQuestion } from '../shared/questions';
import { currentFrames, inAllFrames } from './frames';

/**
 * Tasks with page buttons (1 2 3 4) and/or section tabs (CET: המשימה | מפת מקורות | שולחן כתיבה):
 * the background goes to every page and every tab on it, and reads **all the frames** that are there
 * at that moment, iframes included (Genially, drag activities, the writing desk editor). Then it goes
 * back to where the student was. Field ids say where the field lives, so it can be filled later even
 * after the site rebuilds the iframe: "w|p3.t2|<frame token>|<position>".
 */

interface NavOutline {
  pages: number;
  page: number;
  tabs: string[] | null;
  tab: number;
  cet: boolean;
}

export interface WalkUnitInfo {
  heading: string;
  frames: { token: string; url: string; text: string; fields: { kind: string; context: string; pos?: number }[] }[];
}

export interface WalkResult {
  snaps: TaggedSnapshot[];
  images: { label: string; dataUrl: string }[];
  units: WalkUnitInfo[];
}

const WALK_ID = /^w\|p(\d+)\.t(\d+)\|([^|]+)\|(\d+)$/;
export function parseWalkId(id: string): { page: number; tab: number; token: string; pos: number } | null {
  const m = id.match(WALK_ID);
  return m ? { page: Number(m[1]), tab: Number(m[2]), token: m[3], pos: Number(m[4]) } : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function nav(tabId: number, op: { op: 'outline' | 'goto' | 'hide' | 'show'; page?: number; tab?: number }): Promise<NavOutline | null> {
  const res = await inAllFrames<NavOutline>(tabId, '__sabNav', [op], [0]).catch(() => []);
  const r = res[0]?.result;
  return r && typeof r === 'object' ? r : null;
}

/** Same frame, same text and same fields = the same screen seen again (a writing desk on several pages). */
const unitKey = (token: string, s: FrameSnapshot) =>
  `${token}|${s.fullText.slice(0, 4000)}|${s.fields.map((f) => `${f.kind}:${f.context.slice(0, 80)}`).join('|')}`;

const isWriting = (kind: string) => kind === 'richtext' || kind === 'textarea';

export async function walkTask(
  tabId: number,
  opts: { onStep?: (label: string, waiting?: boolean) => void; capture?: boolean } = {},
): Promise<WalkResult | null> {
  const start = await nav(tabId, { op: 'outline' });
  if (!start || (start.pages < 2 && !start.tabs)) return null;

  const pages = Math.max(1, start.pages);
  const snaps: TaggedSnapshot[] = [];
  const units: WalkUnitInfo[] = [];
  const images: WalkResult['images'] = [];
  const seen = new Set<string>();
  let fakeId = 1000;
  let topSeen = false;

  for (let k = 1; k <= pages; k++) {
    const onPage = start.pages ? await nav(tabId, { op: 'goto', page: k }) : start;
    if (!onPage) break;
    const tabs = onPage.tabs ? onPage.tabs.map((_, i) => i + 1) : [0];
    let pageQuestion = '';
    for (const t of tabs) {
      const here = t ? await nav(tabId, { op: 'goto', page: start.pages ? k : 0, tab: t }) : onPage;
      if (!here) continue;
      const label = t && here.tabs ? here.tabs[t - 1] : '';
      const heading = [start.pages ? `עמוד ${k} מתוך ${pages}` : '', label ? `לשונית "${label}"` : ''].filter(Boolean).join(' · ');
      opts.onStep?.(heading);
      await sleep(700); // iframes on this page/tab load after the click
      const frames = await inAllFrames<FrameSnapshot>(tabId, '__sabExtract', [{ allPages: false }]).catch(() => []);
      const tokens = await currentFrames(tabId);
      const q = firstQuestion(frames.map((f) => f.result.fullText).join('\n'));
      if (q && !pageQuestion) pageQuestion = q;
      const taskQ = q || pageQuestion;
      const info: WalkUnitInfo = { heading, frames: [] };
      let unitFields = 0;
      for (const { frameId, result } of frames.sort((a, b) => a.frameId - b.frameId)) {
        const token = tokens.get(frameId) ?? `x${frameId}`;
        let fields = result.fields;
        // CET: only writing areas and fields next to a question; every frame of the page (iframes too)
        if (here.cet) fields = fields.filter((f) => isWriting(f.kind) || looksLikeQuestion(f.context));
        // an editor without a question of its own (CET writing desk, often an iframe) answers the task question
        fields = fields.map((f) => (isWriting(f.kind) && !looksLikeQuestion(f.context) && taskQ ? { ...f, context: `שאלת המשימה: ${taskQ}\n${f.context}`.trim() } : f));
        const snap = { ...result, fields };
        if (!fields.length && !snap.fullText.trim() && !snap.videos?.length && !snap.documents?.length && !snap.story) continue;
        const key = unitKey(token, snap);
        if (seen.has(key)) continue;
        seen.add(key);
        unitFields += fields.length;
        const isTop = token === 'top' && !topSeen;
        if (isTop) topSeen = true;
        snaps.push({
          ...snap,
          frameId: fakeId++,
          isTop,
          fullText: snap.fullText.trim() ? `=== ${heading}${token === 'top' ? '' : ' · מסגרת פנימית'} ===\n${snap.fullText}` : '',
          fields: fields.map((f, i) => ({
            ...f,
            id: `w|p${k}.t${t}|${token}|${f.pos ?? i}`,
            ...(start.pages ? { page: k } : {}),
            ...(label ? { section: label } : {}),
          })),
          pages,
        });
        // (the text of an editor frame is what the student wrote: never in the report)
        info.frames.push({ token, url: result.url.split('?')[0], text: token !== 'top' && fields.some((f) => isWriting(f.kind)) ? '' : snap.fullText.slice(0, 1500), fields: fields.map((f) => ({ kind: f.kind, context: f.context.slice(0, 200), pos: f.pos })) });
      }
      if (info.frames.length) units.push(info);
      // CET activities are pictures (cards, thumbs, a protocol): let Claude see them
      if (opts.capture && here.cet && images.length < 6 && (frames.length > 1 || !unitFields) && info.frames.length) {
        const shot = await capture(tabId);
        if (shot) images.push({ label: heading, dataUrl: shot });
      }
    }
  }
  await nav(tabId, { op: 'goto', page: start.pages ? start.page : 0, tab: start.tab });
  return { snaps, images, units };
}

async function capture(tabId: number): Promise<string | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.active) return null;
    await nav(tabId, { op: 'hide' });
    await sleep(120);
    const url = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 70 });
    return url;
  } catch {
    return null;
  } finally {
    await nav(tabId, { op: 'show' });
  }
}
