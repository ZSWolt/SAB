import { btn, h, keys, plural } from '../dom';
import { icon } from '../icons';
import type { UIState } from '../store';
import type { Actions, Drafts, Rendered } from './types';
import { errorBanner } from './common';

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

function scanCard(s: UIState, a: Actions): HTMLElement {
  const sc = s.scan;
  const summary = s.scanning
    ? 'קורא את הדף'
    : sc
      ? [sc.fields ? plural(sc.fields, 'שאלה אחת', 'שאלות') : 'לא נמצאו שאלות', sc.pages > 1 ? `${sc.pages} עמודים` : ''].filter(Boolean).join(' · ')
      : '';
  const rows: HTMLElement[] = [];
  if (sc) {
    const kinds = [sc.choice ? `${sc.choice} אמריקאיות` : '', sc.open ? `${sc.open} פתוחות` : ''].filter(Boolean).join(' ו-');
    rows.push(h('div', { class: 'm' }, icon('check'), h('span', { class: 't' }, `${plural(sc.fields, 'שאלה אחת', 'שאלות')}${sc.pages > 1 ? ` ב-${sc.pages} עמודים` : ''}${kinds ? `, ${kinds}` : ''}`)));
    rows.push(h('div', { class: 'm' }, icon('book'), h('span', { class: 't' }, sc.story ? `סיפור: ${sc.story.title ?? 'נמצא'}` : 'לא זוהה סיפור')));
    if (sc.docs.length) rows.push(h('div', { class: 'm' }, icon('file'), h('span', { class: 't' }, `${sc.docs.length} מסמכים`)));
    if (sc.videos) rows.push(h('div', { class: 'm' }, icon('video'), h('span', { class: 't' }, sc.videos === 1 ? 'סרטון יוטיוב אחד' : `${sc.videos} סרטוני יוטיוב`)));
    if (sc.opener) rows.push(h('div', { class: 'm' }, icon('link'), h('span', { class: 't' }, 'גם החלון שפתח את המשימה')));
    if (sc.pages > 1) rows.push(h('div', { class: 'muted' }, 'בפתרון אעבור על כל העמודים ואחזור לעמוד שלך'));
    rows.push(h('div', { class: 'tools' }, btn('קרא שוב', () => a.rescan(), { cls: 'ghost sm', icon: 'refresh' }), btn('ייצא מבנה דף', () => a.exportStructure(), { cls: 'ghost sm', icon: 'download' })));
  }
  return h(
    'div',
    { class: 'card scan' },
    h(
      'button',
      { type: 'button', class: 'collapse-h', 'aria-expanded': String(s.scanOpen), onclick: () => a.toggleScan() },
      h('span', { class: 't' }, 'מה זוהה בדף'),
      s.scanning ? h('span', { class: 'spinner' }) : h('span', { class: 'muted' }, summary),
      (() => {
        const c = icon('chevron');
        c.classList.add('chev');
        return c;
      })(),
    ),
    s.scanOpen && sc ? h('div', { class: 'collapse-b' }, rows) : null,
  );
}

export function idleView(s: UIState, a: Actions, d: Drafts): Rendered {
  const note = h('textarea', { placeholder: 'למשל רק שאלה 3, או באנגלית', 'aria-label': 'הערה ל-Claude' }) as HTMLTextAreaElement;
  note.value = d.note;
  note.addEventListener('input', () => (d.note = note.value));
  const shot = h('input', { type: 'checkbox' }) as HTMLInputElement;
  shot.checked = d.shot;
  shot.addEventListener('change', () => (d.shot = shot.checked));

  return {
    body: [
      errorBanner(s),
      s.hasKey ? null : connectCard(s, a),
      h(
        'button',
        { type: 'button', class: 'btn primary big solve', disabled: !s.hasKey || s.busy, onclick: () => a.solve() },
        h('span', { class: 'lbl' }, 'פתור את המשימה'),
        keys('Alt', 'Shift', 'A'),
      ),
      h(
        'button',
        { type: 'button', class: 'btn big review', disabled: !s.hasKey || s.busy, title: 'ציון והערות על מה שכתבת, כמו במחוון בגרות', onclick: () => a.review() },
        h('span', { class: 'lbl' }, icon('review'), 'בדוק אותי'),
        h('span', { class: 'sub' }, 'ציון והערות על מה שכתבתי'),
      ),
      s.result || s.review ? btn(s.review && !s.result ? 'הצג את הבדיקה האחרונה' : 'הצג את התשובות האחרונות', () => a.showLast(), { cls: 'ghost', icon: 'eye' }) : null,
      scanCard(s, a),
      h('label', { class: 'field' }, 'הערה ל-Claude', note),
      h('label', { class: 'check' }, shot, 'צרף צילום מסך לשאלות עם תמונה או גרף'),
    ],
  };
}
