import { orderedRows, questionLabel } from '../../../shared/labels';
import type { Answer, ReviewItem, SolveResult } from '../../../shared/types';
import { activityKey, isActivity } from '../../../shared/types';
import { aiScore } from '../../../shared/aiScore';
import { btn, fmtDate, h, iconBtn, keys, plural } from '../dom';
import { icon } from '../icons';
import type { Filter, UIState } from '../store';
import { errorBanner, metaRow, sourcesList } from './common';
import { shortCost, statsStrip } from './stats';
import type { Actions, Rendered } from './types';

// ---------- question numbers ----------

export { questionLabel };

const qbadge = (label: string) => h('span', { class: 'qbadge' }, label);
/** Where the question is: its section tab (CET "שולחן כתיבה") or its page. */
const where = (x: { page?: number; section?: string }) => {
  const t = [x.page ? `עמוד ${x.page}` : '', x.section ?? ''].filter(Boolean).join(' · ');
  return t ? h('span', { class: 'qpage' }, t) : null;
};

// ---------- answer status ----------

type RowKind = 'filled' | 'unfilled' | 'copy' | 'missing';

function answerKind(a: Answer, s: UIState): RowKind {
  if (!a.field_id && isActivity(a)) return s.filled[activityKey(a)]?.ok ? 'filled' : 'unfilled';
  if (!a.field_id) return 'copy';
  return s.filled[a.field_id]?.ok ? 'filled' : 'unfilled';
}

const CHIP: Record<RowKind, [string, string]> = { filled: ['מולא', 'ok'], unfilled: ['לא מולא', ''], copy: ['להעתקה', ''], missing: ['חסר', 'bad'] };

export function filterCounts(r: SolveResult, s: UIState): Record<Filter, number> {
  const kinds = r.answers.map((a) => answerKind(a, s));
  return {
    all: r.answers.length + (r.missing?.length ?? 0) + (r.missingText?.length ?? 0) + (r.missingParts?.length ?? 0),
    missing: (r.missing?.length ?? 0) + (r.missingText?.length ?? 0) + (r.missingParts?.length ?? 0),
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
  // the answer itself, marked: the chosen option in multiple choice, the text to write in an open question
  const marked = ans.option ?? ans.answer;
  // the explanation is shown only on "פירוט": the reason for a choice, or the full question for an open one
  const detail = ans.option ? ans.answer : q !== marked ? q : '';
  return h(
    'div',
    { class: `item ans${open ? ' open' : ''}` },
    h(
      'div',
      { class: 'arow' },
      h(
        'div',
        { class: 'cmain' },
        h('span', { class: 'qline' }, qbadge(label), where(ans), aiChip(ans), h('span', { class: `chip ${cls}` }, chip)),
        h('span', { class: 'cq', title: q }, q),
        ans.how ? h('div', { class: 'ahow' }, icon('pick', 14), h('span', {}, h('b', {}, 'מה לעשות: '), ans.how)) : null,
        // a table question: the table itself, with the answers marked in their cells
        ans.matches?.length
          ? matchTable(ans)
          : ans.highlights?.length
            ? highlightList(ans)
            : ans.cells?.length
          ? cellsTable(ans)
          : // a long answer (an essay) shows its start; "פירוט" opens all of it
            h('div', { class: `amark${!open && marked.length > 320 ? ' clamp' : ''}` }, h('span', { class: 'hl' }, marked)),
      ),
    ),
    h(
      'div',
      { class: 'abar' },
      h(
        'button',
        { type: 'button', class: 'more', 'aria-expanded': String(open), onclick: () => a.toggleRow(i) },
        open ? 'סגור פירוט' : 'פירוט',
        icon('chevron', 14),
      ),
      h('span', { class: 'spacer' }),
      ans.field_id || isActivity(ans) ? btn(isActivity(ans) && !ans.field_id ? 'בצע בדף' : 'מלא', () => a.fill([ans]), { cls: 'ghost sm', icon: 'fill' }) : null,
      btn('העתק', () => a.copy(marked), { cls: 'ghost sm', icon: 'copy' }),
    ),
    open
      ? h(
          'div',
          { class: 'qmore' },
          detail ? h('div', {}, h('div', { class: 'label' }, ans.option ? 'הסבר' : 'השאלה המלאה'), h('div', { class: 'sec' }, detail)) : h('div', { class: 'muted' }, 'אין הסבר נוסף לתשובה הזאת'),
          fillMsg ? h('div', { class: 'qstatus bad' }, fillMsg) : null,
          aiDetails(ans, i, label, a),
        )
      : null,
  );
}

/**
 * A table answer, laid out like the table on the page: each row's own text (the first column) next
 * to what goes in the empty cell, under the column's header.
 */
function cellsTable(ans: Answer): HTMLElement {
  const rows = ans.table ?? [];
  const cells = [...(ans.cells ?? [])].sort((a, b) => a.row - b.row || a.col - b.col);
  const head = rows[0] ?? [];
  const cols = [...new Set(cells.map((c) => c.col))];
  const labelCol = rows.length ? [0, 1, 2].find((c) => !cols.includes(c) && rows.slice(1).some((r) => r[c])) ?? -1 : -1;
  const byRow = new Map<number, Map<number, string>>();
  for (const c of cells) {
    const m = byRow.get(c.row) ?? new Map<number, string>();
    m.set(c.col, c.text);
    byRow.set(c.row, m);
  }
  return h(
    'table',
    { class: 'atable' },
    head.length
      ? h('thead', {}, h('tr', {}, labelCol >= 0 ? h('th', {}, head[labelCol] ?? '') : null, cols.map((c) => h('th', {}, head[c] || `עמודה ${c + 1}`))))
      : null,
    h(
      'tbody',
      {},
      [...byRow.entries()].map(([r, m]) =>
        h(
          'tr',
          {},
          labelCol >= 0 ? h('td', { class: 'rl' }, rows[r]?.[labelCol] ?? `שורה ${r + 1}`) : h('td', { class: 'rl' }, `שורה ${r + 1}`),
          cols.map((c) => h('td', {}, m.has(c) ? h('span', { class: 'hl' }, m.get(c)!) : '')),
        ),
      ),
    ),
  );
}

/** "How I understood the task": questions with their parts (answered or missing) and the helper prompts. */
function taskMapBox(r: SolveResult): HTMLElement | null {
  const map = r.taskMap ?? [];
  if (!map.length) return null;
  const missing = new Set((r.missingParts ?? []).map((p) => `${p.item}|${p.label}`));
  const qs = map.filter((m) => m.kind === 'question');
  const helpers = map.filter((m) => m.kind === 'helper');
  const name = (id: string | null) => map.find((m) => m.id === id)?.number ?? map.find((m) => m.id === id)?.text.slice(0, 30) ?? '';
  return h(
    'details',
    { class: 'skipped taskmap' },
    h('summary', {}, `המשימה כפי שהבנתי אותה: ${qs.length} שאלות · ${qs.reduce((n, q) => n + Math.max(1, q.parts.length), 0)} סעיפים${helpers.length ? ` · ${helpers.length} הנחיות עזר` : ''}`),
    h(
      'div',
      {},
      qs.map((q) =>
        h(
          'div',
          { class: 'tm-q' },
          h('b', {}, q.number ?? q.text.slice(0, 40)),
          q.number ? ` ${q.text.slice(0, 80)}` : '',
          q.parts.length > 1 ? h('div', { class: 'tm-parts' }, q.parts.map((p) => h('div', {}, `${missing.has(`${q.id}|${p.label}`) ? '✗' : '✓'} ${p.label ? `${p.label}: ` : ''}${p.asks}`))) : null,
        ),
      ),
      helpers.map((x) => h('div', { class: 'tm-h' }, `עזר${x.belongs_to ? ` ל${name(x.belongs_to)}` : ''} (לא עונים עליו): ${x.text.slice(0, 90)}`)),
    ),
  );
}

/** Fields Claude left out because they are not questions (name, class, an "+ idea" box), with its reason. */
function skippedBox(r: SolveResult): HTMLElement | null {
  const list = r.skipped ?? [];
  if (!list.length) return null;
  return h(
    'details',
    { class: 'skipped' },
    h('summary', {}, list.length === 1 ? 'דולג שדה אחד שהוא לא שאלה' : `דולגו ${list.length} שדות שהם לא שאלות`),
    h('div', { class: 'muted' }, list.map((x) => h('div', {}, `• ${x.reason || 'לא שאלה'}`))),
  );
}

// ---------- how AI-looking (local estimate) ----------

/** Only answers written as text are judged (not a chosen option, a table or an activity). */
const judged = (ans: Answer) => !ans.option && !ans.cells?.length && !isActivity(ans);

function aiChip(ans: Answer): HTMLElement | null {
  if (!judged(ans)) return null;
  const { score } = aiScore(ans.answer);
  if (score === null) return null;
  const cls = score <= 25 ? 'ok' : score <= 55 ? 'acc' : 'bad';
  return h('span', { class: `chip ai ${cls}`, title: 'כמה התשובה נראית כתובה ב-AI: הערכה לפי סימנים מוכרים, לא גלאי אמיתי' }, `AI ${score}%`);
}

function aiDetails(ans: Answer, i: number, label: string, a: Actions): HTMLElement | null {
  if (!judged(ans)) return null;
  const r = aiScore(ans.answer);
  if (r.score === null) return null;
  const structural = r.issues.some((x) => /מקף|שורה ריקה|נקודתיים|רשימה|markdown|מעוגלות|נסתרים/.test(x.label));
  return h(
    'div',
    { class: 'aibox' },
    h('div', { class: 'label' }, `נראה AI: ${r.score}% (הערכה לפי סימנים, לא גלאי אמיתי)`),
    r.issues.length ? h('div', { class: 'sec' }, r.issues.map((x) => (x.count > 1 ? `${x.count} × ${x.label}` : x.label)).join(' · ')) : h('div', { class: 'muted' }, 'לא נמצאו סימנים מיוחדים'),
    r.issues.length
      ? h(
          'div',
          { class: 'row' },
          structural ? btn('תקן מבנה', () => a.fixStyle(i), { cls: 'sm', icon: 'check' }) : null,
          btn('נסח כמו תלמיד', () => a.rephrase(label, r.issues.filter((x) => x.label.startsWith('"')).map((x) => x.label)), { cls: 'sm ghost', icon: 'chat' }),
        )
      : null,
  );
}

function aiAverage(r: SolveResult): HTMLElement | null {
  const scores = r.answers.filter(judged).map((x) => aiScore(x.answer).score).filter((n): n is number => n !== null);
  if (!scores.length) return null;
  const avg = Math.round(scores.reduce((x, y) => x + y, 0) / scores.length);
  const high = scores.filter((n) => n > 55).length;
  return h('div', { class: 'muted aiavg' }, `ממוצע AI: ${avg}%${high ? ` · ${high === 1 ? 'תשובה אחת נראית' : `${high} תשובות נראות`} כתובות ב-AI (פתח "פירוט" כדי לתקן)` : ''}`);
}

/** Matching: each box and the box it goes with, in two columns. */
function matchTable(ans: Answer): HTMLElement {
  return h(
    'table',
    { class: 'atable' },
    // a blank number shows as "חור 3"
    h('tbody', {}, (ans.matches ?? []).map((m) => h('tr', {}, h('td', { class: 'rl' }, /^\d{1,3}$/.test(m.to.trim()) ? `חור ${m.to.trim()}` : m.to), h('td', {}, h('span', { class: 'hl' }, m.from))))),
  );
}

/** Marking with a color legend: every category with the sentences to mark in it. */
function highlightList(ans: Answer): HTMLElement {
  const by = new Map<string, string[]>();
  for (const x of ans.highlights ?? []) by.set(x.label, [...(by.get(x.label) ?? []), x.text]);
  return h(
    'div',
    { class: 'hlist' },
    [...by.entries()].map(([label, texts]) => h('div', { class: 'hgrp' }, h('span', { class: 'qbadge' }, label), texts.map((t) => h('div', { class: 'htext' }, h('span', { class: 'hl' }, `"${t}"`))))),
  );
}

function missingRow(m: { field_id: string; context: string; page?: number; section?: string }, label: string, a: Actions): HTMLElement {
  return h(
    'div',
    { class: 'item missing' },
    h(
      'div',
      { class: 'crow', style: 'cursor:default' },
      h('span', { class: 'cmain' }, h('span', { class: 'qline' }, qbadge(label), where(m)), h('span', { class: 'cq', title: m.context }, m.context.slice(0, 120)), h('span', { class: 'cs' }, 'לא נמצאה תשובה')),
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
        h('div', { class: 'txt' }, 'Claude ענה גם על השאלות שבטקסט. את אלה שאין להן שדה צריך להעתיק. אם זה חוזר, "דוח אבחון" (ב"מה זוהה בדף") יעזור לי לתקן'),
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
  // one list in question order; missing questions sit in their place, not at the end
  // grouped by page / section tab when the task has them ("עמוד 3 · שולחן כתיבה")
  const groups: { title: string; rows: HTMLElement[] }[] = [];
  const push = (where: { page?: number; section?: string }, el: HTMLElement) => {
    const title = [where.page ? `עמוד ${where.page}` : '', where.section ?? ''].filter(Boolean).join(' · ');
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.rows.push(el);
    else groups.push({ title, rows: [el] });
  };
  // questions in the text without an answer show as missing too ("שאלה 5", no field)
  const gaps: { field_id: string; context: string; page?: number; section?: string }[] = [
    ...(r.missing ?? []),
    ...(r.missingText ?? []).map((n) => ({ field_id: '', context: `שאלה ${n} (בטקסט של המשימה, בלי שדה)` })),
    // a part of a question with no answer ("שאלה 3 · ב: לבסס על ציטוטים")
    ...(r.missingParts ?? []).map((p) => ({ field_id: '', context: `${p.number ?? 'שאלה'} · סעיף ${p.label || '(ללא שם)'}: ${p.asks}`, ...(p.page ? { page: p.page } : {}) })),
  ];
  for (const row of orderedRows(r.answers, gaps)) {
    if (row.kind === 'missing') {
      const m = gaps[row.index];
      if (s.filter === 'all' || s.filter === 'missing') push(m, missingRow(m, row.label, a));
      continue;
    }
    const ans = r.answers[row.index];
    const k = answerKind(ans, s);
    if (s.filter === 'all' || (s.filter === 'filled' && k === 'filled') || (s.filter === 'unfilled' && k === 'unfilled')) push(ans, resultRow(ans, row.index, row.label, s, a));
  }
  const grouped = groups.length > 1 || (groups.length === 1 && !!groups[0].title && groups[0].title.includes('·'));
  const rows = groups.flatMap((g) => g.rows);
  const fillable = r.answers.some((x) => x.field_id || isActivity(x));
  const failedDocs = (r.documents ?? []).filter((d) => !d.ok);
  const failedVideos = (r.videos ?? []).filter((v) => !v.ok);
  return {
    top: statsStrip(counts.all ? answered / counts.all : 0, `${answered}/${counts.all}`, [[String(counts.all), 'שאלות'], [String(counts.filled), 'מולאו'], [String(counts.missing), 'חסרות', counts.missing > 0], [shortCost(r.costUsd), 'עלות']], 'סיכום התשובות'),
    body: [
      modeSwitch(s, a),
      errorBanner(s),
      notices(r, s, a),
      aiAverage(r),
      failedDocs.map((d) => metaRow('alert', `לא נקרא: ${d.title}${d.message ? ` · ${d.message}` : ''}`, { bad: true })),
      failedVideos.map((v) => metaRow('alert', `לא נצפה: ${v.url.replace('https://www.', '')}${v.message ? ` · ${v.message}` : ''}`, { bad: true, title: v.url })),
      h(
        'div',
        { class: 'seg', role: 'group', 'aria-label': 'מסנן' },
        FILTERS.map(([id, label]) => h('button', { type: 'button', 'aria-pressed': String(s.filter === id), onclick: () => a.setFilter(id) }, label, ' ', h('span', { class: 'num', style: 'font-family:var(--mono)' }, String(counts[id])))),
      ),
      !rows.length
        ? h('div', { class: 'muted' }, 'אין שאלות במסנן הזה')
        : grouped
          ? h('div', { class: 'answers grouped' }, groups.map((g) => h('div', { class: 'grp' }, h('div', { class: 'grp-t' }, g.title || 'בלי עמוד'), h('div', { class: 'list answers' }, g.rows))))
          : h('div', { class: 'list answers' }, rows),
      taskMapBox(r),
      skippedBox(r),
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
        h('span', { class: 'qline' }, qbadge(label), where(item)),
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
  const order = orderedRows(r.items);
  return {
    top: statsStrip(avg / 100, String(avg), [[String(r.items.length), 'נבדקו'], [String(avg), 'ממוצע'], [String(weak), 'לשפר', weak > 0], [shortCost(r.costUsd), 'עלות']], 'סיכום הבדיקה'),
    body: [
      modeSwitch(s, a),
      errorBanner(s),
      h('div', { class: 'status' }, icon('check'), h('span', { class: 't' }, `הבדיקה מוכנה · ציון ממוצע ${avg} · ${plural(r.items.length, 'שאלה אחת', 'שאלות')}`)),
      r.overall ? h('div', { class: 'note' }, r.overall) : null,
      r.items.length ? h('div', { class: 'list reviews' }, order.map((row) => reviewRow(r.items[row.index], row.index, row.label, s, a))) : h('div', { class: 'muted' }, 'לא נמצאו תשובות שלך לבדוק'),
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
