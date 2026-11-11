import type { FillItem, FillOutcome, FrameSnapshot } from '../../shared/types';
import { fillFields } from '../fill';
import { getText, isRendered } from '../text';
import { extractFrame } from './index';
import { findFieldGroups } from './fields';
import { findSectionTabs } from './sections';
import { firstQuestion, looksLikeQuestion } from '../../shared/questions';

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

/** Reads every page of a paged task (and every section tab on each page). Falls back to the current page only. */
export function extractAllPages(doc: Document = document): Promise<FrameSnapshot> {
  return withLock(() => walkAndRead(doc));
}

const uniq = <T>(list: T[], key: (x: T) => string) => [...new Map(list.map((x) => [key(x), x])).values()];

interface Unit {
  snap: FrameSnapshot;
  heading: string;
}

/** Same text and same fields = the same screen seen again (a writing desk shared by several pages). */
const unitKey = (s: FrameSnapshot) => `${s.fullText.slice(0, 4000)}|${s.fields.map((f) => `${f.kind}:${f.context.slice(0, 80)}`).join('|')}`;

/**
 * A field on a tab without question text of its own (the big editor on CET's "שולחן כתיבה") gets
 * the page's task question, from the tab that has it ("המשימה").
 */
function withTaskQuestion(snaps: FrameSnapshot[]): FrameSnapshot[] {
  const q = snaps.map((s) => firstQuestion(s.fullText)).find(Boolean);
  if (!q) return snaps;
  return snaps.map((s) => ({
    ...s,
    fields: s.fields.map((f) => (!looksLikeQuestion(f.context) && (f.kind === 'richtext' || f.kind === 'textarea') ? { ...f, context: `שאלת המשימה: ${q}\n${f.context}`.trim() } : f)),
  }));
}

async function walkAndRead(doc: Document): Promise<FrameSnapshot> {
  const pg = findPagination(doc);
  if (!pg && !findSectionTabs(doc)) return extractFrame(doc);

  const startPage = pg?.current ?? 1;
  // the tab the student has open (sites often reset it to the first tab when the page changes)
  const startTab = findSectionTabs(doc)?.current ?? 0;
  const total = pg?.buttons.length ?? 1;
  const units: Unit[] = [];
  const seen = new Set<string>();
  for (let k = 1; k <= total; k++) {
    // always go (goToPage does nothing if we're already there): after page 1 we're no longer on the start page
    if (pg && !(await goToPage(k, doc))) break;
    const sec = findSectionTabs(doc);
    let here: { snap: FrameSnapshot; tab: number; label?: string }[] = [];
    if (sec) {
      // section tabs on this page (CET: המשימה | מפת מקורות | שולחן כתיבה): read each, then reopen the one that was open
      const openTab = sec.current;
      for (let t = 1; t <= sec.tabs.length; t++) {
        if (!(await goToSection(t, doc))) continue;
        here.push({ snap: extractFrame(doc), tab: t, label: sec.labels[t - 1] });
      }
      await goToSection(openTab, doc);
      const fixed = withTaskQuestion(here.map((x) => x.snap));
      here = here.map((x, i) => ({ ...x, snap: fixed[i] }));
    } else {
      here.push({ snap: extractFrame(doc), tab: 0 });
    }
    for (const { snap, tab, label } of here) {
      const key = unitKey(snap);
      if (seen.has(key)) continue;
      seen.add(key);
      const prefix = `p${k}${tab ? `.t${tab}` : ''}`;
      units.push({
        snap: {
          ...snap,
          fields: snap.fields.map((f, i) => ({ ...f, id: `${prefix}.${f.pos ?? i}`, ...(pg ? { page: k } : {}), ...(label ? { section: label } : {}) })),
        },
        heading: [pg ? `עמוד ${k} מתוך ${total}` : '', label ? `לשונית "${label}"` : ''].filter(Boolean).join(' · '),
      });
    }
  }
  if (pg) await goToPage(startPage, doc);
  if (startTab) await goToSection(startTab, doc);
  if (!units.length) return extractFrame(doc);
  if (units.length === 1 && !units[0].snap.fields.some((f) => f.section)) return { ...units[0].snap, pages: total };

  const per = units.map((u) => u.snap);
  return {
    ...per[0],
    fields: per.flatMap((s) => s.fields),
    story: per.find((s) => s.story)?.story,
    fullText: units
      .map((u) => `=== ${u.heading} ===\n${u.snap.fullText}`)
      .join('\n\n')
      .slice(0, 150000),
    videos: uniq(per.flatMap((s) => s.videos), (v) => v.url),
    documents: uniq(per.flatMap((s) => s.documents), (d) => d.url),
    pages: total,
    questionMarkers: per.reduce((n, s) => n + (s.questionMarkers ?? 0), 0),
  };
}

/** Clicks section tab `k` (finding the tabs again, they may be rebuilt) and waits for it to draw. */
export async function goToSection(k: number, doc: Document = document): Promise<boolean> {
  const first = findSectionTabs(doc);
  if (!first) return false;
  await waitVisible(doc, () => report({ page: k, total: first.tabs.length, waiting: true }));
  const sec = findSectionTabs(doc);
  const tab = sec?.tabs[k - 1];
  if (!sec || !tab) return false;
  if (sec.current === k) return true;
  tab.click();
  await settle(doc);
  return true;
}

/** Fills fields on several pages / tabs: goes to each, finds its fields again by position, fills them. */
export function fillAcrossPages(items: FillItem[], doc: Document = document): Promise<FillOutcome[]> {
  return withLock(() => walkAndFill(items, doc));
}

/** "p3.5" (page 3, field 5) or "p3.t2.0" (page 3, section tab 2, field 0). */
const WALK_ID = /^p(\d+)(?:\.t(\d+))?\.(\d+)$/;

async function walkAndFill(items: FillItem[], doc: Document): Promise<FillOutcome[]> {
  const walked = items.filter((i) => WALK_ID.test(i.fieldId));
  const out: FillOutcome[] = fillFields(items.filter((i) => !walked.includes(i)), doc);
  if (!walked.length) return out;

  const pg = findPagination(doc);
  const startPage = pg?.current ?? 1;
  const startTabHere = findSectionTabs(doc)?.current ?? 0;
  const byPage = new Map<number, Map<number, FillItem[]>>();
  for (const it of walked) {
    const [, p, t] = it.fieldId.match(WALK_ID)!;
    const page = Number(p);
    const tab = t ? Number(t) : 0;
    const tabs = byPage.get(page) ?? new Map<number, FillItem[]>();
    tabs.set(tab, [...(tabs.get(tab) ?? []), it]);
    byPage.set(page, tabs);
  }
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const tabs = byPage.get(page)!;
    const all = [...tabs.values()].flat();
    const onPage = pg ? await goToPage(page, doc) : page === 1;
    if (!onPage) {
      out.push(...all.map((i) => ({ fieldId: i.fieldId, ok: false, message: `לא הצלחתי לעבור לעמוד ${page}` })));
      continue;
    }
    const startTab = findSectionTabs(doc)?.current ?? 0;
    for (const tab of [...tabs.keys()].sort((a, b) => a - b)) {
      const list = tabs.get(tab)!;
      if (tab && !(await goToSection(tab, doc))) {
        out.push(...list.map((i) => ({ fieldId: i.fieldId, ok: false, message: 'לא הצלחתי לעבור ללשונית של השאלה' })));
        continue;
      }
      const groups = findFieldGroups(doc);
      for (const it of list) {
        const g = groups[Number(it.fieldId.match(WALK_ID)![3])];
        if (!g) {
          out.push({ fieldId: it.fieldId, ok: false, message: `השדה לא נמצא בעמוד ${page}` });
          continue;
        }
        const [res] = fillFields([{ ...it, fieldId: g.id }], doc);
        out.push({ ...res, fieldId: it.fieldId });
      }
      await settle(doc, 200, 1500);
    }
    if (startTab) await goToSection(startTab, doc);
  }
  if (pg) await goToPage(startPage, doc);
  if (startTabHere) await goToSection(startTabHere, doc);
  return out;
}
