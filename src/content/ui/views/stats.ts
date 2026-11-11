import { h } from '../dom';

// ---------- ring + counters ----------

const SVGNS = 'http://www.w3.org/2000/svg';
const CIRC = 2 * Math.PI * 26;

function ring(fraction: number, label: string): HTMLElement {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(SVGNS, 'circle');
  const bar = document.createElementNS(SVGNS, 'circle');
  for (const c of [track, bar]) {
    c.setAttribute('cx', '32');
    c.setAttribute('cy', '32');
    c.setAttribute('r', '26');
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke-width', '6');
  }
  track.setAttribute('stroke', 'var(--line)');
  bar.setAttribute('stroke', 'var(--accent)');
  bar.setAttribute('stroke-linecap', 'round');
  bar.setAttribute('stroke-dasharray', String(CIRC));
  bar.setAttribute('stroke-dashoffset', String(CIRC * (1 - Math.max(0, Math.min(1, fraction)))));
  bar.setAttribute('transform', 'rotate(-90 32 32)');
  if (fraction <= 0) bar.setAttribute('stroke', 'transparent');
  svg.append(track, bar);
  return h('div', { class: 'ring' }, svg, h('span', { class: 'rl' }, label));
}

type Counter = [value: string, label: string, neg?: boolean];

export function statsStrip(fraction: number, label: string, counters: Counter[], aria: string) {
  return h(
    'div',
    { class: 'stats', role: 'group', 'aria-label': aria },
    ring(fraction, label),
    h('div', { class: 'counters' }, counters.map(([v, l, neg]) => h('div', { class: 'counter' }, h('b', { class: neg ? 'neg' : '' }, v), h('span', {}, l)))),
  );
}

/** Short enough for a counter: $0, <$0.01, $0.04, $1.20 */
export const shortCost = (usd: number) => (!usd ? '$0' : usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`);

