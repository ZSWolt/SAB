import type { FieldInfo, FieldKind } from '../../shared/types';
import { getText, isRendered, normalize } from '../text';

/** A field group found in the DOM: one text box, or one set of radio/checkbox options. */
export interface FieldGroup {
  id: string;
  kind: FieldKind;
  /** The text input itself, or each option element. */
  elements: Element[];
  optionLabels?: string[];
}

const ID_ATTR = 'data-sab-id';
const GROUP_ATTR = 'data-sab-group';
const TEXT_INPUT_TYPES = new Set(['', 'text', 'number', 'email', 'url', 'tel']);
/** Containers that usually hold exactly one question. */
const QUESTION_CONTAINERS = '[role="listitem"], .que, .question, .question-container, fieldset, [data-question-id], [class*="question" i]';

let counter = 0;
function nextId(): string {
  const w = window as unknown as { __sabCounter?: number };
  w.__sabCounter = (w.__sabCounter ?? counter) + 1;
  counter = w.__sabCounter;
  return `f${counter}`;
}

function inIgnoredArea(el: Element): boolean {
  return !!el.closest('[role="search"], nav, header[role="banner"], #sab-helper-host');
}

function existingId(els: Element[]): string | null {
  for (const el of els) {
    const id = el.getAttribute(ID_ATTR) ?? el.getAttribute(GROUP_ATTR);
    if (id) return id;
  }
  return null;
}

/** Label of a native input / role option. */
export function optionLabel(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return normalize(aria);
  const dataValue = el.getAttribute('data-value');
  if (dataValue?.trim()) return normalize(dataValue);
  if (el instanceof HTMLInputElement) {
    const labels = el.labels ? Array.from(el.labels) : [];
    const text = labels.map((l) => getText(l)).join(' ').trim();
    if (text) return text;
    const wrap = el.closest('label');
    if (wrap) {
      const t = getText(wrap);
      if (t) return t;
    }
    const next = el.nextElementSibling;
    if (next) {
      const t = getText(next);
      if (t) return t;
    }
    const parentText = el.parentElement ? getText(el.parentElement) : '';
    if (parentText && parentText.length < 200) return parentText;
    return el.value;
  }
  const own = getText(el);
  if (own) return own;
  return el.parentElement ? getText(el.parentElement).slice(0, 200) : '';
}

export function findFieldGroups(doc: Document = document): FieldGroup[] {
  const groups: FieldGroup[] = [];
  const seen = new Set<Element>();
  const radioGroups = new Map<string, Element[]>();
  const roleGroups = new Map<Element, { kind: FieldKind; els: Element[] }>();

  const all = doc.querySelectorAll(
    'input, textarea, select, [contenteditable], [role="textbox"], [role="radio"], [role="checkbox"]',
  );
  for (const el of Array.from(all)) {
    if (seen.has(el) || inIgnoredArea(el)) continue;
    const tag = el.tagName;
    const role = el.getAttribute('role');

    if (tag === 'INPUT') {
      const input = el as HTMLInputElement;
      const type = (input.getAttribute('type') ?? '').toLowerCase();
      if (input.disabled) continue;
      if (type === 'radio' || type === 'checkbox') {
        // the input itself is often visually hidden; check its label/container (hidden page = skip)
        if (!isRendered(input.closest('label') ?? input.parentElement ?? input)) continue;
        const key = `${type}|${input.form ? 'form' : 'doc'}|${input.name || Math.random()}`;
        // Unnamed checkboxes are independent; unnamed radios too.
        const list = radioGroups.get(key) ?? [];
        list.push(input);
        radioGroups.set(key, list);
        // keep document order by registering the group at its first element
        if (list.length === 1) groups.push({ id: '', kind: type as FieldKind, elements: list });
        continue;
      }
      if (!TEXT_INPUT_TYPES.has(type) || input.readOnly || !isRendered(input)) continue;
      groups.push({ id: '', kind: 'text', elements: [input] });
      continue;
    }
    if (tag === 'TEXTAREA') {
      const ta = el as HTMLTextAreaElement;
      if (ta.disabled || ta.readOnly || !isRendered(ta)) continue;
      groups.push({ id: '', kind: 'textarea', elements: [ta] });
      continue;
    }
    if (tag === 'SELECT') {
      const sel = el as HTMLSelectElement;
      if (sel.disabled || !isRendered(sel)) continue;
      groups.push({
        id: '',
        kind: 'select',
        elements: [sel],
        optionLabels: Array.from(sel.options).map((o) => normalize(o.text)).filter(Boolean),
      });
      continue;
    }
    if (role === 'radio' || role === 'checkbox') {
      if (!isRendered(el)) continue;
      const container =
        el.closest('[role="radiogroup"], [role="group"], [role="list"], [role="listitem"]') ?? el.parentElement ?? el;
      const entry = roleGroups.get(container) ?? { kind: role as FieldKind, els: [] };
      entry.els.push(el);
      if (entry.els.length === 1) {
        roleGroups.set(container, entry);
        groups.push({ id: '', kind: role as FieldKind, elements: entry.els });
      }
      continue;
    }
    const editable = el.getAttribute('contenteditable');
    const isEditable = editable === '' || editable === 'true' || editable === 'plaintext-only' || role === 'textbox';
    if (isEditable) {
      // only the outermost editable
      const parentEditable = el.parentElement?.closest('[contenteditable="true"], [contenteditable=""], [role="textbox"]');
      if (parentEditable || !isRendered(el)) continue;
      el.querySelectorAll('*').forEach((c) => seen.add(c));
      groups.push({ id: '', kind: 'richtext', elements: [el] });
    }
  }

  for (const g of groups) {
    g.id = existingId(g.elements) ?? nextId();
    if (g.kind === 'radio' || g.kind === 'checkbox') {
      g.elements.forEach((e) => e.setAttribute(GROUP_ATTR, g.id));
      g.optionLabels = g.elements.map(optionLabel);
    } else {
      g.elements[0].setAttribute(ID_ATTR, g.id);
    }
  }
  return groups;
}

function commonAncestor(els: Element[]): Element {
  let anc: Element = els[0];
  for (const e of els.slice(1)) {
    while (!anc.contains(e) && anc.parentElement) anc = anc.parentElement;
  }
  return anc;
}

function belongsOnlyTo(container: Element, id: string): boolean {
  const marked = container.querySelectorAll(`[${ID_ATTR}], [${GROUP_ATTR}]`);
  for (const m of Array.from(marked)) {
    if ((m.getAttribute(ID_ATTR) ?? m.getAttribute(GROUP_ATTR)) !== id) return false;
  }
  return true;
}

/** The text of the question a field belongs to. */
export function fieldContext(group: FieldGroup): string {
  const base = commonAncestor(group.elements);

  // A known per-question container (Google Forms list item, Moodle .que, fieldset...) holding only this field.
  const known = base.closest(QUESTION_CONTAINERS);
  if (known && belongsOnlyTo(known, group.id)) {
    const t = getText(known, { skipHidden: true });
    if (t.length >= 10) return t.slice(0, 2500);
  }

  // Otherwise go up while the ancestor contains no other field.
  let anc: Element = base;
  for (let i = 0; i < 10 && anc.parentElement && anc.parentElement !== anc.ownerDocument.body; i++) {
    if (!belongsOnlyTo(anc.parentElement, group.id)) break;
    anc = anc.parentElement;
  }
  let text = getText(anc, { skipHidden: true });

  // Too little text: borrow from the preceding siblings (the question is often right above the box).
  if (text.length < 25) {
    const before: string[] = [];
    let total = 0;
    for (let s = anc.previousElementSibling; s && total < 800; s = s.previousElementSibling) {
      if (!belongsOnlyTo(s, group.id)) break;
      const t = getText(s, { skipHidden: true });
      if (t) {
        before.unshift(t);
        total += t.length;
      }
    }
    text = normalize(`${before.join('\n')}\n${text}`);
  }
  return text.slice(-2500);
}

function currentValue(group: FieldGroup): string {
  const el = group.elements[0];
  switch (group.kind) {
    case 'text':
    case 'textarea':
      return (el as HTMLInputElement).value;
    case 'select': {
      const sel = el as HTMLSelectElement;
      return sel.selectedIndex >= 0 ? normalize(sel.options[sel.selectedIndex].text) : '';
    }
    case 'richtext':
      return getText(el);
    case 'radio':
    case 'checkbox':
      return group.elements
        .map((e, i) => {
          const checked = e instanceof HTMLInputElement ? e.checked : e.getAttribute('aria-checked') === 'true';
          return checked ? group.optionLabels?.[i] ?? '' : '';
        })
        .filter(Boolean)
        .join(', ');
  }
}

export function describeFields(groups: FieldGroup[]): FieldInfo[] {
  return groups.map((g) => {
    const info: FieldInfo = { id: g.id, kind: g.kind, context: fieldContext(g) };
    if (g.optionLabels) info.options = g.optionLabels;
    const value = currentValue(g);
    if (value) info.value = value.slice(0, 500);
    return info;
  });
}

export function findField(id: string, doc: Document = document): FieldGroup | null {
  const single = doc.querySelector(`[${ID_ATTR}="${CSS.escape(id)}"]`);
  if (single) {
    const tag = single.tagName;
    const kind: FieldKind =
      tag === 'TEXTAREA' ? 'textarea' : tag === 'SELECT' ? 'select' : tag === 'INPUT' ? 'text' : 'richtext';
    return { id, kind, elements: [single] };
  }
  const options = Array.from(doc.querySelectorAll(`[${GROUP_ATTR}="${CSS.escape(id)}"]`));
  if (!options.length) return null;
  const first = options[0];
  const kind: FieldKind =
    (first as HTMLInputElement).type === 'checkbox' || first.getAttribute('role') === 'checkbox' ? 'checkbox' : 'radio';
  return { id, kind, elements: options, optionLabels: options.map(optionLabel) };
}
