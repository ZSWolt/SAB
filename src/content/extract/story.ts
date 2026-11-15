import type { StoryInfo } from '../../shared/types';
import { getText, isRendered } from '../text';

const HINT_RE =
  /story|passage|reading|literature|text-?panel|sidebar|side-?bar|drawer|offcanvas|reader|article|sipur|yetzira|סיפור|יצירה|טקסט|קטע|שיר/i;
const TOGGLE_RE = /סיפור|יצירה|הטקסט|לטקסט|קטע|לקריאה|שיר|story|passage|text|reading/i;
const MIN_STORY = 600;

function hasFields(el: Element): boolean {
  return !!el.querySelector('[data-sab-id], [data-sab-group]');
}

function hintScore(el: Element): number {
  let score = 0;
  for (let cur: Element | null = el, depth = 0; cur && depth < 4; cur = cur.parentElement, depth++) {
    const sig = `${cur.id} ${cur.getAttribute('class') ?? ''} ${cur.getAttribute('aria-label') ?? ''} ${cur.getAttribute('data-testid') ?? ''}`;
    if (HINT_RE.test(sig)) score += depth === 0 ? 3 : 1;
    if (cur.tagName === 'ASIDE' || cur.getAttribute('role') === 'complementary') score += 2;
  }
  return score;
}

function sideScore(el: Element): number {
  const view = el.ownerDocument.defaultView;
  if (!view) return 0;
  const style = view.getComputedStyle(el);
  let score = 0;
  if (style.position === 'fixed' || style.position === 'sticky') score += 1;
  const rect = el.getBoundingClientRect();
  if (rect.width > 0 && rect.left > view.innerWidth * 0.45) score += 1;
  if (!isRendered(el)) score += 1; // a collapsed side bar whose text is still in the DOM
  return score;
}

const SIDE_RE = /drawer|sidebar|side-?bar|side-?panel|offcanvas|slide|panel|story|reader|reading|text-?bar|sipur/i;

/** Greenish background (classe's story bar), on the element or one of its parents. */
function greenish(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  for (let cur: Element | null = el, d = 0; cur && d < 6; cur = cur.parentElement, d++) {
    const m = view.getComputedStyle(cur).backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
    if (m && (m[4] === undefined || Number(m[4]) > 0.2)) {
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (g > r + 25 && g > b + 10) return true;
    }
  }
  return false;
}

/**
 * Is this block inside a side bar on the right (classe's green story bar), and not the main page?
 * A side element (aside, drawer/sidebar/panel classes), or a fixed/absolute box on the right half
 * that is tall, or a green one. A collapsed bar counts too (its text is still in the page).
 */
export function inRightBar(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  for (let cur: Element | null = el, d = 0; cur && cur !== el.ownerDocument.body && d < 8; cur = cur.parentElement, d++) {
    const sig = `${cur.id} ${cur.getAttribute('class') ?? ''} ${cur.getAttribute('aria-label') ?? ''}`;
    if (cur.tagName === 'ASIDE' || cur.getAttribute('role') === 'complementary' || cur.getAttribute('role') === 'dialog' || SIDE_RE.test(sig)) return true;
    if (view) {
      const st = view.getComputedStyle(cur);
      if (st.position === 'fixed' || st.position === 'absolute') {
        const r = cur.getBoundingClientRect();
        if (r.width > 0 && r.left > view.innerWidth * 0.4 && r.height > view.innerHeight * 0.4) return true;
      }
    }
  }
  return greenish(el);
}

/**
 * Finds a long text block with no answer fields in it: the story/poem/article the questions are about.
 * Looks at hidden elements too, because the literature side bar is often collapsed.
 * `rightBarOnly` (classe): the story is always in the bar on the right; nothing else counts.
 */
export function findStory(doc: Document, isTop: boolean, rightBarOnly = false): { info: StoryInfo; element: Element } | null {
  const body = doc.body;
  if (!body) return null;

  // A whole frame with long text and no fields (e.g. the story inside an iframe).
  if (!isTop && !hasFields(body)) {
    const text = getText(body);
    if (text.length >= MIN_STORY) return { info: { text, source: 'frame', title: doc.title }, element: body };
  }

  // Maximal field-free subtrees with a lot of text.
  const candidates: { el: Element; text: string; score: number }[] = [];
  const visit = (el: Element) => {
    if (el.id === 'sab-helper-host') return;
    if (!hasFields(el)) {
      const text = getText(el);
      if (text.length >= MIN_STORY && el !== body) {
        const score = hintScore(el) * 2 + sideScore(el) + Math.min(text.length / 3000, 3);
        candidates.push({ el, text, score });
      }
      return; // don't descend: we want the biggest field-free block
    }
    for (const c of Array.from(el.children)) visit(c);
  };
  visit(body);
  if (rightBarOnly) {
    // only blocks inside the right bar; inside a block, the bar part
    const inBar: typeof candidates = [];
    for (const c of candidates) {
      if (inRightBar(c.el)) inBar.push(c);
      else {
        // the biggest field-free block may wrap the bar together with other things: look inside it
        c.el.querySelectorAll('aside, [role="complementary"], [class*="drawer" i], [class*="sidebar" i], [class*="side-bar" i], [class*="panel" i], [class*="story" i]').forEach((x) => {
          const text = getText(x);
          if (text.length >= MIN_STORY && inRightBar(x)) inBar.push({ el: x, text, score: 10 + Math.min(text.length / 3000, 3) });
        });
      }
    }
    candidates.length = 0;
    candidates.push(...inBar);
  }
  if (!candidates.length) return null;

  // If the page has no fields at all, the body itself is one candidate, which isn't a "story" by itself.
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const pageHasFields = hasFields(body);
  const confident = rightBarOnly || hintScore(best.el) > 0 || (pageHasFields && best.text.length >= 1500) || sideScore(best.el) >= 2;
  if (!confident) return null;

  const el = narrowToProse(best.el);
  const text = cleanStory(getText(el));
  if (text.length < MIN_STORY) return null;
  const heading = el.querySelector('h1, h2, h3, h4, [role="heading"]');
  return {
    info: { text: text.slice(0, 80000), source: hintScore(best.el) > 0 ? 'hint' : 'side', title: heading ? getText(heading) : undefined },
    element: el,
  };
}

/** Characters of real prose (paragraph-like text blocks of 80+ characters) inside an element. */
function proseChars(el: Element): number {
  let n = 0;
  el.querySelectorAll('p, div, span, li, blockquote, td, article, section').forEach((b) => {
    // only text that sits directly in this block, so nested blocks aren't counted twice
    const own = Array.from(b.childNodes)
      .filter((c) => c.nodeType === Node.TEXT_NODE || (c.nodeType === Node.ELEMENT_NODE && /^(B|I|EM|STRONG|SPAN|A|BR|SUP|SUB|U|MARK)$/.test((c as Element).tagName) && !(c as Element).querySelector('p, div')))
      .map((c) => c.textContent ?? '')
      .join('')
      .trim();
    if (own.length >= 80) n += own.length;
  });
  return n;
}

/**
 * The biggest field-free block often holds a lesson menu, buttons and the questions around the
 * story. Go down into the child that holds almost all of the long paragraphs: that's the story.
 */
export function narrowToProse(start: Element): Element {
  let el = start;
  for (let depth = 0; depth < 12; depth++) {
    const total = proseChars(el);
    if (total < MIN_STORY) break;
    let next: Element | null = null;
    for (const c of Array.from(el.children)) {
      if (proseChars(c) >= total * 0.85) {
        next = c;
        break;
      }
    }
    if (!next) break;
    el = next;
  }
  return el;
}

/** Drops image labels and lines that are just leftovers from buttons and menus. */
function cleanStory(text: string): string {
  return text
    .split('\n')
    .filter((l) => !/^\[תמונה: [^\]]*\]$/.test(l.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Clicks something that looks like the "open the story" button. Returns its label, or null. */
export function tryOpenStoryBar(doc: Document = document): string | null {
  // the story bar's button is on the right: try those first
  const clickables = Array.from(doc.querySelectorAll('button, a, [role="button"], [role="tab"], summary, [onclick]')).sort((a, b) => {
    const ra = a.getBoundingClientRect().left;
    const rb = b.getBoundingClientRect().left;
    return rb - ra;
  });
  for (const el of clickables) {
    if (el.closest('#sab-helper-host')) continue;
    const label = `${getText(el)} ${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''}`.trim();
    if (label.length > 0 && label.length < 50 && TOGGLE_RE.test(label) && isRendered(el)) {
      (el as HTMLElement).click();
      return label;
    }
  }
  return null;
}
