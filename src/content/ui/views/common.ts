import type { Source } from '../../../shared/types';
import { fmtCost, h } from '../dom';
import { icon, type IconName } from '../icons';
import type { UIState } from '../store';

export const metaRow = (name: IconName, text: string, opts: { bad?: boolean; title?: string } = {}) =>
  h('div', { class: opts.bad ? 'm bad' : 'm', title: opts.title ?? text }, icon(name), h('span', { class: 't' }, text));

export function statusLine(text: string, cost?: number, spinning = false) {
  return h(
    'div',
    { class: 'status', role: 'status' },
    spinning ? h('span', { class: 'spinner' }) : icon('check'),
    h('span', { class: 't' }, text),
    cost ? h('span', { class: 'cost', title: 'עלות משוערת' }, fmtCost(cost)) : null,
  );
}

export function errorBanner(s: UIState) {
  if (!s.error) return null;
  return h('div', { class: 'banner err', role: 'alert' }, h('div', { class: 'bt' }, icon('alert'), 'משהו השתבש'), h('div', { class: 'txt' }, s.error));
}

export function sourcesList(list: Source[]) {
  if (!list.length) return null;
  return h(
    'div',
    { class: 'sources' },
    h('div', { class: 'label' }, 'מקורות'),
    list.map((src) => {
      let dom = '';
      try {
        dom = new URL(src.url).hostname.replace(/^www\./, '');
      } catch {
        /* ignore */
      }
      return h('a', { href: src.url, target: '_blank', rel: 'noopener', title: src.url }, icon('link'), h('span', { class: 't' }, src.title || dom), h('span', { class: 'dom' }, dom));
    }),
  );
}
