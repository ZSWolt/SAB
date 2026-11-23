import { getText } from '../text';

/**
 * Drag activities (H5P, used a lot in Moodle courses): "Drag the Words" (words into blanks in a text)
 * and "Drag and Drop" (items onto zones). They have no input fields, so we describe them for Claude:
 * the text with numbered blanks [[1]], the words to drag, and the zones by name.
 */

export const DRAGGABLE = '.h5p-drag-draggable, .h5p-draggable, [aria-grabbed], [data-sab-draggable]';
export const DROPZONE = '.h5p-drag-dropzone, .h5p-dropzone, [aria-dropeffect], [data-sab-dropzone]';

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
  const host = zones[0].closest('.h5p-drag-text, .h5p-question-content, [data-sab-dragtext]') as HTMLElement | null;
  if (host && zones.every((z) => host.contains(z))) {
    const copy = host.cloneNode(true) as HTMLElement;
    copy.querySelectorAll(DRAGGABLE).forEach((d) => d.remove());
    copy.querySelectorAll('button, .h5p-question-buttons').forEach((b) => b.remove());
    Array.from(copy.querySelectorAll(DROPZONE)).forEach((z, i) => z.replaceWith(doc.createTextNode(` [[${i + 1}]] `)));
    return `[פעילות גרירה: גוררים מילים לחורים בטקסט]\nהטקסט (החורים מסומנים [[מספר]]):\n${clean(copy.textContent ?? '')}\nמילים לגרירה: ${words.join(' | ')}`;
  }
  const names = zones.map((z, i) => clean(z.getAttribute('aria-label') ?? '') || clean(getText(z)) || `אזור ${i + 1}`);
  return `[פעילות גרירה: גוררים פריטים לאזורים]\nאזורים: ${names.map((n, i) => `${i + 1}. ${n}`).join(' | ')}\nפריטים לגרירה: ${words.join(' | ')}`;
}
