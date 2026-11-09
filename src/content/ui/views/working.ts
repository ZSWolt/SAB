import { btn, h } from '../dom';
import { icon } from '../icons';
import type { Step, UIState } from '../store';
import type { Actions, Rendered } from './types';

function dot(step: Step) {
  const el = h('span', { class: `dot ${step.state}`, 'aria-hidden': 'true' });
  if (step.state === 'done') el.append(icon('check', 12));
  if (step.state === 'pause') el.append(icon('pause', 10));
  if (step.state === 'fail') el.append(icon('close', 10));
  return el;
}

const STATE_LABEL: Record<Step['state'], string> = { wait: 'ממתין', run: 'עכשיו', done: 'הסתיים', pause: 'מושהה', fail: 'נכשל', skip: 'דילגתי' };

export function workingView(s: UIState, a: Actions): Rendered {
  const waiting = s.steps.some((st) => st.state === 'pause');
  const steps: Step[] = s.steps.some((st) => st.id === 'write') ? s.steps : [...s.steps, { id: 'write', state: 'wait', label: s.mode === 'review' ? 'בודק את התשובות שלך' : 'כותב תשובות' }];
  return {
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
        h('span', { class: 't' }, waiting ? 'מחכה שתחזור ללשונית המשימה' : s.mode === 'review' ? 'בודק את מה שכתבת' : 'עובד על המשימה'),
        btn('עצור', () => a.stop(), { cls: 'sm', icon: 'stop' }),
      ),
      h('div', { class: 'muted' }, 'אפשר להמשיך לגלוש בינתיים. רק את המעבר בין עמודי המשימה אני עושה כשהלשונית שלה פתוחה'),
      h(
        'ol',
        { class: 'steps list', 'aria-label': 'שלבי העבודה' },
        steps.map((st) =>
          h(
            'li',
            { class: `step ${st.state}` },
            dot(st),
            h('span', { class: 'lbl' }, st.label),
            h('span', { class: 'meta' }, st.meta || ''),
            h('span', { class: 'sr', style: 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)' }, STATE_LABEL[st.state]),
          ),
        ),
      ),
      s.status ? h('div', { class: 'thinking' }, s.status) : null,
    ],
  };
}
