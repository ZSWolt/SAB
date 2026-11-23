import { getText } from '../text';

/**
 * Drag activities (H5P, used a lot in Moodle courses): "Drag the Words" (words into blanks in a text)
 * and "Drag and Drop" (items onto zones). They have no input fields, so we describe them for Claude:
 * the text with numbered blanks [[1]], the words to drag, and the zones by name.
 */

// H5P (drag-text / drag-question), Moodle ddwtos (span.draghome / span.drop), generic aria
export const DRAGGABLE = '.h5p-drag-draggable, .h5p-draggable, [aria-grabbed], [data-sab-draggable], .que.ddwtos span.draghome:not(.dragplaceholder)';
export const DROPZONE = '.h5p-drag-dropzone, .h5p-dropzone, [aria-dropeffect], [aria-label^="Drop Zone"], [data-sab-dropzone], .que.ddwtos span.drop';
/** Moodle ddwtos: the drop zones are chosen by keyboard (Space cycles the choices). */
export const isMoodleDrop = (z: Element) => z.matches('.que.ddwtos span.drop');
/** The choice number of a Moodle drag item (class "choice3"). */
export const choiceNo = (el: Element) => Number((el.getAttribute('class') ?? '').match(/(?:^|\s)choice(\d+)/)?.[1] ?? NaN);

const clean = (t: string) => t.replace(/\s+/g, ' ').trim();

/** Blanks in reading order (drag the words) or drop zones (drag and drop). */
export function dropzones(doc: Document = document): HTMLElement[] {
  return Array.from(doc.querySelectorAll<HTMLElement>(DROPZONE)).filter((z) => !z.closest('#sab-helper-host'));
}

export function draggables(doc: Document = document): HTMLElement[] {
  return Array.from(doc.querySelectorAll<HTMLElement>(DRAGGABLE)).filter((d) => !d.closest('#sab-helper-host') && clean(getText(d)));
}

/** A text for Claude describing the drag activity on this page, or ''. */
export function describeDrag(doc: Document = document): string {
  const zones = dropzones(doc);
  const items = draggables(doc);
  if (!zones.length || !items.length) return '';
  const words = [...new Set(items.map((d) => clean(getText(d))))];
  // drag the words: the zones sit inside the text; show the text with [[n]] in their place
  const host = zones[0].closest('.h5p-drag-droppable-words, .h5p-drag-text, .que.ddwtos .qtext, .h5p-question-content, [data-sab-dragtext]') as HTMLElement | null;
  if (host && zones.every((z) => host.contains(z))) {
    // mark the live zones and items first: selectors that need an ancestor (.que) don't match in a copy
    zones.forEach((z, i) => z.setAttribute('data-sab-zone', String(i + 1)));
    items.forEach((d) => d.setAttribute('data-sab-item', ''));
    const copy = host.cloneNode(true) as HTMLElement;
    zones.forEach((z) => z.removeAttribute('data-sab-zone'));
    items.forEach((d) => d.removeAttribute('data-sab-item'));
    copy.querySelectorAll('[data-sab-item], button, .h5p-question-buttons, .accesshide').forEach((b) => b.remove());
    copy.querySelectorAll('[data-sab-zone]').forEach((z) => z.replaceWith(doc.createTextNode(` [[${z.getAttribute('data-sab-zone')}]] `)));
    return `[פעילות גרירה: גוררים מילים לחורים בטקסט]\nהטקסט (החורים מסומנים [[מספר]]):\n${clean(copy.textContent ?? '')}\nמילים לגרירה: ${words.join(' | ')}`;
  }
  const names = zones.map((z, i) => clean(z.querySelector('.h5p-dropzone_label')?.textContent ?? '') || clean(z.getAttribute('aria-label') ?? '') || clean(getText(z)) || `אזור ${i + 1}`);
  return `[פעילות גרירה: גוררים פריטים לאזורים]\nאזורים: ${names.map((n, i) => `${i + 1}. ${n}`).join(' | ')}\nפריטים לגרירה: ${words.join(' | ')}`;
}

/** Mark the Words (H5P): the words that can be selected, inside their text. */
export function describeMarkWords(doc: Document = document): string {
  const box = doc.querySelector('.h5p-mark-the-words, .h5p-word-selection, [data-sab-markwords]');
  if (!box || !box.querySelector('[aria-selected]')) return '';
  return `[פעילות סימון מילים: לוחצים על המילים הנכונות בטקסט]\n${clean(box.textContent ?? '')}`;
}

/** Drag onto an image (Moodle ddimageortext / ddmarker): described, but filled by hand. */
export function describeImageDrag(doc: Document = document): string {
  return doc.querySelector('.que.ddimageortext .ddarea, .que.ddmarker .ddarea') ? '[גרירה על תמונה: את זה ממלאים ידנית, תכתוב ב-how בדיוק מה לגרור לאן]' : '';
}
