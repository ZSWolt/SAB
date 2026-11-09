import type { ReviewItem } from '../../../shared/types';
import { btn, h } from '../dom';
import type { UIState } from '../store';
import { errorBanner, sourcesList, statusLine } from './common';
import type { Actions, Rendered } from './types';

function reviewRow(item: ReviewItem, i: number, s: UIState, a: Actions): HTMLElement {
  const open = s.openRow === i;
  const q = item.questionText || [item.question, item.part].filter(Boolean).join(' · ') || 'שאלה';
  const filled = item.field_id ? s.filled[item.field_id] : undefined;
  return h(
    'div',
    { class: 'item' },
    h(
      'button',
      { type: 'button', class: 'qrow', 'aria-expanded': String(open), onclick: () => a.toggleRow(i) },
      h('span', { class: 'grade', title: 'ציון', 'aria-label': `ציון ${item.grade}` }, String(item.grade)),
      h(
        'span',
        { class: 'qmain' },
        h('span', { class: 'qtext strong', title: q }, q),
        item.studentAnswer ? h('span', { class: 'qtext', title: item.studentAnswer }, `כתבת: ${item.studentAnswer}`) : null,
      ),
      h('span', { class: 'qside' }, filled?.ok ? h('span', { class: 'qstatus ok' }, 'הוחלף') : null, item.page ? h('span', { class: 'qpage' }, `עמ' ${item.page}`) : null),
    ),
    open
      ? h(
          'div',
          { class: 'qmore review' },
          item.correct ? h('div', {}, h('div', { class: 'label' }, 'מה טוב'), h('div', { class: 'sec' }, item.correct)) : null,
          item.missing ? h('div', {}, h('div', { class: 'label' }, 'מה חסר'), h('div', { class: 'sec' }, item.missing)) : null,
          h('div', {}, h('div', { class: 'label' }, 'גרסה משופרת'), h('div', { class: 'full' }, item.improved)),
          h(
            'div',
            { class: 'row' },
            btn('העתק', () => a.copy(item.improved), { cls: 'sm', icon: 'copy' }),
            item.field_id ? btn('החלף בגרסה המשופרת', () => a.replaceWithImproved(item), { cls: 'sm', icon: 'fill' }) : null,
          ),
        )
      : null,
  );
}

export function reviewView(s: UIState, a: Actions): Rendered {
  const r = s.review!;
  const avg = r.items.length ? Math.round(r.items.reduce((n, i) => n + i.grade, 0) / r.items.length) : 0;
  return {
    body: [
      errorBanner(s),
      statusLine(`הבדיקה מוכנה · ציון ממוצע ${avg}`, r.costUsd),
      r.overall ? h('div', { class: 'note' }, r.overall) : null,
      h('div', { class: 'list reviews' }, r.items.map((it, i) => reviewRow(it, i, s, a))),
      sourcesList(r.sources),
      btn('חזרה למסך הפתיחה', () => a.backToIdle(), { cls: 'ghost sm', icon: 'back' }),
    ],
  };
}
