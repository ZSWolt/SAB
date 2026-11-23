import { PANEL_HOST_ID } from './text';
import { draggables, dropzones } from './extract/h5p';

/**
 * Activities without answer fields (CET and similar):
 * - matching: click a box from the first list, then the box that goes with it;
 * - marking sentences with a color legend: click the category, then select the sentence.
 * Boxes, buttons and sentences are found by their exact text.
 */

export interface ActivityResult {
  done: number;
  total: number;
  misses: string[];
}

const norm = (t: string) =>
  t
    .replace(/[\u200e\u200f\u00a0]/g, ' ')
    .replace(/[״“”]/g, '"')
    .replace(/[׳‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function visible(el: Element): boolean {
  const r = (el as HTMLElement).getBoundingClientRect?.();
  return !!r && (r.width > 0 || r.height > 0);
}

/** The smallest visible element whose whole text is `text` (or, failing that, contains it). */
export function findByText(text: string, doc: Document = document): HTMLElement | null {
  const want = norm(text);
  if (!want) return null;
  let exact: HTMLElement | null = null;
  let loose: { el: HTMLElement; extra: number } | null = null;
  doc.querySelectorAll<HTMLElement>('button, a, li, label, span, div, p, td, [role="button"], [draggable="true"]').forEach((el) => {
    if (el.closest(`#${PANEL_HOST_ID}`) || !visible(el)) return;
    const t = norm(el.textContent ?? '');
    if (t === want) {
      if (!exact || exact.contains(el)) exact = el;
    } else if (t.includes(want) && t.length < want.length * 1.6) {
      const extra = t.length - want.length;
      if (!loose || extra < loose.extra || (extra === loose.extra && loose.el.contains(el))) loose = { el, extra };
    }
  });
  return exact ?? (loose as { el: HTMLElement } | null)?.el ?? null;
}

function point(el: Element) {
  const r = el.getBoundingClientRect();
  return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true, composed: true };
}

/** A real-looking click: pointer, mouse and click events at the element's center. */
function press(el: Element) {
  const p = point(el);
  el.dispatchEvent(new PointerEvent('pointerdown', { ...p, pointerId: 1, isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mousedown', p));
  el.dispatchEvent(new PointerEvent('pointerup', { ...p, pointerId: 1, isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mouseup', p));
  el.dispatchEvent(new MouseEvent('click', p));
}

/** For drag-and-drop activities: an HTML5 drag from one box onto the other. */
function drag(from: Element, to: Element) {
  try {
    const dt = new DataTransfer();
    from.dispatchEvent(new DragEvent('dragstart', { ...point(from), dataTransfer: dt }));
    to.dispatchEvent(new DragEvent('dragenter', { ...point(to), dataTransfer: dt }));
    to.dispatchEvent(new DragEvent('dragover', { ...point(to), dataTransfer: dt }));
    to.dispatchEvent(new DragEvent('drop', { ...point(to), dataTransfer: dt }));
    from.dispatchEvent(new DragEvent('dragend', { ...point(from), dataTransfer: dt }));
  } catch {
    /* no drag support */
  }
}

/** A Range over `text` inside the page (spaces may differ). */
export function findTextRange(text: string, doc: Document = document): Range | null {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => ((n.parentElement?.closest(`#${PANEL_HOST_ID}, script, style, button`) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)),
  });
  const nodes: Text[] = [];
  let full = '';
  const starts: number[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    starts.push(full.length);
    nodes.push(n as Text);
    full += (n as Text).data;
  }
  const words = norm(text).split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/["']/g, '["\'״“”׳‘’]'));
  if (!words.length || !words[0]) return null;
  const m = new RegExp(words.join('[\\s\\u00a0]+')).exec(full.replace(/[\u200e\u200f]/g, ' '));
  if (!m) return null;
  const at = (pos: number) => {
    let i = starts.length - 1;
    while (i > 0 && starts[i] > pos) i--;
    return { node: nodes[i], offset: pos - starts[i] };
  };
  const a = at(m.index);
  const b = at(m.index + m[0].length);
  const range = doc.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, Math.min(b.offset, b.node.data.length));
  return range;
}

/** Dropped already? The item sits in the zone, or the activity marked it as placed. */
function placed(item: HTMLElement, zone: HTMLElement): boolean {
  return zone.contains(item) || /dropped|placed|h5p-drag-dropped/.test(`${item.className} ${zone.className}`) || zone.getAttribute('aria-grabbed') === 'false' && zone.textContent?.includes(item.textContent ?? '\u0000') === true;
}

function key(el: Element, k: string) {
  for (const type of ['keydown', 'keyup']) el.dispatchEvent(new KeyboardEvent(type, { key: k, code: k === ' ' ? 'Space' : k, keyCode: k === ' ' ? 32 : 13, which: k === ' ' ? 32 : 13, bubbles: true, cancelable: true }));
}

/** A mouse drag, the way drag libraries (jQuery UI in H5P) listen: down on the item, moves and up over the zone. */
async function mouseDrag(from: HTMLElement, to: HTMLElement) {
  const a = point(from);
  const b = point(to);
  const doc = from.ownerDocument;
  from.dispatchEvent(new PointerEvent('pointerdown', { ...a, pointerId: 1, isPrimary: true, button: 0, buttons: 1 }));
  from.dispatchEvent(new MouseEvent('mousedown', { ...a, button: 0, buttons: 1 }));
  for (let i = 1; i <= 8; i++) {
    const p = { ...a, clientX: a.clientX + ((b.clientX - a.clientX) * i) / 8, clientY: a.clientY + ((b.clientY - a.clientY) * i) / 8, buttons: 1 };
    doc.dispatchEvent(new PointerEvent('pointermove', { ...p, pointerId: 1, isPrimary: true }));
    doc.dispatchEvent(new MouseEvent('mousemove', p));
    await sleep(15);
  }
  to.dispatchEvent(new PointerEvent('pointerup', { ...b, pointerId: 1, isPrimary: true, button: 0 }));
  to.dispatchEvent(new MouseEvent('mouseup', { ...b, button: 0 }));
  doc.dispatchEvent(new MouseEvent('mouseup', { ...b, button: 0 }));
}

/** Puts a draggable word/item into a blank or zone: the keyboard way first (H5P supports it), then the mouse. */
async function dropInto(item: HTMLElement, zone: HTMLElement): Promise<boolean> {
  item.focus?.();
  key(item, 'Enter');
  await sleep(80);
  zone.focus?.();
  key(zone, 'Enter');
  await sleep(150);
  if (placed(item, zone)) return true;
  await mouseDrag(item, zone);
  await sleep(200);
  if (placed(item, zone)) return true;
  drag(item, zone); // HTML5 drag and drop
  await sleep(150);
  return placed(item, zone);
}

export async function runActivity(act: { matches?: { from: string; to: string }[] | null; highlights?: { label: string; text: string }[] | null }, doc: Document = document): Promise<ActivityResult> {
  const out: ActivityResult = { done: 0, total: 0, misses: [] };
  // drag activities: "to" is a blank number ("3") or a zone's name; "from" is the word / item
  const zones = dropzones(doc);
  const items = draggables(doc);
  for (const m of act.matches ?? []) {
    if (!zones.length || !items.length) break;
    const want = norm(m.from);
    const item = items.find((d) => norm(d.textContent ?? '') === want && !zones.some((z) => z.contains(d))) ?? items.find((d) => norm(d.textContent ?? '') === want);
    const n = Number(m.to.match(/^\D*(\d{1,3})\D*$/)?.[1]);
    const zone = Number.isFinite(n) && n >= 1 && n <= zones.length ? zones[n - 1] : zones.find((z) => norm(z.getAttribute('aria-label') ?? z.textContent ?? '') === norm(m.to));
    out.total++;
    if (!item || !zone) {
      out.misses.push(!item ? m.from : m.to);
      continue;
    }
    if (await dropInto(item, zone)) out.done++;
    else out.misses.push(`${m.from} → ${m.to}`);
  }
  for (const m of zones.length && items.length ? [] : act.matches ?? []) {
    out.total++;
    const from = findByText(m.from, doc);
    const to = findByText(m.to, doc);
    if (!from || !to) {
      out.misses.push(!from ? m.from : m.to);
      continue;
    }
    press(from);
    await sleep(150);
    press(to);
    await sleep(150);
    if (from.draggable || from.getAttribute('draggable') === 'true') drag(from, to);
    out.done++;
  }
  // marking: one category at a time (its color button), then each of its sentences
  const byLabel = new Map<string, string[]>();
  for (const h of act.highlights ?? []) byLabel.set(h.label, [...(byLabel.get(h.label) ?? []), h.text]);
  for (const [label, texts] of byLabel) {
    out.total += texts.length;
    const btn = findByText(label, doc);
    if (!btn) {
      out.misses.push(label);
      continue;
    }
    for (const t of texts) {
      press(btn);
      await sleep(120);
      const range = findTextRange(t, doc);
      if (!range) {
        out.misses.push(t.slice(0, 40));
        continue;
      }
      const sel = doc.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      const host = (range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement) as Element;
      doc.dispatchEvent(new Event('selectionchange'));
      host.dispatchEvent(new PointerEvent('pointerup', { ...point(host), pointerId: 1, isPrimary: true }));
      host.dispatchEvent(new MouseEvent('mouseup', point(host)));
      await sleep(150);
      out.done++;
    }
    doc.getSelection()?.removeAllRanges();
  }
  return out;
}
