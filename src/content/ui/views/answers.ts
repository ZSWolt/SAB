import { answerLabels, missingLabels, questionLabel } from '../../../shared/labels';
import type { Answer, ReviewItem, SolveResult } from '../../../shared/types';
import { btn, fmtDate, h, iconBtn, keys, plural } from '../dom';
import { icon } from '../icons';
import type { Filter, UIState } from '../store';
import { errorBanner, metaRow, sourcesList } from './common';
import { shortCost, statsStrip } from './stats';
import type { Actions, Rendered } from './types';

// ---------- question numbers ----------

export { questionLabel };

const qbadge = (label: string) => h('span', { class: 'qbadge' }, label);

// ---------- answer status ----------

type RowKind = 'filled' | 'unfilled' | 'copy' | 'missing';

function answerKind(a: Answer, s: UIState): RowKind {
  if (!a.field_id) return 'copy';
  return s.filled[a.field_id]?.ok ? 'filled' : 'unfilled';
}

const CHIP: Record<RowKind, [string, string]> = { filled: ['מולא', 'ok'], unfilled: ['לא מולא', ''], copy: ['להעתקה', ''], missing: ['חסר', 'bad'] };

export function filterCounts(r: SolveResult, s: UIState): Record<Filter, number> {
  const kinds = r.answers.map((a) => answerKind(a, s));
  return {
    all: r.answers.length + (r.missing?.length ?? 0),
    missing: r.missing?.length ?? 0,
    unfilled: kinds.filter((k) => k === 'unfilled').length,
    filled: kinds.filter((k) => k === 'filled').length,
  };
}

// ---------- rows ----------

function resultRow(ans: Answer, i: number, label: string, s: UIState, a: Actions): HTMLElement {
  const kind = answerKind(ans, s);
  const [chip, cls] = CHIP[kind];
  const open = s.openRow === i;
  const q = ans.questionText || [ans.question, ans.part].filter(Boolean).join(' · ') || 'תשובה';
  const fillMsg = ans.field_id ? s.filled[ans.field_id]?.message : undefined;
  return h(
    'div',
    { class: 'item' },
    h(
      'button',
      { type: 'button', class: 'crow', 'aria-expanded': String(open), onclick: () => a.toggleRow(i) },
      h(
        'span',
        { class: 'cmain' },
        h('span', { class: 'qline' }, qbadge(label), ans.page ? h('span', { class: 'qpage' }, `עמוד ${ans.page}`) : null),
        h('span', { class: 'cq', title: q }, q),
        ans.option ? h('span', { class: 'cs' }, h('span', { class: 'hl' }, ans.option)) : h('span', { class: 'cs' }, ans.answer),
      ),
      h('span', { class: `chip ${cls}` }, chip),
    ),
    open
      ? h(
          'div',
          { class: 'qmore' },
          ans.option ? h('div', { class: 'full' }, h('span', { class: 'hl' }, ans.option)) : null,
          h('div', { class: ans.option ? 'sec' : 'full' }, ans.answer),
          fillMsg ? h('div', { class: 'qstatus bad' }, fillMsg) : null,
          h('div', { class: 'row' }, btn('העתק', () => a.copy(ans.option ?? ans.answer), { cls: 'sm', icon: 'copy' }), ans.field_id ? btn('מלא בשדה', () => a.fill([ans]), { cls: 'sm', icon: 'fill' }) : null),
        )
      : null,
  );
}

function missingRow(m: { field_id: string; context: string }, label: string, a: Actions): HTMLElement {
  return h(
    'div',
    { class: 'item missing' },
    h(
      'div',
      { class: 'crow', style: 'cursor:default' },
      h('span', { class: 'cmain' }, h('span', { class: 'qline' }, qbadge(label)), h('span', { class: 'cq', title: m.context }, m.context.slice(0, 120)), h('span', { class: 'cs' }, 'לא נמצאה תשובה')),
      btn('השלם', () => a.completeMissing(), { cls: 'sm' }),
      h('span', { class: 'chip bad' }, 'חסר'),
    ),
  );
}

export function notices(r: SolveResult, s: UIState, a: Actions): (HTMLElement | null)[] {
  const out: (HTMLElement | null)[] = [];
  if (s.savedAt) {
    out.push(
      h(
        'div',
        { class: 'banner info' },
        h('div', {}, s.savedElsewhere ? `תשובות שמורות מ-${fmtDate(s.savedAt)}, מדף אחר. אפשר להעתיק אבל לא למלא` : `כבר פתרת את הדף הזה ב-${fmtDate(s.savedAt)}. אלה התשובות השמורות, בלי עלות`),
        s.savedElsewhere ? null : btn('פתור מחדש', () => a.solveAgain(), { cls: 'sm', icon: 'refresh' }),
      ),
    );
  }
  if (r.questionGap) {
    out.push(
      h(
        'div',
        { class: 'banner warn' },
        h('div', { class: 'bt' }, icon('alert'), `בדף יש כנראה ${r.questionGap.markers} שאלות, ומצאתי רק ${r.questionGap.fields} שדות`),
        h('div', { class: 'txt' }, 'Claude ענה גם על השאלות שבטקסט. את אלה שאין להן שדה צריך להעתיק. אם זה חוזר, "ייצא מבנה דף" יעזור לי לתקן'),
      ),
    );
  }
  if (r.duplicates?.length) out.push(h('div', { class: 'banner warn' }, h('div', { class: 'bt' }, icon('alert'), `${r.duplicates.length} שדות קיבלו יותר מתשובה אחת. כדאי לבדוק אותם לפני מילוי`)));
  if (r.storyFromMemory) out.push(h('div', { class: 'banner info' }, 'הסיפור נלקח מעמוד קודם של אותה משימה'));
  return out;
}

const FILTERS: [Filter, string][] = [['all', 'הכול'], ['missing', 'חסר'], ['unfilled', 'לא מולא'], ['filled', 'מולא']];

function answersList(s: UIState, a: Actions): Rendered {
  const r = s.result!;
  const counts = filterCounts(r, s);
  const answered = r.answers.length;
  const labels = answerLabels(r.answers);
  const mLabels = missingLabels(labels, r.missing?.length ?? 0);
  const rows: HTMLElement[] = [];
  r.answers.forEach((ans, i) => {
    const k = answerKind(ans, s);
    if (s.filter === 'all' || (s.filter === 'filled' && k === 'filled') || (s.filter === 'unfilled' && k === 'unfilled')) rows.push(resultRow(ans, i, labels[i], s, a));
  });
  if (s.filter === 'all' || s.filter === 'missing') {
    r.missing?.forEach((m, i) => rows.push(missingRow(m, mLabels[i], a)));
  }
  const fillable = r.answers.some((x) => x.field_id);
  const failedDocs = (r.documents ?? []).filter((d) => !d.ok);
  const failedVideos = (r.videos ?? []).filter((v) => !v.ok);
  return {
    top: statsStrip(counts.all ? answered / counts.all : 0, `${answered}/${counts.all}`, [[String(counts.all), 'שאלות'], [String(counts.filled), 'מולאו'], [String(counts.missing), 'חסרות', counts.missing > 0], [shortCost(r.costUsd), 'עלות']], 'סיכום התשובות'),
    body: [
      modeSwitch(s, a),
      errorBanner(s),
      notices(r, s, a),
      failedDocs.map((d) => metaRow('alert', `לא נקרא: ${d.title}${d.message ? ` · ${d.message}` : ''}`, { bad: true })),
      failedVideos.map((v) => metaRow('alert', `לא נצפה: ${v.url.replace('https://www.', '')}${v.message ? ` · ${v.message}` : ''}`, { bad: true, title: v.url })),
      h(
        'div',
        { class: 'seg', role: 'group', 'aria-label': 'מסנן' },
        FILTERS.map(([id, label]) => h('button', { type: 'button', 'aria-pressed': String(s.filter === id), onclick: () => a.setFilter(id) }, label, ' ', h('span', { class: 'num', style: 'font-family:var(--mono)' }, String(counts[id])))),
      ),
      rows.length ? h('div', { class: 'list answers' }, rows) : h('div', { class: 'muted' }, 'אין שאלות במסנן הזה'),
      r.notes ? h('div', { class: 'note' }, r.notes) : null,
      sourcesList(r.sources),
    ],
    foot: fillable
      ? [
          h(
            'button',
            { type: 'button', class: 'btn primary fill-all', title: 'Alt Shift F', onclick: () => a.fill(r.answers) },
            h('span', { class: 'lbl' }, icon('fill'), 'מלא הכול בדף'),
            counts.missing ? null : keys('Alt', 'Shift', 'F'),
          ),
          counts.missing ? btn('השלם חסר', () => a.completeMissing(), { cls: '', icon: 'plus' }) : null,
          iconBtn('undo', 'בטל מילוי', () => a.undo(), 'icon-btn box'),
          iconBtn('copy', 'העתק הכול', () => a.copyAll(), 'icon-btn box'),
        ]
      : [iconBtn('copy', 'העתק הכול', () => a.copyAll(), 'icon-btn box')],
  };
}

// ---------- check me ----------

function reviewRow(item: ReviewItem, i: number, label: string, s: UIState, a: Actions): HTMLElement {
  const open = s.openRow === i;
  const q = item.questionText || [item.question, item.part].filter(Boolean).join(' · ') || 'שאלה';
  const [chip, cls] = item.grade >= 85 ? ['מצוין', 'ok'] : item.grade >= 70 ? ['טוב', 'acc'] : ['לשפר', 'bad'];
  const replaced = item.field_id ? s.filled[item.field_id]?.ok : false;
  return h(
    'div',
    { class: 'item' },
    h(
      'button',
      { type: 'button', class: 'crow', 'aria-expanded': String(open), onclick: () => a.toggleRow(i) },
      h(
        'span',
        { class: 'cmain' },
        h('span', { class: 'qline' }, qbadge(label), item.page ? h('span', { class: 'qpage' }, `עמוד ${item.page}`) : null),
        h('span', { class: 'cq', title: q }, q),
        h('span', { class: 'gbar', 'aria-label': `ציון ${item.grade}` }, h('i', {}, h('b', { style: `width:${item.grade}%` })), h('span', {}, String(item.grade))),
        item.studentAnswer ? h('span', { class: 'cs', title: item.studentAnswer }, `כתבת: ${item.studentAnswer}`) : null,
      ),
      h('span', { class: `chip ${replaced ? 'ok' : cls}` }, replaced ? 'הוחלף' : chip),
    ),
    open
      ? h(
          'div',
          { class: 'qmore' },
          item.correct ? h('div', {}, h('div', { class: 'label' }, 'מה טוב'), h('div', { class: 'sec' }, item.correct)) : null,
          item.missing ? h('div', {}, h('div', { class: 'label' }, 'מה חסר'), h('div', { class: 'sec' }, item.missing)) : null,
          h('div', {}, h('div', { class: 'label' }, 'גרסה משופרת'), h('div', { class: 'full' }, item.improved)),
          h('div', { class: 'row' }, btn('העתק', () => a.copy(item.improved), { cls: 'sm', icon: 'copy' }), item.field_id ? btn('החלף בגרסה המשופרת', () => a.replaceWithImproved(item), { cls: 'sm', icon: 'fill' }) : null),
        )
      : null,
  );
}

function gradesList(s: UIState, a: Actions): Rendered {
  const r = s.review!;
  const avg = r.items.length ? Math.round(r.items.reduce((n, i) => n + i.grade, 0) / r.items.length) : 0;
  const weak = r.items.filter((i) => i.grade < 70).length;
  const reviewLabels = answerLabels(r.items);
  return {
    top: statsStrip(avg / 100, String(avg), [[String(r.items.length), 'נבדקו'], [String(avg), 'ממוצע'], [String(weak), 'לשפר', weak > 0], [shortCost(r.costUsd), 'עלות']], 'סיכום הבדיקה'),
    body: [
      modeSwitch(s, a),
      errorBanner(s),
      h('div', { class: 'status' }, icon('check'), h('span', { class: 't' }, `הבדיקה מוכנה · ציון ממוצע ${avg} · ${plural(r.items.length, 'שאלה אחת', 'שאלות')}`)),
      r.overall ? h('div', { class: 'note' }, r.overall) : null,
      r.items.length ? h('div', { class: 'list reviews' }, r.items.map((it, i) => reviewRow(it, i, reviewLabels[i], s, a))) : h('div', { class: 'muted' }, 'לא נמצאו תשובות שלך לבדוק'),
      sourcesList(r.sources),
    ],
  };
}

/** "תשובות | ציונים" when there are both. */
function modeSwitch(s: UIState, a: Actions): HTMLElement | null {
  if (!s.result || !s.review) return null;
  return h(
    'div',
    { class: 'seg', role: 'group', 'aria-label': 'מה להציג' },
    h('button', { type: 'button', 'aria-pressed': String(s.answersMode === 'answers'), onclick: () => a.setAnswersMode('answers') }, icon('answers'), ' תשובות'),
    h('button', { type: 'button', 'aria-pressed': String(s.answersMode === 'grades'), onclick: () => a.setAnswersMode('grades') }, icon('review'), ' ציונים'),
  );
}

export function answersView(s: UIState, a: Actions): Rendered {
  const grades = s.review && (s.answersMode === 'grades' || !s.result);
  if (grades) return gradesList(s, a);
  if (s.result) return answersList(s, a);
  return {
    body: h(
      'div',
      { class: 'card pad empty-tab' },
      icon('answers', 24),
      h('b', {}, 'עוד אין תשובות'),
      h('div', { class: 'muted' }, s.busy ? 'עובד על זה. התשובות יופיעו כאן כשיהיו מוכנות' : 'אחרי שפותרים, כל התשובות יופיעו כאן עם מספר השאלה. גם הציונים של "בדוק אותי"'),
      s.busy ? null : h('div', { class: 'row' }, btn('פתור את המשימה', () => a.solve(), { cls: 'primary', icon: 'board' }), btn('בדוק אותי', () => a.review(), { icon: 'review' })),
    ),
  };
}
