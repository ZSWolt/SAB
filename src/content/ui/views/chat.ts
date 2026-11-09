import type { Answer, ChatMessage } from '../../../shared/types';
import { btn, fmtCost, h, plural } from '../dom';
import { icon } from '../icons';
import type { UIState } from '../store';
import type { Actions, Drafts, Rendered } from './types';

function updatedCard(ans: Answer, s: UIState, a: Actions): HTMLElement {
  const q = ans.questionText || [ans.question, ans.part].filter(Boolean).join(' · ') || 'תשובה';
  const filled = ans.field_id ? s.filled[ans.field_id] : undefined;
  return h(
    'div',
    { class: 'upd' },
    h('div', { class: 'uh' }, h('span', { class: 't', title: q }, q), h('span', { class: filled?.ok ? 'chip ok' : 'chip acc' }, filled?.ok ? 'מולא' : 'עודכן')),
    ans.option ? h('div', { class: 'ua' }, h('span', { class: 'hl' }, ans.option)) : null,
    h('div', { class: 'ua' }, ans.answer),
    h('div', { class: 'row' }, ans.field_id ? btn('מלא בשדה', () => a.fill([ans]), { cls: 'sm primary', icon: 'fill' }) : null, btn('העתק', () => a.copy(ans.option ?? ans.answer), { cls: 'sm', icon: 'copy' })),
  );
}

function message(m: ChatMessage, s: UIState, a: Actions): HTMLElement {
  if (m.role === 'user') return h('div', { class: 'msg-user' }, m.text);
  return h(
    'div',
    { class: 'msg-bot' },
    m.text,
    (m.answers ?? []).map((ans) => updatedCard(ans, s, a)),
    m.costUsd ? h('span', { class: 'cost' }, fmtCost(m.costUsd)) : null,
  );
}

function intro(s: UIState): string {
  const sc = s.scan;
  if (s.result) {
    const missing = s.result.missing?.length ?? 0;
    return `התשובות למשימה מוכנות${missing ? `, ו${plural(missing, 'שאלה אחת חסרה', 'שאלות חסרות')}` : ''}. אפשר לבקש ממני לקצר, להסביר, לתרגם או לשנות תשובה, ואני אעדכן אותה גם בלוח`;
  }
  if (sc && sc.fields) {
    return `מצאתי במשימה ${plural(sc.fields, 'שאלה אחת', 'שאלות')}${sc.pages > 1 ? ` ב-${sc.pages} עמודים` : ''}${sc.story ? `, ואת הסיפור "${(sc.story.title ?? '').slice(0, 40)}"` : ''}. אפשר לשאול אותי על המשימה, או לבקש שאפתור אותה`;
  }
  return 'אפשר לשאול אותי כל דבר על המשימה שפתוחה בדף: על הסיפור, על שאלה מסוימת, או לבקש שאפתור אותה';
}

export function chatView(s: UIState, a: Actions, d: Drafts): Rendered {
  const box = h('textarea', { placeholder: s.result ? 'בקש שינוי, למשל תקצר את תשובה 4' : 'שאל משהו על המשימה', 'aria-label': 'הודעה לעוזר', rows: '1' }) as HTMLTextAreaElement;
  box.value = d.chat;
  const grow = () => {
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 120)}px`;
  };
  const send = () => {
    const text = box.value.trim();
    if (!text || s.chatBusy) return;
    d.chat = '';
    a.sendChat(text);
  };
  box.addEventListener('input', () => {
    d.chat = box.value;
    grow();
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
  queueMicrotask(grow);

  const ask = (text: string) => () => {
    if (!s.chatBusy) a.sendChat(text);
  };
  const chips: HTMLElement[] = s.result
    ? [
        ...(s.result.missing?.length ? [h('button', { type: 'button', class: 'qchip primary', onclick: ask('תשלים את השאלות שחסרות') }, 'השלם את החסר')] : []),
        h('button', { type: 'button', class: 'qchip', onclick: ask('תקצר את כל התשובות, אבל שעדיין יענו על כל השאלה') }, 'תקצר את כל התשובות'),
        h('button', { type: 'button', class: 'qchip', onclick: ask('תסביר לי את התשובה לשאלה 1') }, 'תסביר לי את שאלה 1'),
        h('button', { type: 'button', class: 'qchip', onclick: ask('תתרגם את התשובות לאנגלית') }, 'באנגלית'),
      ]
    : [
        h('button', { type: 'button', class: 'qchip primary', disabled: !s.hasKey || s.busy, onclick: () => { a.setTab('board'); a.solve(); } }, 'פתור את המשימה'),
        h('button', { type: 'button', class: 'qchip', onclick: ask('על מה הסיפור? תסכם לי בקצרה') }, 'על מה הסיפור?'),
        h('button', { type: 'button', class: 'qchip', onclick: ask('מה צריך לעשות במשימה הזאת?') }, 'מה צריך לעשות?'),
      ];

  return {
    body: h(
      'div',
      { class: 'thread', 'aria-live': 'polite' },
      h('div', { class: 'msg-bot' }, intro(s)),
      s.chat.map((m) => message(m, s, a)),
      s.chatBusy
        ? h('div', { class: 'msg-bot' }, s.chatLive || (s.chatStatus ? '' : 'חושב'), h('span', { class: 'typing', 'aria-hidden': 'true' }), s.chatStatus ? h('span', { class: 'cost' }, s.chatStatus) : null)
        : null,
      s.error && !s.chatBusy ? h('div', { class: 'banner err', role: 'alert' }, h('div', { class: 'bt' }, icon('alert'), 'משהו השתבש'), h('div', { class: 'txt' }, s.error)) : null,
    ),
    foot: h(
      'div',
      { class: 'composer' },
      h('div', { class: 'qchips' }, chips),
      h(
        'div',
        { class: 'cbox' },
        box,
        s.chatBusy
          ? h('button', { type: 'button', class: 'send', title: 'עצור', 'aria-label': 'עצור', onclick: () => a.stopChat() }, icon('stop', 14))
          : h('button', { type: 'button', class: 'send', title: 'שלח', 'aria-label': 'שלח', disabled: !s.hasKey, onclick: send }, icon('send', 16)),
      ),
      s.chat.length ? h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { class: 'muted' }, 'Enter שולח, Shift Enter שורה חדשה'), btn('שיחה חדשה', () => a.newChat(), { cls: 'ghost sm' })) : null,
    ),
  };
}
