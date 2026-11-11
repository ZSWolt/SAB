import { btn, h, keys, plural } from '../dom';
import { icon } from '../icons';
import { STEP_ORDER, type UIState } from '../store';
import { filterCounts, notices } from './answers';
import { errorBanner } from './common';
import { shortCost, statsStrip } from './stats';
import type { Actions, Drafts, Rendered } from './types';

export { filterCounts } from './answers';

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

/** The ring and counters: the page as read, or the answers once there are some. */
function topStrip(s: UIState) {
  const sc = s.scan;
  const r = s.result;
  if (r) {
    const c = filterCounts(r, s);
    return statsStrip(c.all ? r.answers.length / c.all : 0, `${r.answers.length}/${c.all}`, [[String(c.all), 'שאלות'], [String(c.filled), 'מולאו'], [String(c.missing), 'חסרות', c.missing > 0], [shortCost(r.costUsd), 'עלות']], 'סיכום התשובות');
  }
  return statsStrip(0, sc ? `0/${sc.fields}` : '…', [[sc ? String(sc.fields) : '…', 'שאלות'], [sc ? String(sc.pages) : '…', 'עמודים'], ['0', 'מולאו'], ['$0', 'עלות']], 'סיכום המשימה');
}

function idle(s: UIState, a: Actions, d: Drafts): Rendered {
  const sc = s.scan;
  const note = h('textarea', { placeholder: 'הערה ל-Claude, למשל רק שאלה 3 או באנגלית', 'aria-label': 'הערה ל-Claude', style: 'min-height:56px' }) as HTMLTextAreaElement;
  note.value = d.note;
  note.addEventListener('input', () => (d.note = note.value));
  const shot = h('input', { type: 'checkbox' }) as HTMLInputElement;
  shot.checked = d.shot;
  shot.addEventListener('change', () => (d.shot = shot.checked));
  return {
    top: topStrip(s),
    body: [
      errorBanner(s),
      s.hasKey ? null : connectCard(s, a),
      h('button', { type: 'button', class: 'btn primary big solve', disabled: !s.hasKey || s.busy, onclick: () => a.solve() }, h('span', { class: 'lbl' }, 'פתור את המשימה'), keys('Alt', 'Shift', 'A')),
      h('button', { type: 'button', class: 'btn review', style: 'height:40px', disabled: !s.hasKey || s.busy, title: 'ציון והערות על מה שכתבת, כמו במחוון בגרות', onclick: () => a.review() }, icon('review'), 'בדוק את מה שכתבתי'),
      lastWork(s, a),
      scanCard(s, a),
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


const isChoice = (k: string) => k === 'radio' || k === 'checkbox' || k === 'select';

/** "What was found on the page": one line that opens into the tags and the questions list. */
function scanCard(s: UIState, a: Actions): HTMLElement {
  const sc = s.scan;
  const summary = s.scanning && !sc
    ? 'קורא את הדף'
    : sc
      ? [plural(sc.fields, 'שאלה אחת', 'שאלות'), sc.pages > 1 ? `${sc.pages} עמודים` : '', sc.story ? 'סיפור' : '', sc.docs.length ? plural(sc.docs.length, 'מסמך', 'מסמכים') : '', sc.videos ? plural(sc.videos, 'סרטון', 'סרטונים') : '']
          .filter(Boolean)
          .join(' · ')
      : 'עוד לא נקרא';
  const tags = sc
    ? [
        sc.pages > 1 ? `${sc.pages} עמודים` : '',
        sc.choice ? `${sc.choice} אמריקאיות` : '',
        sc.open ? `${sc.open} פתוחות` : '',
        sc.story ? `סיפור: ${(sc.story.title ?? 'נמצא').slice(0, 32)}` : '',
        sc.docs.length ? plural(sc.docs.length, 'מסמך אחד', 'מסמכים') : '',
        sc.videos ? plural(sc.videos, 'סרטון אחד', 'סרטונים') : '',
        sc.opener ? 'החלון שפתח את המשימה' : '',
      ].filter(Boolean)
    : [];
  return h(
    'div',
    { class: `card scan${s.scanOpen ? ' open' : ''}` },
    h(
      'button',
      { type: 'button', class: 'scan-head', 'aria-expanded': String(s.scanOpen), onclick: () => a.toggleScan() },
      s.scanning ? h('span', { class: 'spinner' }) : icon('scan'),
      h('span', { class: 'st' }, 'מה זוהה בדף'),
      h('span', { class: 'ss' }, summary),
      icon('chevron'),
    ),
    s.scanOpen
      ? h(
          'div',
          { class: 'scan-body' },
          tags.length ? h('div', { class: 'chips' }, tags.map((t) => h('span', { class: 'tag' }, t))) : null,
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
                      h('span', { class: 'cmain' }, h('span', { class: 'cq', title: q.text }, q.text || 'שאלה'), h('span', { class: 'cs' }, `${q.page ? `עמוד ${q.page} · ` : ''}${isChoice(q.kind) ? 'אמריקאית' : 'פתוחה'}`)),
                    ),
                  ),
                ),
              )
            : h('div', { class: 'muted' }, s.scanning ? 'קורא את הדף' : 'לא זוהו שדות תשובה בדף. Claude יענה על השאלות שבטקסט, ואת התשובות אפשר להעתיק'),
          sc && sc.pages > 1 ? h('div', { class: 'muted' }, 'בפתרון אעבור על כל העמודים ואחזור לעמוד שלך') : null,
          h('div', { class: 'tools', style: 'margin:0' }, btn('קרא שוב', () => a.rescan(), { cls: 'ghost sm', icon: 'refresh' }), btn('ייצא מבנה דף', () => a.exportStructure(), { cls: 'ghost sm', icon: 'download' })),
        )
      : null,
  );
}

/** After solving or checking: a short summary and the way to the answers tab. */
function lastWork(s: UIState, a: Actions): (HTMLElement | null)[] {
  const out: (HTMLElement | null)[] = [];
  const r = s.result;
  if (r) {
    const c = filterCounts(r, s);
    out.push(
      h(
        'div',
        { class: 'card pad done-card' },
        h('div', { class: 'row' }, icon('check'), h('b', {}, 'התשובות מוכנות'), h('span', { class: 'muted', style: 'margin-inline-start:auto' }, shortCost(r.costUsd))),
        h('div', { class: 'muted' }, [`${r.answers.length} מתוך ${c.all}`, c.filled ? `${c.filled} מולאו` : '', c.missing ? plural(c.missing, 'שאלה אחת חסרה', 'שאלות חסרות') : ''].filter(Boolean).join(' · ')),
        h('div', { class: 'row' }, btn('פתח את התשובות', () => a.openAnswers('answers'), { cls: 'primary sm', icon: 'answers' }), c.missing ? btn('השלם חסר', () => a.completeMissing(), { cls: 'sm', icon: 'plus' }) : null),
      ),
    );
    out.push(...notices(r, s, a).slice(0, 2));
  }
  const rv = s.review;
  if (rv) {
    const avg = rv.items.length ? Math.round(rv.items.reduce((n, i) => n + i.grade, 0) / rv.items.length) : 0;
    out.push(
      h(
        'div',
        { class: 'card pad done-card' },
        h('div', { class: 'row' }, icon('review'), h('b', {}, `הבדיקה מוכנה · ציון ממוצע ${avg}`)),
        h('div', { class: 'row' }, btn('פתח את הציונים', () => a.openAnswers('grades'), { cls: 'sm', icon: 'answers' })),
      ),
    );
  }
  return out;
}

export function boardView(s: UIState, a: Actions, d: Drafts): Rendered {
  if (s.view === 'working') return working(s, a);
  return idle(s, a, d);
}
