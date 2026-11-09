import type { FrameSnapshot } from '../../shared/types';
import { getText } from '../text';
import { describeFields, findFieldGroups } from './fields';
import { findStory } from './story';
import { findVideos } from './videos';
import { findDocuments } from './documents';
import { findPagination } from './pages';
import { isRendered } from '../text';

const MAX_PAGE_TEXT = 60000;

/** Which known site we are on. Used for the label and small per-site tweaks. */
export function detectAdapter(loc: Location = location): string {
  const host = loc.hostname;
  if (host === 'docs.google.com' && loc.pathname.startsWith('/forms')) return 'google-forms';
  if (host === 'classroom.google.com') return 'google-classroom';
  if (host === 'docs.google.com') return 'google-docs';
  if (host.endsWith('cet.ac.il')) return 'cet';
  if (host.endsWith('classe.world')) return 'classe';
  if (host.includes('ofek')) return 'ofek';
  if (document.querySelector('body#page-mod-quiz-attempt, .que .qtext, body.path-mod')) return 'moodle';
  return 'generic';
}

/** Reads this frame: answer fields with their question text, the story (if any) and the page text. */
export function extractFrame(doc: Document = document): FrameSnapshot {
  const isTop = window === window.top;
  const groups = findFieldGroups(doc);
  const fields = describeFields(groups);
  const manual = (window as unknown as { __sabManualStory?: Element }).__sabManualStory;
  const found = manual && manual.isConnected
    ? { info: { text: getText(manual), source: 'manual' }, element: manual }
    : findStory(doc, isTop);

  const fullText = doc.body
    ? getText(doc.body, {
        skipHidden: true,
        exclude: found ? (el) => el === found.element : undefined,
        limit: MAX_PAGE_TEXT,
      }).slice(0, MAX_PAGE_TEXT)
    : '';

  return {
    url: location.href,
    title: doc.title,
    isTop,
    adapter: detectAdapter(),
    fields,
    story: found?.info,
    fullText: found?.element === doc.body ? '' : fullText,
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
