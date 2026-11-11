import type { FillItem, FillOutcome, FrameSnapshot } from '../../shared/types';
import { fillFields } from '../fill';
import { getText, isRendered } from '../text';
import { extractFrame } from './index';
import { findFieldGroups } from './fields';
import { findSectionTabs } from './sections';

/**
 * Tasks split into pages with numbered buttons at the bottom (1 2 3 …). We click through every page,
 * read it, and go back to where the student was. Fields on page k get the stable id "p<k>.<i>"
 * (i = position on that page), because many sites rebuild the page's HTML when you switch pages.
 */

export interface Pagination {
  /** buttons[i] goes to page i + 1 */
  buttons: HTMLElement[];
  current: number;
}

const MAX_PAGES = 30;
const ACTIVE_RE = /(^|[\s_-])(active|current|selected|is-active|is-current|on|chosen)($|[\s_-])/i;

function ownNumber(el: Element): number | null {
  const t = getText(el).trim();
  if (!/^\d{1,2}$/.test(t)) return null;
  // the deepest element with this text (<li><a>1</a></li> → the <a>)
  for (const c of Array.from(el.children)) if (getText(c).trim() === t) return null;
  return Number(t);
}

function isCandidate(el: Element): boolean {
  if (el.closest('label, select, option, table, #sab-helper-host, [role="radiogroup"], [role="listbox"]')) return false;
  if (el.querySelector('input, textarea, select')) return false;
  return isRendered(el);
}

function looksActive(el: Element, container: Element): boolean {
  for (let cur: Element | null = el; cur && cur !== container; cur = cur.parentElement) {
    if (cur.getAttribute('aria-current') && cur.getAttribute('aria-current') !== 'false') return true;
    if (cur.getAttribute('aria-selected') === 'true' || cur.getAttribute('aria-pressed') === 'true') return true;
    if (ACTIVE_RE.test(cur.getAttribute('class') ?? '')) return true;
    if ((cur as HTMLButtonElement).disabled) return true;
  }
  return false;
}

function styleKey(el: Element): string {
  const view = el.ownerDocument.defaultView;
  if (!view) return '';
  // look at the element and its parent: the colored circle is often the wrapper
  return [el, el.parentElement]
    .filter((x): x is Element => !!x)
    .map((x) => {
      const s = view.getComputedStyle(x);
      return `${s.backgroundColor}|${s.color}|${s.fontWeight}|${s.borderColor}`;
    })
    .join('/');
}

function currentPage(buttons: HTMLElement[], container: Element): number {
  const flagged = buttons.findIndex((b) => looksActive(b, container));
  if (flagged >= 0) return flagged + 1;
  // otherwise: the one button that looks different from all the others (e.g. orange vs. gray)
  const keys = buttons.map(styleKey);
  const counts = new Map<string, number>();
  keys.forEach((k) => counts.set(k, (counts.get(k) ?? 0) + 1));
  const unique = keys.findIndex((k) => counts.get(k) === 1);
  if (unique >= 0 && buttons.length > 2) return unique + 1;
  if (buttons.length === 2 && keys[0] !== keys[1]) {
    // two pages: the gray one is usually inactive; can't tell for sure, assume page 1
    return 1;
  }
  return 1;
}

export function findPagination(doc: Document = document): Pagination | null {
  const cands: { el: HTMLElement; n: number }[] = [];
  doc.querySelectorAll('button, a, li, span, div, [role="button"], [role="tab"], [role="link"]').forEach((el) => {
    const n = ownNumber(el);
    if (n !== null && n >= 1 && n <= MAX_PAGES && isCandidate(el)) cands.push({ el: el as HTMLElement, n });
  });
  if (cands.length < 2) return null;

  let best: { buttons: HTMLElement[]; container: Element } | null = null;
  for (let level = 1; level <= 4; level++) {
    const groups = new Map<Element, { el: HTMLElement; n: number }[]>();
    for (const c of cands) {
      let anc: Element | null = c.el;
      for (let i = 0; i < level && anc; i++) anc = anc.parentElement;
      if (!anc || anc === doc.body || anc === doc.documentElement) continue;
      const list = groups.get(anc) ?? [];
      list.push(c);
      groups.set(anc, list);
    }
    for (const [container, list] of groups) {
      if (list.length < 2 || container.querySelector('[data-sab-id], [data-sab-group]')) continue;
      // Page buttons hold just their number. An item with more text (an answer option "1 היא חיה…",
      // a lesson section "01 דיון…") is not a page button, and clicking it would choose an answer.
      const onlyNumbers = list.every(({ el, n }) => {
        let item: Element = el;
        while (item.parentElement && item.parentElement !== container) item = item.parentElement;
        return getText(item).trim() === String(n);
      });
      if (!onlyNumbers) continue;
      const nums = list.map((c) => c.n);
      const set = new Set(nums);
      const n = list.length;
      // exactly 1..N, each once
      if (set.size !== n || !Array.from({ length: n }, (_, i) => i + 1).every((k) => set.has(k))) continue;
      const buttons = [...list].sort((a, b) => a.n - b.n).map((c) => c.el);
      if (!best || buttons.length > best.buttons.length) best = { buttons, container };
    }
    if (best) break;
  }
  if (!best) return null;
  return { buttons: best.buttons, current: currentPage(best.buttons, best.container) };
}

// ---------- progress, visibility and a lock ----------

export interface WalkProgress {
  page: number;
  total: number;
  /** Paused because the tab is in the background (Chrome doesn't render hidden tabs). */
  waiting: boolean;
}
let progressListener: ((p: WalkProgress) => void) | null = null;
export function onWalkProgress(fn: ((p: WalkProgress) => void) | null) {
  progressListener = fn;
}
const report = (p: WalkProgress) => {
  try {
    progressListener?.(p);
  } catch {
    /* ignore */
  }
};

/**
 * Resolves when the tab is visible. A hidden tab doesn't run requestAnimationFrame and throttles
 * timers, so many sites never draw the next page there: reading it would give the old page.
 */
export function waitVisible(doc: Document = document, onWait?: () => void): Promise<void> {
  if (doc.visibilityState !== 'hidden') return Promise.resolve();
  onWait?.();
  return new Promise((resolve) => {
    const on = () => {
      if (doc.visibilityState === 'hidden') return;
      doc.removeEventListener('visibilitychange', on);
      resolve();
    };
    doc.addEventListener('visibilitychange', on);
  });
}

let chain: Promise<unknown> = Promise.resolve();
/** Only one page walk (reading or filling) at a time, so two walks never click against each other. */
export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

const LOADING_RE = /^(loading|טוען|נטען|please wait|רגע)[.…]*$/i;
function loadingVisible(doc: Document): boolean {
  if (doc.querySelector('[aria-busy="true"]')) return true;
  for (const el of Array.from(doc.querySelectorAll('div, span, p, img'))) {
    const label = el.tagName === 'IMG' ? '' : (el.textContent ?? '').trim();
    const isLoading = el.tagName === 'IMG' ? /loading|spinner/i.test(el.getAttribute('alt') ?? '') : LOADING_RE.test(label);
    if (isLoading && el.children.length === 0 && isRendered(el)) {
      const r = (el as HTMLElement).getBoundingClientRect?.();
      if (!r || r.width > 0 || r.height > 0) return true;
    }
  }
  return false;
}

/** Waits until the page stops changing (or maxMs), and a little longer while "Loading…" shows. */
export async function settle(doc: Document = document, quietMs = 400, maxMs = 8000): Promise<void> {
  const start = Date.now();
  await quiet(doc, quietMs, maxMs);
  while (loadingVisible(doc) && Date.now() - start < Math.min(maxMs, 4000) + 2500) {
    await new Promise((r) => setTimeout(r, 300));
  }
}

function quiet(doc: Document, quietMs: number, maxMs: number): Promise<void> {
  return new Promise((resolve) => {
    let timer = setTimeout(done, Math.max(quietMs, 250));
    const hard = setTimeout(done, maxMs);
    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(done, quietMs);
    });
    obs.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    function done() {
      obs.disconnect();
      clearTimeout(timer);
      clearTimeout(hard);
      resolve();
    }
  });
}

/** Clicks page `page` (finding the buttons again, since they may have been rebuilt) and waits. */
export async function goToPage(page: number, doc: Document = document): Promise<boolean> {
  const first = findPagination(doc);
  if (!first) return false;
  await waitVisible(doc, () => report({ page, total: first.buttons.length, waiting: true }));
  const pg = findPagination(doc);
  const btn = pg?.buttons[page - 1];
  if (!pg || !btn) return false;
  report({ page, total: pg.buttons.length, waiting: false });
  if (pg.current === page) return true;
  btn.click();
  await settle(doc);
  return true;
}

function renumber(snap: FrameSnapshot, page: number, prefix = ''): FrameSnapshot {
  return { ...snap, fields: snap.fields.map((f, i) => ({ ...f, id: `${prefix}p${page}.${i}`, page })) };
}

/** Reads every page of a paged task. Falls back to the current page only. */
export function extractAllPages(doc: Document = document): Promise<FrameSnapshot> {
  return withLock(() => walkAndRead(doc));
}

/** The pages (1 2 3 buttons) of what is on screen now; back to the page we started on. */
async function readPages(doc: Document, prefix: string, forceIds: boolean): Promise<FrameSnapshot[]> {
  const pg = findPagination(doc);
  if (!pg) {
    const snap = extractFrame(doc);
    return [forceIds ? renumber(snap, 1, prefix) : snap];
  }
  const start = pg.current;
  const per: FrameSnapshot[] = [];
  for (let k = 1; k <= pg.buttons.length; k++) {
    // always go (goToPage does nothing if we're already there): after page 1 we're no longer on `start`
    if (!(await goToPage(k, doc))) break;
    per.push(renumber(extractFrame(doc), k, prefix));
  }
  await goToPage(start, doc);
  return per.length ? per : [extractFrame(doc)];
}

const uniq = <T>(list: T[], key: (x: T) => string) => [...new Map(list.map((x) => [key(x), x])).values()];

function combine(per: FrameSnapshot[], heading: (s: FrameSnapshot, i: number) => string): FrameSnapshot {
  const first = per[0];
  return {
    ...first,
    fields: per.flatMap((s) => s.fields),
    story: per.find((s) => s.story)?.story,
    fullText: per
      .map((s, i) => `=== ${heading(s, i)} ===\n${s.fullText}`)
      .join('\n\n')
      .slice(0, 150000),
    videos: uniq(per.flatMap((s) => s.videos), (v) => v.url),
    documents: uniq(per.flatMap((s) => s.documents), (d) => d.url),
    pages: per.length,
    questionMarkers: per.reduce((n, s) => n + (s.questionMarkers ?? 0), 0),
  };
}

async function walkAndRead(doc: Document): Promise<FrameSnapshot> {
  const sec = findSectionTabs(doc);
  if (!sec) {
    const per = await readPages(doc, '', false);
    if (per.length <= 1) return per[0];
    return combine(per, (_, i) => `עמוד ${i + 1} מתוך ${per.length}`);
  }

  // section tabs (CET: המשימה | מפת מקורות | שולחן כתיבה): every tab, and the pages inside each
  const start = sec.current;
  const per: FrameSnapshot[] = [];
  const names: string[] = [];
  for (let k = 1; k <= sec.tabs.length; k++) {
    if (!(await goToSection(k, doc))) continue;
    const pages = await readPages(doc, `t${k}.`, true);
    pages.forEach((snap, p) => {
      const name = pages.length > 1 ? `${sec.labels[k - 1]} · עמוד ${p + 1}` : sec.labels[k - 1];
      const unit = per.length + 1;
      per.push({ ...snap, fields: snap.fields.map((f) => ({ ...f, page: unit, section: name })) });
      names.push(name);
    });
  }
  await goToSection(start, doc);
  if (!per.length) return extractFrame(doc);
  return combine(per, (_, i) => `לשונית "${names[i]}" (${i + 1} מתוך ${per.length})`);
}

/** Clicks section tab `k` (finding the tabs again, they may be rebuilt) and waits for it to draw. */
export async function goToSection(k: number, doc: Document = document): Promise<boolean> {
  const first = findSectionTabs(doc);
  if (!first) return false;
  await waitVisible(doc, () => report({ page: k, total: first.tabs.length, waiting: true }));
  const sec = findSectionTabs(doc);
  const tab = sec?.tabs[k - 1];
  if (!sec || !tab) return false;
  report({ page: k, total: sec.tabs.length, waiting: false });
  if (sec.current === k) return true;
  tab.click();
  await settle(doc);
  return true;
}

/** Fills fields on several pages: goes to each page, finds its fields again by position, fills them. */
export function fillAcrossPages(items: FillItem[], doc: Document = document): Promise<FillOutcome[]> {
  return withLock(() => walkAndFill(items, doc));
}

const WALK_ID = /^(?:t(\d+)\.)?p(\d+)\.(\d+)$/;

async function walkAndFill(items: FillItem[], doc: Document): Promise<FillOutcome[]> {
  const walked = items.filter((i) => WALK_ID.test(i.fieldId));
  const out: FillOutcome[] = fillFields(items.filter((i) => !walked.includes(i)), doc);
  if (!walked.length) return out;

  const startTab = findSectionTabs(doc)?.current ?? 0;
  // group by tab, then by page
  const byUnit = new Map<string, { tab: number; page: number; list: FillItem[] }>();
  for (const it of walked) {
    const [, t, p] = it.fieldId.match(WALK_ID)!;
    const tab = t ? Number(t) : 0;
    const page = Number(p);
    const key = `${tab}.${page}`;
    const u = byUnit.get(key) ?? { tab, page, list: [] };
    u.list.push(it);
    byUnit.set(key, u);
  }
  const units = [...byUnit.values()].sort((a, b) => a.tab - b.tab || a.page - b.page);
  let tabStartPage: number | null = null;
  let curTab = -1;
  for (const u of units) {
    if (u.tab !== curTab) {
      if (curTab > 0 && tabStartPage) await goToPage(tabStartPage, doc);
      curTab = u.tab;
      if (u.tab && !(await goToSection(u.tab, doc))) {
        out.push(...u.list.map((i) => ({ fieldId: i.fieldId, ok: false, message: 'לא הצלחתי לעבור ללשונית של השאלה' })));
        continue;
      }
      tabStartPage = findPagination(doc)?.current ?? null;
    }
    const pg = findPagination(doc);
    const ok = pg ? await goToPage(u.page, doc) : u.page === 1;
    if (!ok) {
      out.push(...u.list.map((i) => ({ fieldId: i.fieldId, ok: false, message: `לא הצלחתי לעבור לעמוד ${u.page}` })));
      continue;
    }
    const groups = findFieldGroups(doc);
    for (const it of u.list) {
      const idx = Number(it.fieldId.match(WALK_ID)![3]);
      const g = groups[idx];
      if (!g) {
        out.push({ fieldId: it.fieldId, ok: false, message: `השדה לא נמצא בעמוד ${u.page}` });
        continue;
      }
      const [res] = fillFields([{ ...it, fieldId: g.id }], doc);
      out.push({ ...res, fieldId: it.fieldId });
    }
    await settle(doc, 200, 1500);
  }
  if (tabStartPage) await goToPage(tabStartPage, doc);
  if (startTab) await goToSection(startTab, doc);
  return out;
}
