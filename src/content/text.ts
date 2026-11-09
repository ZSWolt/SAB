/** Text extraction that works on hidden elements too (unlike innerText) and in jsdom. */

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'DD', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION',
  'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV',
  'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TR', 'UL', 'LABEL', 'SUMMARY', 'DETAILS', 'OPTION',
]);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'IFRAME', 'OBJECT', 'VIDEO', 'AUDIO']);

export const PANEL_HOST_ID = 'sab-helper-host';

export interface TextOptions {
  skipHidden?: boolean;
  exclude?: (el: Element) => boolean;
  /** Stop once this many characters were collected. */
  limit?: number;
}

export function isHidden(el: Element): boolean {
  if ((el as HTMLElement).hidden) return true;
  const view = el.ownerDocument?.defaultView;
  if (!view) return false;
  const style = view.getComputedStyle(el);
  return style.display === 'none' || style.visibility === 'hidden';
}

/** True if the element or one of its ancestors is hidden. */
export function isRendered(el: Element): boolean {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    if (isHidden(cur)) return false;
  }
  return true;
}

/**
 * querySelectorAll that also looks inside open shadow roots (web components), which the normal one
 * skips. Results from shadow roots come after the light DOM ones.
 */
export function deepQueryAll(root: Document | ShadowRoot | Element, selector: string): Element[] {
  const out = Array.from(root.querySelectorAll(selector));
  root.querySelectorAll('*').forEach((el) => {
    // never read our own panel (it lives in a shadow root too)
    if (el.shadowRoot && el.id !== PANEL_HOST_ID) out.push(...deepQueryAll(el.shadowRoot, selector));
  });
  return out;
}

export function getText(root: Node, opts: TextOptions = {}): string {
  const out: string[] = [];
  let size = 0;
  const limit = opts.limit ?? Infinity;

  const walk = (node: Node) => {
    if (size >= limit) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.nodeValue ?? '';
      if (t.trim()) {
        out.push(t);
        size += t.length;
      } else if (t.length) {
        out.push(' ');
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    const el = node as Element;
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (SKIP_TAGS.has(el.tagName) || el.id === PANEL_HOST_ID) return;
      if (opts.exclude?.(el)) return;
      if (opts.skipHidden && isHidden(el)) return;
      if (el.tagName === 'IMG') {
        const alt = el.getAttribute('alt');
        if (alt && alt.trim()) out.push(` [תמונה: ${alt.trim()}] `);
        return;
      }
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
    }
    const block = node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(el.tagName);
    const cell = node.nodeType === Node.ELEMENT_NODE && (el.tagName === 'TD' || el.tagName === 'TH');
    if (block) out.push('\n');
    // web components: what's shown is the shadow tree, with light children placed into its <slot>s
    const shadow = node.nodeType === Node.ELEMENT_NODE ? el.shadowRoot : null;
    if (shadow) {
      for (let c = shadow.firstChild; c; c = c.nextSibling) walk(c);
    } else if (node.nodeType === Node.ELEMENT_NODE && el.tagName === 'SLOT') {
      const assigned = (el as HTMLSlotElement).assignedNodes?.({ flatten: true }) ?? [];
      if (assigned.length) assigned.forEach(walk);
      else for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
    } else {
      for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
    }
    if (block) out.push('\n');
    if (cell) out.push(' | ');
  };
  walk(root);
  return normalize(out.join(''));
}

export function normalize(text: string): string {
  return text
    .replace(/[ \t ‏‎]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Lowercase, drop punctuation and niqqud, collapse spaces: for fuzzy label matching. */
export function simplify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
