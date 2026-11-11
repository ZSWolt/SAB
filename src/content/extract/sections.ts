import { getText, isRendered } from '../text';

/**
 * Section tabs at the top of a task, like on CET (bagruthumanities): "המשימה | מפת מקורות |
 * שולחן כתיבה | שיתוף". Each tab shows a different part of the same task (sources, the writing
 * desk with questions), so we read them all. Only on CET, where these tabs are part of the task;
 * elsewhere a row of links at the top is usually the site's menu and must not be clicked.
 */

export interface SectionTabs {
  tabs: HTMLElement[];
  labels: string[];
  current: number; // 1-based
}

/** Tabs that are not part of the task's content. */
const SKIP_RE = /^(שיתוף|שתף|share|הדפס[הו]?|print|יציאה|התנתק|logout|exit|עזרה|help|הגדרות|settings|בית|home|דף הבית|חזרה|back)$/i;
const ACTIVE_RE = /(^|[\s_-])(active|current|selected|is-active|is-current|on|chosen|open)($|[\s_-])/i;

export function sectionTabsEnabled(doc: Document = document, loc: Location = location): boolean {
  return /(^|\.)cet\.ac\.il$/.test(loc.hostname) || !!doc.querySelector('meta[name="sab-section-tabs"]');
}

function label(el: Element): string {
  return getText(el).replace(/\s+/g, ' ').trim();
}

function isTabLike(el: HTMLElement): boolean {
  if (el.closest('#sab-helper-host, label, select, table, form')) return false;
  if (el.querySelector('input, textarea, select')) return false;
  const t = label(el);
  if (!t || t.length > 24 || t.split(' ').length > 4 || /^\d+$/.test(t)) return false;
  // a link to another page is site navigation, not a tab of this task
  const href = el.getAttribute('href');
  if (el.tagName === 'A' && href && !/^(#|javascript:)/i.test(href)) {
    try {
      const u = new URL(href, el.ownerDocument.baseURI);
      if (u.pathname !== el.ownerDocument.location.pathname) return false;
    } catch {
      return false;
    }
  }
  return isRendered(el);
}

function looksActive(el: Element, stop: Element): boolean {
  for (let cur: Element | null = el; cur && cur !== stop; cur = cur.parentElement) {
    if (cur.getAttribute('aria-selected') === 'true' || (cur.getAttribute('aria-current') ?? 'false') !== 'false') return true;
    if (ACTIVE_RE.test(cur.getAttribute('class') ?? '')) return true;
  }
  return false;
}

function styleKey(el: Element): string {
  const view = el.ownerDocument.defaultView;
  if (!view) return '';
  const s = view.getComputedStyle(el);
  return `${s.color}|${s.backgroundColor}|${s.fontWeight}|${s.borderBottomColor}|${s.borderBottomWidth}`;
}

/** The deepest clickable thing in a list item (<li><a>…</a></li> → the <a>). */
function clickable(item: Element): HTMLElement {
  return (item.matches('a, button, [role="tab"]') ? item : item.querySelector('a, button, [role="tab"]') ?? item) as HTMLElement;
}

export function findSectionTabs(doc: Document = document): SectionTabs | null {
  if (!sectionTabsEnabled(doc)) return null;
  const groups: Element[] = [
    ...Array.from(doc.querySelectorAll('[role="tablist"]')),
    ...Array.from(doc.querySelectorAll('nav ul, nav, header ul, ul[class*="tab" i], div[class*="tab" i], ul[class*="nav" i]')),
  ];
  for (const g of groups) {
    if (g.closest('#sab-helper-host')) continue;
    const items = (g.matches('[role="tablist"]') ? Array.from(g.querySelectorAll('[role="tab"]')) : Array.from(g.children)).map(clickable);
    const tabs = items.filter(isTabLike);
    if (tabs.length < 2 || tabs.length > 8 || tabs.length < items.length - 1) continue;
    const labels = tabs.map(label);
    if (new Set(labels).size !== labels.length) continue;
    let current = tabs.findIndex((t) => looksActive(t, g)) + 1;
    if (!current) {
      // the one tab drawn differently (e.g. yellow text on blue) is the open one
      const keys = tabs.map(styleKey);
      const unique = keys.filter((k) => keys.indexOf(k) === keys.lastIndexOf(k));
      if (unique.length === 1) current = keys.indexOf(unique[0]) + 1;
    }
    if (!current) continue;
    // drop "share", "print"… (they open dialogs, not task content); keep at least two
    const keep = labels.map((l, i) => (SKIP_RE.test(l) && i + 1 !== current ? -1 : i)).filter((i) => i >= 0);
    if (keep.length < 2) continue;
    return { tabs: keep.map((i) => tabs[i]), labels: keep.map((i) => labels[i]), current: Math.max(1, keep.indexOf(current - 1) + 1) };
  }
  return null;
}
