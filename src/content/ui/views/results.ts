import type { Answer, SolveResult } from '../../../shared/types';
import { btn, fmtDate, h, iconBtn, keys } from '../dom';
import { icon } from '../icons';
import type { UIState } from '../store';
import { errorBanner, metaRow, sourcesList, statusLine } from './common';
import type { Actions, Rendered } from './types';

function rowStatus(a: Answer, s: UIState): { text: string; cls: string } {
  if (!a.field_id) return { text: 'להעתקה', cls: '' };
  const f = s.filled[a.field_id];
  if (f?.ok) return { text: 'מולא', cls: 'ok' };
  if (f && !f.ok) return { text: 'לא מולא', cls: 'bad' };
  return { text: 'לא מולא עדיין', cls: '' };
}

function answerRow(ans: Answer, i: number, s: UIState, a: Actions): HTMLElement {
  const open = s.openRow === i;
  const st = rowStatus(ans, s);
  const q = ans.questionText || [ans.question, ans.part].filter(Boolean).join(' · ') || 'תשובה';
  const fillMsg = ans.field_id ? s.filled[ans.field_id]?.message : undefined;
  return h(
    'div',
    { class: 'item' },
    h(
      'button',
      { type: 'button', class: 'qrow', 'aria-expanded': String(open), onclick: () => a.toggleRow(i) },
      h('span', { class: 'qnum' }, String(i + 1)),
      h(
        'span',
        { class: 'qmain' },
        h('span', { class: 'qtext', title: q }, q),
        ans.option ? h('span', { class: 'qans' }, h('span', { class: 'hl' }, ans.option)) : h('span', { class: 'qans' }, ans.answer),
      ),
      h('span', { class: 'qside' }, h('span', { class: `qstatus ${st.cls}` }, st.text), ans.page ? h('span', { class: 'qpage' }, `עמ' ${ans.page}`) : null),
    ),
    open
      ? h(
          'div',
          { class: 'qmore' },
          ans.option ? h('div', { class: 'sec' }, ans.answer) : h('div', { class: 'full' }, ans.answer),
          fillMsg ? h('div', { class: 'qstatus bad' }, fillMsg) : null,
          h(
            'div',
            { class: 'row' },
            btn('העתק', () => a.copy(ans.option ?? ans.answer), { cls: 'sm', icon: 'copy' }),
            ans.field_id ? btn('מלא בשדה', () => a.fill([ans]), { cls: 'sm', icon: 'fill' }) : null,
          ),
        )
      : null,
  );
}

function notices(r: SolveResult, s: UIState, a: Actions): (HTMLElement | null)[] {
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
  if (r.missing?.length) {
    const n = r.missing.length;
    out.push(
      h(
        'div',
        { class: 'banner warn' },
        h('div', { class: 'bt' }, icon('alert'), n === 1 ? 'שאלה אחת לא קיבלה תשובה' : `${n} שאלות לא קיבלו תשובה`),
        r.missing.slice(0, 4).map((m) => h('div', { class: 'txt' }, m.context.slice(0, 100))),
        h('div', { class: 'row' }, btn('השלם את החסר', () => a.completeMissing(), { cls: 'sm', icon: 'plus' }), h('span', { class: 'muted' }, 'שדה כמו שם או כיתה אפשר להשאיר ריק')),
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

export function resultsView(s: UIState, a: Actions): Rendered {
  const r = s.result!;
  const read = [
    r.documents?.some((d) => d.ok) ? 'מסמך' : '',
    r.videos?.some((v) => v.ok) ? (r.videos.filter((v) => v.ok).length === 1 ? 'סרטון אחד' : `${r.videos.filter((v) => v.ok).length} סרטונים`) : '',
    r.searches.length ? (new Set(r.searches).size === 1 ? 'חיפוש אחד' : `${new Set(r.searches).size} חיפושים`) : '',
  ].filter(Boolean);
  const fillable = r.answers.some((x) => x.field_id);
  const total = r.answers.length + (r.missing?.length ?? 0);
  return {
    body: [
      errorBanner(s),
      statusLine(r.missing?.length ? `מוכן · ${r.answers.length} תשובות מתוך ${total}` : `מוכן · ${r.answers.length} תשובות`, r.costUsd),
      notices(r, s, a),
      read.length ? metaRow('book', `השתמשתי ב: ${read.join(', ')}`) : null,
      (r.documents ?? []).filter((d) => !d.ok).map((d) => metaRow('alert', `לא נקרא: ${d.title}${d.message ? ` · ${d.message}` : ''}`, { bad: true })),
      (r.videos ?? []).filter((v) => !v.ok).map((v) => metaRow('alert', `לא נצפה: ${v.url.replace('https://www.', '')}${v.message ? ` · ${v.message}` : ''}`, { bad: true, title: v.url })),
      r.notes ? h('div', { class: 'note' }, r.notes) : null,
      h('div', { class: 'list answers' }, r.answers.map((ans, i) => answerRow(ans, i, s, a))),
      sourcesList(r.sources),
      btn('חזרה למסך הפתיחה', () => a.backToIdle(), { cls: 'ghost sm', icon: 'back' }),
    ],
    foot: fillable
      ? [
          h('button', { type: 'button', class: 'btn primary fill-all', onclick: () => a.fill(r.answers) }, h('span', { class: 'lbl' }, icon('fill'), 'מלא הכול בדף'), keys('Alt', 'Shift', 'F')),
          iconBtn('undo', 'בטל מילוי', () => a.undo(), 'icon-btn box'),
          iconBtn('copy', 'העתק הכול', () => a.copyAll(), 'icon-btn box'),
        ]
      : null,
  };
}
