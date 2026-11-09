import type { Settings } from '../../../shared/settings';
import { btn, fmtCost, fmtDate, h, iconBtn, keys, plural } from '../dom';
import { icon } from '../icons';
import type { UIState } from '../store';
import type { Actions, Drafts, Rendered } from './types';

export const SHEET_TITLES = { story: 'סיפור', history: 'היסטוריה', settings: 'הגדרות' } as const;

export function storySheet(s: UIState, a: Actions, d: Drafts): Rendered {
  const story = s.scan?.story;
  const docs = s.scan?.docs ?? [];
  const manual = h('textarea', { placeholder: 'הטקסט יישלח יחד עם השאלות', style: 'min-height:96px', 'aria-label': 'הדבק סיפור' }) as HTMLTextAreaElement;
  manual.value = d.manualStory;
  manual.addEventListener('input', () => (d.manualStory = manual.value));
  return {
    body: [
      docs.length
        ? h(
            'div',
            {},
            h('div', { class: 'label' }, 'מסמכים במשימה, יישלחו ל-Claude'),
            docs.slice(0, 3).map((doc) => h('a', { class: 'm', href: doc.url, target: '_blank', rel: 'noopener' }, icon('file'), h('span', { class: 't' }, doc.title))),
          )
        : null,
      story
        ? h('article', { class: 'card story' }, story.title ? h('h2', {}, story.title) : null, story.text)
        : h('div', { class: 'card story empty' }, 'עוד לא זוהה סיפור. אפשר לפתוח את בר הסיפור, לבחור אותו בדף, או להדביק אותו למטה'),
      h('div', { class: 'tools' }, btn('פתח את בר הסיפור', () => a.openStoryBar(), { cls: 'ghost', icon: 'book' }), btn('בחר את הסיפור בדף', () => a.pickStory(), { cls: 'ghost', icon: 'pick' })),
      h('label', { class: 'field' }, 'או הדבק את הסיפור', manual),
    ],
  };
}

export function historySheet(s: UIState, a: Actions): Rendered {
  const hist = s.history;
  if (!hist) return { body: h('div', { class: 'status' }, h('span', { class: 'spinner' }), h('span', { class: 't' }, 'טוען')) };
  return {
    body: [
      h(
        'div',
        { class: 'card pad stat', style: 'gap:0' },
        h('div', { class: 'note' }, 'הוצאה החודש'),
        h('div', { class: 'num' }, fmtCost(hist.monthCost)),
        h('div', { class: 'muted' }, plural(hist.tasks.length, 'משימה אחת שמורה', 'משימות שמורות')),
      ),
      hist.tasks.length
        ? h(
            'div',
            { class: 'hist-list' },
            hist.tasks.map((t) =>
              h(
                'div',
                { class: 'hist' },
                h(
                  'button',
                  { type: 'button', class: 'open', title: t.url, onclick: () => a.openHistory(t.key) },
                  h('div', { class: 'ht' }, t.title || t.url),
                  h('div', { class: 'hd' }, `${fmtDate(t.updatedAt)} · ${plural(t.pages, 'עמוד אחד', 'עמודים')} · ${t.answers} תשובות`),
                ),
                h('span', { class: 'cost' }, fmtCost(t.costUsd)),
                iconBtn('trash', 'מחק', () => a.deleteHistory(t.key), 'icon-btn sm'),
              ),
            ),
          )
        : h('div', { class: 'muted' }, 'כל משימה שתפתור תישמר כאן'),
    ],
  };
}

const THEME_OPTIONS: { id: Settings['theme']; label: string; colors: [string, string] }[] = [
  { id: 'auto', label: 'אוטומטי', colors: ['#fafafa', '#111113'] },
  { id: 'notebook', label: 'מחברת', colors: ['#fafafa', '#1d4ed8'] },
  { id: 'focus', label: 'כהה', colors: ['#111113', '#7cc4ff'] },
  { id: 'school', label: 'בית ספר', colors: ['#fbfaf8', '#c2410c'] },
];

function seg<T extends string>(value: T, options: { id: T; label: string }[], onPick: (v: T) => void, label: string) {
  return h(
    'div',
    { class: 'seg', role: 'group', 'aria-label': label },
    options.map((o) => h('button', { type: 'button', 'aria-pressed': String(o.id === value), onclick: () => onPick(o.id) }, o.label)),
  );
}

export function settingsSheet(s: UIState, a: Actions): Rendered {
  const st = s.settings;
  const toggle = (key: 'autoFill' | 'readAllPages', title: string, hint: string) => {
    const box = h('input', { type: 'checkbox' }) as HTMLInputElement;
    box.checked = st[key];
    box.addEventListener('change', () => a.setSetting({ [key]: box.checked }));
    return h('label', { class: 'check', style: 'align-items:flex-start' }, box, h('span', {}, h('div', { style: 'color:var(--text)' }, title), h('div', { class: 'muted' }, hint)));
  };
  return {
    body: [
      h(
        'div',
        { class: 'field' },
        'עיצוב',
        h(
          'div',
          { class: 'swatches', role: 'group', 'aria-label': 'עיצוב' },
          THEME_OPTIONS.map((o) =>
            h(
              'button',
              { type: 'button', class: 'swatch', 'aria-pressed': String(st.theme === o.id), onclick: () => a.setSetting({ theme: o.id }) },
              h('i', { style: `background: linear-gradient(90deg, ${o.colors[0]} 0 50%, ${o.colors[1]} 50% 100%); border: 1px solid var(--strong)` }),
              o.label,
            ),
          ),
        ),
        st.theme === 'auto' ? h('div', { class: 'muted' }, 'מחברת ביום, כהה כשהמחשב במצב כהה') : null,
      ),
      h(
        'div',
        { class: 'field' },
        'אורך תשובות',
        seg(st.answerLength, [{ id: 'short', label: 'קצר' }, { id: 'normal', label: 'רגיל' }, { id: 'long', label: 'מפורט' }], (v) => a.setSetting({ answerLength: v }), 'אורך תשובות'),
        h('div', { class: 'muted' }, st.answerLength === 'normal' ? 'הכי קצר שעדיין עונה על כל חלקי השאלה' : st.answerLength === 'short' ? 'משפט או שניים לכל סעיף' : 'הסבר מלא עם דוגמאות'),
      ),
      toggle('readAllPages', 'לעבור על כל העמודים במשימה', 'כשיש כפתורי 1 2 3 בתחתית. חוזר לעמוד שהיית בו'),
      toggle('autoFill', 'למלא אוטומטית כשהתשובות מוכנות', 'אף פעם לא שולח. תמיד לעבור על התשובות לפני ההגשה'),
      h(
        'div',
        { class: 'keys-list' },
        h('div', { class: 'label' }, 'קיצורי מקלדת'),
        h('div', { class: 'm' }, h('span', {}, 'פתח או סגור'), keys('Alt', 'Shift', 'S')),
        h('div', { class: 'm' }, h('span', {}, 'פתור'), keys('Alt', 'Shift', 'A')),
        h('div', { class: 'm' }, h('span', {}, 'מלא בדף'), keys('Alt', 'Shift', 'F')),
      ),
      btn('כל ההגדרות: מפתחות, מודל, סרטונים, כתוב כמוני', () => a.openOptions(), { cls: 'ghost', icon: 'external' }),
    ],
  };
}
