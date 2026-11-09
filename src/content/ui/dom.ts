import { icon, type IconName } from './icons';

type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined | null>;
export type Kid = Node | string | number | null | false | undefined | Kid[];

/** Tiny element builder: h('div', { class: 'x', onclick: fn }, 'text', child). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, kids);
  return el;
}

function append(el: Node, kids: Kid[]) {
  for (const k of kids) {
    if (k === null || k === false || k === undefined) continue;
    if (Array.isArray(k)) append(el, k);
    else el.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
  }
}

/** Replaces a region's content, keeping its scroll position. */
export function swap(region: HTMLElement, content: Kid) {
  const top = region.scrollTop;
  region.replaceChildren();
  append(region, [content]);
  region.scrollTop = top;
}

export const keys = (...k: string[]) => h('span', { class: 'kbd', 'aria-hidden': 'true' }, k.map((x) => h('kbd', {}, x)));

export function iconBtn(name: IconName, label: string, onclick: (e: Event) => void, cls = 'icon-btn') {
  return h('button', { type: 'button', class: cls, title: label, 'aria-label': label, onclick }, icon(name));
}

export function btn(label: Kid, onclick: (e: Event) => void, opts: { cls?: string; icon?: IconName; disabled?: boolean; title?: string } = {}) {
  return h(
    'button',
    { type: 'button', class: `btn ${opts.cls ?? ''}`.trim(), onclick, disabled: opts.disabled, title: opts.title },
    opts.icon ? icon(opts.icon, 16) : null,
    label,
  );
}

export const fmtCost = (usd: number) => `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
export const fmtDate = (t: number) => new Date(t).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);
