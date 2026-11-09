import type { Answer, ReviewItem, SolveResult } from '../../../shared/types';
import { btn, fmtCost, fmtDate, h, iconBtn, keys, plural } from '../dom';
import { icon } from '../icons';
import { STEP_ORDER, type Filter, type UIState } from '../store';
import { errorBanner, metaRow, sourcesList } from './common';
import type { Actions, Drafts, Rendered } from './types';

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

function statsStrip(fraction: number, label: string, counters: Counter[], aria: string) {
  return h(
    'div',
    { class: 'stats', role: 'group', 'aria-label': aria },
    ring(fraction, label),
    h('div', { class: 'counters' }, counters.map(([v, l, neg]) => h('div', { class: 'counter' }, h('b', { class: neg ? 'neg' : '' }, v), h('span', {}, l)))),
  );
}

/** Short enough for a counter: $0, <$0.01, $0.04, $1.20 */
const shortCost = (usd: number) => (!usd ? '$0' : usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`);

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

// ---------- idle ----------

function connectCard(s: UIState, a: Actions): HTMLElement {
  const input = h('input', { type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'מפתח API של Claude' });
  return h(
    'div',
    { class: 'card pad connect' },
    h('div', { class: 'row' }, icon('key'), h('b', { style: 'font-weight:500' }, 'חבר את Claude')),
    h('div', { class: 'note' }, 'כדי לענות על משימות צריך מפתח API של Claude. המפתח נשמר רק בדפדפן שלך'),
    input,
    h(
      'div',
      { class: 'row' },
      btn('שמור ובדוק', () => a.saveKey(input.value.trim()), { cls: 'primary' }),
      h('a', { class: 'btn ghost', href: 'https://console.anthropic.com/settings/keys', target: '_blank', rel: 'noopener' }, icon('external'), 'איך משיגים מפתח'),
    ),
    s.keyStatus ? h('div', { class: 'muted', role: 'status' }, s.keyStatus) : null,
  );
}

function idle(s: UIState, a: Actions, d: Drafts): Rendered {
  const sc = s.scan;
  const note = h('textarea', { placeholder: 'הערה ל-Claude, למשל רק שאלה 3 או באנגלית', 'aria-label': 'הערה ל-Claude', style: 'min-height:56px' }) as HTMLTextAreaElement;
  note.value = d.note;
  note.addEventListener('input', () => (d.note = note.value));
  const shot = h('input', { type: 'checkbox' }) as HTMLInputElement;
  shot.checked = d.shot;
  shot.addEventListener('change', () => (d.shot = shot.checked));
  const tags = sc
    ? [
        sc.pages > 1 ? `${sc.pages} עמודים` : '',
        sc.story ? `סיפור: ${(sc.story.title ?? 'נמצא').slice(0, 32)}` : '',
        sc.docs.length ? plural(sc.docs.length, 'מסמך אחד', 'מסמכים') : '',
        sc.videos ? plural(sc.videos, 'סרטון אחד', 'סרטונים') : '',
        sc.opener ? 'החלון שפתח את המשימה' : '',
      ].filter(Boolean)
    : [];
  return {
    top: statsStrip(0, sc ? `0/${sc.fields}` : '…', [[sc ? String(sc.fields) : '…', 'שאלות'], [sc ? String(sc.pages) : '…', 'עמודים'], ['0', 'מולאו'], ['$0', 'עלות']], 'סיכום המשימה'),
    body: [
      errorBanner(s),
      s.hasKey ? null : connectCard(s, a),
      h('button', { type: 'button', class: 'btn primary big solve', disabled: !s.hasKey || s.busy, onclick: () => a.solve() }, h('span', { class: 'lbl' }, 'פתור את המשימה'), keys('Alt', 'Shift', 'A')),
      h('button', { type: 'button', class: 'btn review', style: 'height:40px', disabled: !s.hasKey || s.busy, title: 'ציון והערות על מה שכתבת, כמו במחוון בגרות', onclick: () => a.review() }, icon('review'), 'בדוק את מה שכתבתי'),
      s.result || s.review ? btn(s.review && !s.result ? 'הצג את הבדיקה האחרונה' : 'הצג את התשובות האחרונות', () => a.showLast(), { cls: 'ghost', icon: 'eye' }) : null,
      tags.length ? h('div', { class: 'chips' }, tags.map((t) => h('span', { class: 'tag' }, t))) : null,
      h(
        'div',
        { class: 'row', style: 'justify-content:space-between' },
        h('span', { class: 'label' }, s.scanning ? 'קורא את הדף' : 'השאלות שזוהו'),
        h('span', { class: 'tools', style: 'margin:0' }, btn('קרא שוב', () => a.rescan(), { cls: 'ghost sm', icon: 'refresh' }), btn('ייצא מבנה דף', () => a.exportStructure(), { cls: 'ghost sm', icon: 'download' })),
      ),
      sc && sc.questions.length
        ? h(
            'div',
            { class: 'list questions' },
            sc.questions.map((q, i) =>
              h(
                'div',
                { class: 'item' },
                h(
                  'div',
                  { class: 'crow', style: 'cursor:default' },
                  h('span', { class: 'qnum' }, String(i + 1)),
                  h('span', { class: 'cmain' }, h('span', { class: 'cq', title: q.text }, q.text || 'שאלה'), h('span', { class: 'cs' }, `${q.page ? `עמוד ${q.page} · ` : ''}${q.kind === 'radio' || q.kind === 'checkbox' || q.kind === 'select' ? 'אמריקאית' : 'פתוחה'}`)),
                  h('span', { class: 'chip' }, 'ממתין'),
                ),
              ),
            ),
          )
        : h('div', { class: 'muted' }, s.scanning ? '' : 'לא זוהו שדות תשובה בדף. Claude יענה על השאלות שבטקסט, ואת התשובות אפשר להעתיק'),
      sc && sc.pages > 1 ? h('div', { class: 'muted' }, 'בפתרון אעבור על כל העמודים ואחזור לעמוד שלך') : null,
      h('label', { class: 'field' }, 'הערה ל-Claude', note),
      h('label', { class: 'check' }, shot, 'צרף צילום מסך לשאלות עם תמונה או גרף'),
    ],
  };
}

// ---------- working ----------

const PHASE_LABEL: Record<string, string> = { pages: 'עמודים', story: 'סיפור', videos: 'סרטון', search: 'חיפוש', write: 'כתיבה' };

function working(s: UIState, a: Actions): Rendered {
  const byId = new Map(s.steps.map((st) => [st.id, st]));
  const done = s.steps.filter((st) => st.state === 'done' || st.state === 'skip' || st.state === 'fail').length;
  const current = [...s.steps].reverse().find((st) => st.state === 'run' || st.state === 'pause');
  const waiting = s.steps.some((st) => st.state === 'pause');
  const sc = s.scan;
  const searches = s.steps.find((st) => st.id === 'search');
  return {
    top: statsStrip(done / 5, `${done}/5`, [[sc ? String(sc.fields) : '…', 'שאלות'], [sc ? String(sc.pages) : '…', 'עמודים'], [searches ? '1+' : '0', 'חיפושים'], ['…', 'עלות']], 'התקדמות'),
    body: [
      waiting
        ? h(
            'div',
            { class: 'banner warn', role: 'status' },
            h('div', { class: 'bt' }, icon('window'), 'חזור ללשונית המשימה כדי שאמשיך'),
            h('div', { class: 'txt' }, 'Chrome עוצר דפים שברקע, אז את המעבר בין העמודים אני עושה רק כשהלשונית פתוחה. כל השאר ממשיך לעבוד'),
          )
        : null,
      h(
        'div',
        { class: 'status' },
        h('span', { class: 'spinner' }),
        h('span', { class: 't' }, waiting ? 'מחכה שתחזור ללשונית המשימה' : `${s.mode === 'review' ? 'בודק' : 'עובד'} · שלב ${Math.min(done + 1, 5)} מתוך 5`),
        btn('עצור', () => a.stop(), { cls: 'sm', icon: 'stop' }),
      ),
      h(
        'div',
        { class: 'phases', role: 'list', 'aria-label': 'שלבי העבודה' },
        STEP_ORDER.map((id) => {
          const st = byId.get(id);
          const state = st?.state ?? 'wait';
          return h('div', { class: `phase ${state}`, role: 'listitem', title: st ? `${st.label}${st.meta ? ` · ${st.meta}` : ''}` : '' }, h('i', {}), h('span', {}, PHASE_LABEL[id]));
        }),
      ),
      h(
        'div',
        { class: 'card pad', style: 'gap:4px' },
        h('div', {}, current ? current.label : 'מתחיל'),
        current?.meta ? h('div', { class: 'muted' }, current.meta) : null,
        s.status ? h('div', { class: 'thinking' }, s.status) : null,
      ),
      h('div', { class: 'muted' }, 'אפשר להמשיך לגלוש בינתיים. רק את המעבר בין עמודי המשימה אני עושה כשהלשונית שלה פתוחה'),
    ],
  };
}

// ---------- results ----------

function resultRow(ans: Answer, i: number, s: UIState, a: Actions): HTMLElement {
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
      h('span', { class: 'qnum' }, String(i + 1)),
      h(
        'span',
        { class: 'cmain' },
        h('span', { class: 'cq', title: q }, q),
        ans.option ? h('span', { class: 'cs' }, h('span', { class: 'hl' }, ans.option)) : h('span', { class: 'cs' }, ans.answer),
      ),
      h('span', { class: `chip ${cls}` }, chip),
    ),
    open
      ? h(
          'div',
          { class: 'qmore' },
          ans.page ? h('div', { class: 'label' }, `עמוד ${ans.page}`) : null,
          ans.option ? h('div', { class: 'full' }, h('span', { class: 'hl' }, ans.option)) : null,
          h('div', { class: ans.option ? 'sec' : 'full' }, ans.answer),
          fillMsg ? h('div', { class: 'qstatus bad' }, fillMsg) : null,
          h('div', { class: 'row' }, btn('העתק', () => a.copy(ans.option ?? ans.answer), { cls: 'sm', icon: 'copy' }), ans.field_id ? btn('מלא בשדה', () => a.fill([ans]), { cls: 'sm', icon: 'fill' }) : null),
        )
      : null,
  );
}

function missingRow(m: { field_id: string; context: string }, n: number, a: Actions): HTMLElement {
  return h(
    'div',
    { class: 'item' },
    h(
      'div',
      { class: 'crow', style: 'cursor:default' },
      h('span', { class: 'qnum' }, String(n)),
      h('span', { class: 'cmain' }, h('span', { class: 'cq', title: m.context }, m.context.slice(0, 120)), h('span', { class: 'cs' }, 'לא נמצאה תשובה')),
      btn('השלם', () => a.completeMissing(), { cls: 'sm' }),
      h('span', { class: 'chip bad' }, 'חסר'),
    ),
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

function results(s: UIState, a: Actions): Rendered {
  const r = s.result!;
  const counts = filterCounts(r, s);
  const answered = r.answers.length;
  const rows: HTMLElement[] = [];
  if (s.filter === 'all' || s.filter === 'missing') {
    r.missing?.forEach((m, i) => rows.push(missingRow(m, answered + i + 1, a)));
  }
  r.answers.forEach((ans, i) => {
    const k = answerKind(ans, s);
    if (s.filter === 'all' || (s.filter === 'filled' && k === 'filled') || (s.filter === 'unfilled' && k === 'unfilled')) rows.push(resultRow(ans, i, s, a));
  });
  const fillable = r.answers.some((x) => x.field_id);
  const failedDocs = (r.documents ?? []).filter((d) => !d.ok);
  const failedVideos = (r.videos ?? []).filter((v) => !v.ok);
  return {
    top: statsStrip(counts.all ? answered / counts.all : 0, `${answered}/${counts.all}`, [[String(counts.all), 'שאלות'], [String(counts.filled), 'מולאו'], [String(counts.missing), 'חסרות', counts.missing > 0], [shortCost(r.costUsd), 'עלות']], 'סיכום התשובות'),
    body: [
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
      btn('חזרה למסך הפתיחה', () => a.backToIdle(), { cls: 'ghost sm', icon: 'back' }),
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
      : null,
  };
}

// ---------- check me ----------

function reviewRow(item: ReviewItem, i: number, s: UIState, a: Actions): HTMLElement {
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
      h('span', { class: 'qnum' }, String(i + 1)),
      h(
        'span',
        { class: 'cmain' },
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

function review(s: UIState, a: Actions): Rendered {
  const r = s.review!;
  const avg = r.items.length ? Math.round(r.items.reduce((n, i) => n + i.grade, 0) / r.items.length) : 0;
  const weak = r.items.filter((i) => i.grade < 70).length;
  return {
    top: statsStrip(avg / 100, String(avg), [[String(r.items.length), 'נבדקו'], [String(avg), 'ממוצע'], [String(weak), 'לשפר', weak > 0], [shortCost(r.costUsd), 'עלות']], 'סיכום הבדיקה'),
    body: [
      errorBanner(s),
      h('div', { class: 'status' }, icon('check'), h('span', { class: 't' }, `הבדיקה מוכנה · ציון ממוצע ${avg}`)),
      r.overall ? h('div', { class: 'note' }, r.overall) : null,
      h('div', { class: 'list reviews' }, r.items.map((it, i) => reviewRow(it, i, s, a))),
      sourcesList(r.sources),
      btn('חזרה למסך הפתיחה', () => a.backToIdle(), { cls: 'ghost sm', icon: 'back' }),
    ],
  };
}

export function boardView(s: UIState, a: Actions, d: Drafts): Rendered {
  if (s.view === 'working') return working(s, a);
  if (s.view === 'results' && s.result) return results(s, a);
  if (s.view === 'review' && s.review) return review(s, a);
  return idle(s, a, d);
}
