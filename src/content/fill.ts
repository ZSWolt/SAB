import type { FillItem, FillOutcome } from '../shared/types';
import { findField, type FieldGroup } from './extract/fields';
import { simplify } from './text';

interface Undo {
  restore: () => void;
}
const undoStack: Undo[] = [];
const HIGHLIGHT = '2px solid #22c55e';

function highlight(el: Element) {
  const h = el as HTMLElement;
  const prev = h.style.outline;
  h.style.outline = HIGHLIGHT;
  h.style.outlineOffset = '2px';
  undoStack.push({ restore: () => (h.style.outline = prev) });
}

function fire(el: Element, ...types: string[]) {
  for (const t of types) el.dispatchEvent(new Event(t, { bubbles: true }));
}

/** Sets a value the way a user would, so React/Angular/Vue forms notice it. */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  const prev = el.value;
  el.focus();
  if (setter) setter.call(el, value);
  else el.value = value;
  fire(el, 'input', 'change');
  el.blur();
  undoStack.push({
    restore: () => {
      if (setter) setter.call(el, prev);
      else el.value = prev;
      fire(el, 'input', 'change');
    },
  });
}

function setRichText(el: HTMLElement, value: string) {
  const prev = el.innerHTML;
  el.focus();
  let done = false;
  try {
    const sel = el.ownerDocument.getSelection();
    if (sel) {
      const range = el.ownerDocument.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      done = el.ownerDocument.execCommand?.('insertText', false, value) ?? false;
    }
  } catch {
    done = false;
  }
  if (!done || simplify(el.textContent ?? '') !== simplify(value)) {
    el.innerHTML = '';
    value.split('\n').forEach((line, i) => {
      if (i) el.appendChild(el.ownerDocument.createElement('br'));
      el.appendChild(el.ownerDocument.createTextNode(line));
    });
    fire(el, 'input', 'change');
  }
  el.blur();
  undoStack.push({ restore: () => { el.innerHTML = prev; fire(el, 'input'); } });
}

/** Score how well an option label matches the wanted answer (1 = exact). */
export function matchScore(label: string, wanted: string): number {
  const a = simplify(label);
  const b = simplify(wanted);
  if (!a || !b) return 0;
  if (a === b) return 1;
  // "ב. 1948" vs "1948" or "ב" alone
  const stripPrefix = (s: string) => s.replace(/^([א-תa-z]|\d{1,2})\s+/, '');
  if (stripPrefix(a) === stripPrefix(b)) return 0.95;
  if (b.length <= 2 && a.startsWith(b + ' ')) return 0.9;
  if (a.includes(b) || b.includes(a)) return 0.6 + 0.3 * (Math.min(a.length, b.length) / Math.max(a.length, b.length));
  const wa = new Set(a.split(' '));
  const wb = b.split(' ');
  const common = wb.filter((w) => wa.has(w)).length;
  return (common / Math.max(wa.size, wb.length)) * 0.6;
}

function isChecked(el: Element): boolean {
  return el instanceof HTMLInputElement ? el.checked : el.getAttribute('aria-checked') === 'true';
}

function pickOptions(group: FieldGroup, wanted: string): FillOutcome & { picked?: string[] } {
  const labels = group.optionLabels ?? [];
  // checkboxes may get several answers separated by ";" or newlines
  const wants = group.kind === 'checkbox' ? wanted.split(/\s*[;\n]\s*/).filter(Boolean) : [wanted];
  const picked: string[] = [];
  for (const w of wants) {
    let best = -1;
    let bestScore = 0;
    labels.forEach((l, i) => {
      const s = matchScore(l, w);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });
    if (best < 0 || bestScore < 0.45) continue;
    const el = group.elements[best] as HTMLElement;
    if (!isChecked(el)) {
      const prevChecked = group.elements.filter(isChecked) as HTMLElement[];
      el.click();
      if (el instanceof HTMLInputElement && !el.checked) {
        el.checked = true;
        fire(el, 'input', 'change');
      }
      undoStack.push({
        restore: () => {
          if (group.kind === 'radio' && prevChecked.length) prevChecked[0].click();
          else if (isChecked(el)) {
            if (el instanceof HTMLInputElement && el.type === 'radio') { el.checked = false; fire(el, 'change'); }
            else el.click();
          }
        },
      });
    }
    highlight(el.closest('label') ?? el);
    picked.push(labels[best]);
  }
  return picked.length
    ? { fieldId: group.id, ok: true, picked }
    : { fieldId: group.id, ok: false, message: 'לא מצאתי אפשרות מתאימה' };
}

function pickSelect(sel: HTMLSelectElement, wanted: string): boolean {
  let best = -1;
  let bestScore = 0;
  Array.from(sel.options).forEach((o, i) => {
    const s = matchScore(o.text, wanted);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  });
  if (best < 0 || bestScore < 0.45) return false;
  const prev = sel.selectedIndex;
  sel.selectedIndex = best;
  fire(sel, 'input', 'change');
  undoStack.push({ restore: () => { sel.selectedIndex = prev; fire(sel, 'change'); } });
  return true;
}

/** Fills the given fields in this frame. Never submits anything. */
export function fillFields(items: FillItem[], doc: Document = document): FillOutcome[] {
  return items.map((item) => {
    const group = findField(item.fieldId, doc);
    if (!group) return { fieldId: item.fieldId, ok: false, message: 'השדה לא נמצא. אולי הדף השתנה, אז כדאי לפתור שוב' };
    const el = group.elements[0];
    try {
      switch (group.kind) {
        case 'text':
        case 'textarea':
          setNativeValue(el as HTMLInputElement, item.value);
          highlight(el);
          return { fieldId: item.fieldId, ok: true };
        case 'richtext':
          setRichText(el as HTMLElement, item.value);
          highlight(el);
          return { fieldId: item.fieldId, ok: true };
        case 'select': {
          const ok = pickSelect(el as HTMLSelectElement, item.option ?? item.value);
          if (ok) highlight(el);
          return ok ? { fieldId: item.fieldId, ok } : { fieldId: item.fieldId, ok, message: 'לא מצאתי אפשרות מתאימה' };
        }
        case 'radio':
        case 'checkbox': {
          const { picked: _p, ...outcome } = pickOptions(group, item.option ?? item.value);
          return outcome;
        }
      }
    } catch (e) {
      return { fieldId: item.fieldId, ok: false, message: String(e) };
    }
  });
}

export function undoFill(): number {
  let n = 0;
  while (undoStack.length) {
    undoStack.pop()!.restore();
    n++;
  }
  return n;
}
