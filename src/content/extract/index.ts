import type { FrameSnapshot } from '../../shared/types';
import { getText } from '../text';
import { describeFields, findFieldGroups } from './fields';
import { findStory } from './story';
import { findVideos } from './videos';
import { findDocuments } from './documents';
import { findPagination } from './pages';
import { isRendered } from '../text';
import { looksLikeQuestion } from '../../shared/questions';
import { isBoilerplate, isWidgetFrame } from './boilerplate';
import { describeDrag, describeImageDrag, describeMarkWords } from './h5p';

const MAX_PAGE_TEXT = 60000;

/** Which known site we are on. Used for the label and small per-site tweaks. */
export function detectAdapter(loc: Location = location): string {
  const host = loc.hostname;
  if (host === 'docs.google.com' && loc.pathname.startsWith('/forms')) return 'google-forms';
  if (host === 'classroom.google.com') return 'google-classroom';
  if (host === 'docs.google.com') return 'google-docs';
  if (host.endsWith('cet.ac.il')) return 'cet';
  if (host.endsWith('classe.world') || document.querySelector('meta[name="sab-story-site"]:not([content="loose"])')) return 'classe';
  if (host.includes('ofek')) return 'ofek';
  if (document.querySelector('body#page-mod-quiz-attempt, .que .qtext, body.path-mod')) return 'moodle';
  return 'generic';
}

const STORY_HOST = /(^|\.)classe\.world$/;

/**
 * Literature (and with it the story and its side bar) is only on classe.world, so the story is
 * looked for automatically only there. Frames inside a classe page count too. A
 * <meta name="sab-story-site"> turns it on for test pages.
 */
export function isStorySite(doc: Document = document, loc: Location = location): boolean {
  if (STORY_HOST.test(loc.hostname)) return true;
  const ancestors = (loc as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
  if (ancestors) {
    for (let i = 0; i < ancestors.length; i++) {
      try {
        if (STORY_HOST.test(new URL(ancestors[i]).hostname)) return true;
      } catch {
        /* ignore */
      }
    }
  }
  if (doc.querySelector('meta[name="sab-story-site"]')) return true;
  try {
    return !!window.top?.document.querySelector('meta[name="sab-story-site"]');
  } catch {
    return false; // cross-origin parent
  }
}

/** classe: the story is only ever in the bar on the right (not "loose" test pages). */
function storyInRightBarOnly(doc: Document): boolean {
  if (STORY_HOST.test(location.hostname)) return true;
  return doc.querySelector('meta[name="sab-story-site"]')?.getAttribute('content') !== 'loose';
}

/** The page's main heading (the unit / task topic): an h1, a header title or an h2; else the tab title. */
export function pageTopic(doc: Document = document): string {
  const ok = (t: string) => t.length >= 4 && t.length <= 120 && !/^(מטח|מט"ח|classe|moodle|google)$/i.test(t);
  for (const sel of ['h1', 'header [class*="title" i], [class*="header" i] [class*="title" i], header h2, [class*="heading" i]', 'h2']) {
    for (const el of Array.from(doc.querySelectorAll(sel))) {
      if (el.closest('#sab-helper-host, button, a, nav') || !isRendered(el)) continue;
      const t = getText(el).replace(/\s+/g, ' ').trim();
      if (ok(t)) return t;
    }
  }
  const title = doc.title.split(/\s+[|·–-]\s+/)[0].trim();
  return ok(title) ? title : '';
}

/** Reads this frame: answer fields with their question text, the story (if any) and the page text. */
export function extractFrame(doc: Document = document): FrameSnapshot {
  // a chat / support / tracking widget frame is not part of the task
  if (isWidgetFrame()) return { url: location.href, title: doc.title, isTop: false, adapter: 'generic', fields: [], fullText: '', videos: [], documents: [] };
  const isTop = window === window.top;
  const groups = findFieldGroups(doc);
  const adapter = detectAdapter();
  let fields = describeFields(groups);
  // CET pages are full of inputs that are not questions ("+ idea" boxes in the sources map…):
  // keep the writing areas and the fields that sit next to a question
  if (adapter === 'cet' || doc.querySelector('meta[name="sab-section-tabs"]')) {
    fields = fields.filter((f) => f.kind === 'richtext' || f.kind === 'textarea' || looksLikeQuestion(f.context));
  }
  const manual = (window as unknown as { __sabManualStory?: Element }).__sabManualStory;
  const found = manual && manual.isConnected
    ? { info: { text: getText(manual), source: 'manual' }, element: manual }
    : isStorySite(doc)
      ? findStory(doc, isTop, storyInRightBarOnly(doc))
      : null;

  const fullText = doc.body
    ? getText(doc.body, {
        skipHidden: true,
        // never the story twice, and never privacy / terms / support / cookie / footer text
        exclude: (el) => el === found?.element || isBoilerplate(el),
        limit: MAX_PAGE_TEXT,
      }).slice(0, MAX_PAGE_TEXT)
    : '';

  return {
    url: location.href,
    title: doc.title,
    topic: isTop ? pageTopic(doc) || undefined : undefined,
    isTop,
    adapter,
    fields,
    story: found?.info,
    // a drag activity (no fields): its text with numbered blanks, the words and the zones
    fullText: [found?.element === doc.body ? '' : fullText, describeDrag(doc), describeMarkWords(doc), describeImageDrag(doc)].filter(Boolean).join('\n\n'),
    videos: findVideos(doc),
    documents: findDocuments(doc),
    pagesFound: findPagination(doc)?.buttons.length,
    questionMarkers: countQuestionMarkers(doc),
  };
}

const CHECK_RE = /^(send check|check|בדוק|בדיקה|שלח|שלח תשובה|submit answer)$/i;
const HEADING_RE = /^שאלה\s*(\d{1,2}|[א-ת]['׳]?)\b/;

/**
 * How many questions the page seems to have: "check" buttons (one per question on CET-like sites)
 * or "שאלה 3" headings. Used only to warn when fewer fields were found than that.
 */
export function countQuestionMarkers(doc: Document = document): number {
  let checks = 0;
  doc.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]').forEach((b) => {
    const label = ((b as HTMLInputElement).value || b.textContent || '').trim();
    if (CHECK_RE.test(label) && isRendered(b)) checks++;
  });
  const headings = new Set<string>();
  doc.querySelectorAll('h1, h2, h3, h4, h5, h6, p, div, span, strong, b, legend, label').forEach((el) => {
    const own = Array.from(el.childNodes).filter((c) => c.nodeType === Node.TEXT_NODE).map((c) => c.nodeValue ?? '').join('').trim();
    const m = own.match(HEADING_RE);
    if (m && isRendered(el)) headings.add(m[1]);
  });
  return Math.max(checks, headings.size);
}
