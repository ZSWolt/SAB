import { getText, isRendered } from '../text';

/**
 * Multiple-choice questions built from clickable boxes instead of real radio buttons, like on CET:
 *   <div class="option"><span>1</span><span>היא חיה עם בעלה בניו אורלינס.</span></div>
 *   <div class="option"><span>2</span><span>היא אוהבת לאפות.</span></div> …
 * A group = sibling items that each start with a number badge 1, 2, 3 … (no leading zero, so lesson
 * menus like "01 02 03" don't count) followed by the option text.
 */

export interface CustomChoice {
  items: HTMLElement[];
  labels: string[];
  multi: boolean;
}

const BADGE_RE = /^[1-9]\d?$/;
const MULTI_RE = /סמנו את כל|סמן את כל|כל התשובות הנכונות|יותר מתשובה אחת|select all|choose all|all that apply/i;

function badgeNumber(el: Element): number | null {
  const t = getText(el).trim();
  if (!BADGE_RE.test(t)) return null;
  for (const c of Array.from(el.children)) if (getText(c).trim() === t) return null; // deepest element only
  return Number(t);
}

function excluded(el: Element): boolean {
  return !!el.closest('label, select, option, nav, [role="navigation"], [role="radiogroup"], [role="listbox"], #sab-helper-host, [data-sab-group], [data-sab-id]');
}

/** The option box: climb from the badge until the element also holds the option text. */
function itemOf(badge: Element, num: number): HTMLElement | null {
  let cur: Element = badge;
  for (let i = 0; i < 3 && cur.parentElement; i++) {
    const parent = cur.parentElement;
    const text = getText(parent).trim();
    if (text.length > String(num).length + 1) {
      // the parent must not hold several numbered options itself
      return text.startsWith(String(num)) ? (parent as HTMLElement) : null;
    }
    cur = parent;
  }
  return null;
}

/** The question text above the options mentions "mark all the correct answers"? */
function questionAbove(container: Element): string {
  let text = '';
  for (let s = container.previousElementSibling, i = 0; s && i < 3; s = s.previousElementSibling, i++) text = getText(s) + ' ' + text;
  if (!text.trim() && container.parentElement) {
    for (let s = container.parentElement.previousElementSibling, i = 0; s && i < 2; s = s.previousElementSibling, i++) text = getText(s) + ' ' + text;
  }
  return text;
}

export function findCustomChoices(doc: Document = document): CustomChoice[] {
  const byContainer = new Map<Element, { item: HTMLElement; n: number }[]>();
  doc.querySelectorAll('span, div, b, strong, i, em, p, button, li, label, [role="button"]').forEach((el) => {
    const n = badgeNumber(el);
    if (n === null || excluded(el) || el.querySelector('input, textarea, select')) return;
    const item = itemOf(el, n);
    const container = item?.parentElement;
    if (!item || !container || excluded(item)) return;
    const list = byContainer.get(container) ?? [];
    if (!list.some((x) => x.item === item)) list.push({ item, n });
    byContainer.set(container, list);
  });

  const out: CustomChoice[] = [];
  for (const [container, list] of byContainer) {
    if (list.length < 2) continue;
    const nums = list.map((x) => x.n).sort((a, b) => a - b);
    if (!nums.every((n, i) => n === i + 1)) continue; // exactly 1..N
    const items = [...list].sort((a, b) => a.n - b.n).map((x) => x.item);
    if (!items.every((it) => isRendered(it))) continue;
    const labels = items.map((it, i) => getText(it).trim().replace(new RegExp(`^${i + 1}\\s*`), '').trim());
    if (labels.some((l) => !l || l.length > 400)) continue;
    out.push({ items, labels, multi: MULTI_RE.test(questionAbove(container)) });
  }
  return out;
}
