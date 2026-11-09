import type { FillItem, FillOutcome, FrameSnapshot } from '../../shared/types';
import { fillFields } from '../fill';
import { getText, isRendered } from '../text';
import { extractFrame } from './index';
import { findFieldGroups } from './fields';

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

/** Waits until the page stops changing (or maxMs). */
export function settle(doc: Document = document, quietMs = 400, maxMs = 4000): Promise<void> {
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
  const pg = findPagination(doc);
  const btn = pg?.buttons[page - 1];
  if (!pg || !btn) return false;
  if (pg.current === page) return true;
  btn.click();
  await settle(doc);
  return true;
}

function renumber(snap: FrameSnapshot, page: number): FrameSnapshot {
  return { ...snap, fields: snap.fields.map((f, i) => ({ ...f, id: `p${page}.${i}`, page })) };
}

/** Reads every page of a paged task. Falls back to the current page only. */
export async function extractAllPages(doc: Document = document): Promise<FrameSnapshot> {
  const pg = findPagination(doc);
  if (!pg) return extractFrame(doc);
  const start = pg.current;
  const per: FrameSnapshot[] = [];
  for (let k = 1; k <= pg.buttons.length; k++) {
    // always go (goToPage does nothing if we're already there): after page 1 we're no longer on `start`
    if (!(await goToPage(k, doc))) break;
    per.push(renumber(extractFrame(doc), k));
  }
  await goToPage(start, doc);
  if (per.length <= 1) return per[0] ?? extractFrame(doc);

  const first = per[0];
  const story = per.find((s) => s.story)?.story;
  const uniq = <T>(list: T[], key: (x: T) => string) => [...new Map(list.map((x) => [key(x), x])).values()];
  return {
    ...first,
    fields: per.flatMap((s) => s.fields),
    story,
    fullText: per
      .map((s, i) => `=== עמוד ${i + 1} מתוך ${per.length} ===\n${s.fullText}`)
      .join('\n\n')
      .slice(0, 150000),
    videos: uniq(per.flatMap((s) => s.videos), (v) => v.url),
    documents: uniq(per.flatMap((s) => s.documents), (d) => d.url),
    pages: per.length,
  };
}

/** Fills fields on several pages: goes to each page, finds its fields again by position, fills them. */
export async function fillAcrossPages(items: FillItem[], doc: Document = document): Promise<FillOutcome[]> {
  const paged = items.filter((i) => /^p\d+\.\d+$/.test(i.fieldId));
  const out: FillOutcome[] = fillFields(items.filter((i) => !paged.includes(i)), doc);
  if (!paged.length) return out;

  const start = findPagination(doc)?.current ?? 1;
  const byPage = new Map<number, FillItem[]>();
  for (const it of paged) {
    const page = Number(it.fieldId.slice(1).split('.')[0]);
    byPage.set(page, [...(byPage.get(page) ?? []), it]);
  }
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const list = byPage.get(page)!;
    const ok = await goToPage(page, doc);
    if (!ok) {
      out.push(...list.map((i) => ({ fieldId: i.fieldId, ok: false, message: `לא הצלחתי לעבור לעמוד ${page}` })));
      continue;
    }
    const groups = findFieldGroups(doc);
    for (const it of list) {
      const idx = Number(it.fieldId.split('.')[1]);
      const g = groups[idx];
      if (!g) {
        out.push({ fieldId: it.fieldId, ok: false, message: `השדה לא נמצא בעמוד ${page}` });
        continue;
      }
      const [res] = fillFields([{ ...it, fieldId: g.id }], doc);
      out.push({ ...res, fieldId: it.fieldId });
    }
    await settle(doc, 200, 1500);
  }
  await goToPage(start, doc);
  return out;
}
