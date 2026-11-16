import type { Settings } from '../../../shared/settings';
import { btn, fmtCost, fmtDate, h, iconBtn, keys, plural } from '../dom';
import { icon } from '../icons';
import type { UIState } from '../store';
import { STORY_ACCEPT } from '../storyFiles';
import type { Actions, Drafts, Rendered } from './types';

export const SHEET_TITLES = { settings: 'הגדרות' } as const;

/** "נושא": Claude's line about the unit after solving, else the page's main heading. */
function topicCard(s: UIState): HTMLElement | null {
  const fromClaude = s.result?.topic?.trim();
  const fromPage = s.scan?.topic?.trim();
  if (!fromClaude && !fromPage) return null;
  const [head, ...rest] = (fromClaude || fromPage || '').split('\n');
  return h(
    'div',
    { class: 'card pad topic' },
    h('div', { class: 'label' }, 'נושא'),
    h('b', {}, head),
    rest.join(' ').trim() ? h('div', {}, rest.join(' ').trim()) : null,
    fromClaude ? null : h('div', { class: 'muted' }, 'אחרי הפתרון יופיע כאן הסבר קצר על הנושא'),
  );
}

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

/** "Add files": Word, PDF, text or a photo of the page, sent as the story with every solve on this page. */
function storyFilesBox(a: Actions, d: Drafts): HTMLElement {
  const input = h('input', { type: 'file', multiple: true, accept: STORY_ACCEPT, style: 'display:none', 'aria-label': 'קבצי סיפור' }) as HTMLInputElement;
  input.addEventListener('change', () => {
    if (input.files?.length) a.addStoryFiles(input.files);
    input.value = '';
  });
  const drop = h(
    'div',
    { class: 'filedrop' },
    input,
    btn('הוסף קבצים', () => input.click(), { cls: '', icon: 'plus' }),
    h('span', { class: 'muted' }, 'Word, PDF, טקסט או צילום של הדף. אפשר גם לגרור לכאן'),
  );
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    if (e.dataTransfer?.files.length) a.addStoryFiles(e.dataTransfer.files);
  });
  return h(
    'div',
    { class: 'field' },
    'קבצים של הסיפור',
    drop,
    d.storyFiles.length
      ? h(
          'div',
          { class: 'files' },
          d.storyFiles.map((f, i) =>
            h(
              'div',
              { class: 'm file' },
              icon(f.kind === 'image' ? 'camera' : 'file'),
              h('span', { class: 't', title: f.name }, f.name),
              h('span', { class: 'muted' }, f.kind === 'text' ? `${(f.text ?? '').length.toLocaleString()} תווים` : kb(f.size)),
              iconBtn('trash', 'הסר', () => a.removeStoryFile(i), 'icon-btn sm'),
            ),
          ),
        )
      : null,
    d.storyFiles.length ? h('div', { class: 'muted' }, 'הקבצים יישלחו ל-Claude כסיפור בכל פתרון בדף הזה') : null,
  );
}

/** Story tab. The story is found automatically only in literature on classe; anywhere else it can be picked or pasted. */
export function storyTab(s: UIState, a: Actions, d: Drafts): Rendered {
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
      // no story (not classe, or not found) and no story files: what the unit / task is about
      !story && !d.storyFiles.length ? topicCard(s) : null,
      story
        ? h('article', { class: 'card story' }, story.title ? h('h2', {}, story.title) : null, story.text)
        : s.storySite
          ? h('div', { class: 'card story empty' }, s.scanning ? 'מחפש את הסיפור' : 'עוד לא זוהה סיפור. ב-classe הסיפור נמצא בבר בצד ימין: אפשר לפתוח אותו (גם אני פותח אותו לבד כשפותרים), או להוסיף קובץ למטה')
          : h('div', { class: 'card story empty' }, 'זיהוי אוטומטי של סיפור פועל רק בספרות, ב-classe. כאן אפשר לבחור סיפור בדף, להוסיף קבצים או להדביק אותו למטה, והוא יישלח יחד עם השאלות'),
      h(
        'div',
        { class: 'tools' },
        s.storySite ? btn('פתח את בר הסיפור', () => a.openStoryBar(), { cls: 'ghost', icon: 'book' }) : null,
        btn('בחר את הסיפור בדף', () => a.pickStory(), { cls: 'ghost', icon: 'pick' }),
        btn('זהה מחדש', () => a.rescan(), { cls: 'ghost', icon: 'refresh' }),
      ),
      storyFilesBox(a, d),
      h('label', { class: 'field' }, 'או הדבק את הסיפור', manual),
    ],
  };
}

export function historyTab(s: UIState, a: Actions): Rendered {
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
