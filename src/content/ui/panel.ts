import type { Answer, FillOutcome, PortMessage, ReviewItem, ReviewResult, SolveRequest, SolveResult, TaggedSnapshot, TaskSummary } from '../../shared/types';
import { PANEL_HOST_ID } from '../text';
import { PANEL_CSS } from './styles';

type Attrs = Record<string, string | ((e: Event) => void) | boolean | undefined>;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null | false)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const k of kids) if (k !== null && k !== false) el.append(k);
  return el;
}

/** Messages to the background. If the extension was updated, this old copy can't talk to it anymore. */
const send = <T = unknown>(msg: object): Promise<T> => {
  if (!chrome.runtime?.id) return Promise.reject(new Error('התוסף התעדכן – תרענן את הדף (F5).'));
  return chrome.runtime.sendMessage(msg);
};

export class Panel {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private root!: HTMLElement;
  private panel!: HTMLElement;
  private fabWrap!: HTMLElement;
  private tabs: Record<string, { btn: HTMLButtonElement; sec: HTMLElement }> = {};
  private els: Record<string, HTMLElement> = {};
  private result: SolveResult | null = null;
  private busy = false;
  private manualStory = '';

  constructor() {
    this.host = document.createElement('div');
    this.host.id = PANEL_HOST_ID;
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.build();
    document.documentElement.appendChild(this.host);
    chrome.storage.local.get('uiHidden').then(({ uiHidden }) => this.setHidden(!!uiHidden, false));
    send<{ result: SolveResult | null }>({ type: 'get-last' })
      .then((r) => r?.result && this.showResult(r.result))
      .catch(() => {});
  }

  // ---------- layout ----------
  private build() {
    this.shadow.append(h('style', {}, PANEL_CSS));
    this.root = h('div', { class: 'root' });
    this.shadow.append(this.root);

    this.fabWrap = h(
      'div',
      { class: 'fab-wrap' },
      h('button', { class: 'fab', title: 'SAB – עוזר משימות (Alt+Shift+S)', onclick: () => this.toggle() }, 'AI'),
      h('button', { class: 'fab-x', title: 'הסתר (פתיחה מחדש: Alt+Shift+S)', onclick: () => this.setHidden(true, true) }, '✕'),
    );

    const tabBar = h('div', { class: 'tabs' });
    const body = h('div', { class: 'body' });
    for (const [key, label] of [
      ['task', 'משימה'],
      ['answer', 'תשובה'],
      ['story', 'סיפור'],
      ['history', 'היסטוריה'],
    ] as const) {
      const btn = h('button', { class: 'tab', onclick: () => this.showTab(key) }, label) as HTMLButtonElement;
      const sec = h('div', { class: 'section' });
      tabBar.append(btn);
      body.append(sec);
      this.tabs[key] = { btn, sec };
    }

    this.panel = h(
      'div',
      { class: 'panel', role: 'dialog', 'aria-label': 'SAB' },
      h(
        'div',
        { class: 'head' },
        h('h1', {}, '⚡ SAB – עוזר משימות'),
        h('button', { class: 'icon', title: 'הגדרות', onclick: () => send({ type: 'open-options' }) }, '⚙️'),
        h('button', { class: 'icon', title: 'סגור (Alt+Shift+S)', onclick: () => this.open(false) }, '✕'),
      ),
      tabBar,
      body,
    );
    this.root.append(this.fabWrap, this.panel);
    this.buildTask();
    this.buildAnswer();
    this.buildStory();
    this.buildHistory();
    this.showTab('task');
  }

  private buildTask() {
    const sec = this.tabs.task.sec;
    this.els.note = h('textarea', { placeholder: 'הערה ל-AI (לא חובה): למשל "תענה רק על שאלה 3" או "באנגלית"' });
    this.els.shot = h('input', { type: 'checkbox' });
    this.els.scanInfo = h('div', { class: 'muted' }, 'לחץ "פתור" – אני אקרא את כל הדף, כולל חלונות פנימיים ובר הסיפור.');
    this.els.fields = h('div', { class: 'fields' });
    this.els.solveBtn = h('button', { class: 'btn primary big', onclick: () => this.solve() }, '⚡ פתור את המשימה (Alt+Shift+A)');
    this.els.reviewBtn = h(
      'button',
      { class: 'btn big', title: 'כתבת תשובות בעצמך? קבל ציון והערות כמו במחוון בגרות', onclick: () => this.run('review') },
      '✅ בדוק אותי – ציון והערות על מה שכתבתי',
    );
    sec.append(
      this.els.solveBtn,
      h('div', { class: 'row' }, this.els.reviewBtn),
      h('div', { class: 'row' }, h('label', { class: 'check' }, this.els.shot, 'צרף צילום מסך (לשאלות עם תמונה/גרף)')),
      this.els.note,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', onclick: () => this.scan() }, '🔍 בדוק מה זוהה'),
        h('button', { class: 'btn', onclick: () => this.exportStructure() }, '📤 ייצא מבנה דף'),
      ),
      this.els.scanInfo,
      this.els.fields,
    );
  }

  private buildAnswer() {
    const sec = this.tabs.answer.sec;
    this.els.status = h('div', { class: 'status' }, 'עוד לא נפתרה משימה בדף הזה.');
    this.els.searches = h('div', { class: 'searches' });
    this.els.banner = h('div');
    this.els.answers = h('div');
    this.els.sources = h('div', { class: 'sources' });
    this.els.fillRow = h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => this.fill(this.result?.answers ?? []) }, '✍️ מלא הכול בדף (Alt+Shift+F)'),
      h('button', { class: 'btn', onclick: () => this.undo() }, '↩️ בטל מילוי'),
      h('button', { class: 'btn', onclick: () => this.copyAll() }, '📋 העתק הכול'),
    );
    this.els.fillRow.style.display = 'none';
    sec.append(this.els.status, this.els.banner, this.els.searches, this.els.fillRow, this.els.answers, this.els.sources);
  }

  private buildStory() {
    const sec = this.tabs.story.sec;
    this.els.storyText = h('div', { class: 'story' }, 'עוד לא זוהה סיפור. לחץ "בדוק מה זוהה" או נסה את הכפתורים למטה.');
    this.els.manual = h('textarea', { placeholder: 'או הדבק כאן את הסיפור/השיר בעצמך – הוא יישלח יחד עם השאלות', style: 'min-height:90px' });
    this.els.manual.addEventListener('input', () => (this.manualStory = (this.els.manual as HTMLTextAreaElement).value));
    this.els.docs = h('div', { class: 'docs' });
    sec.append(
      this.els.docs,
      this.els.storyText,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', onclick: () => this.openStoryBar() }, '📖 נסה לפתוח את בר הסיפור'),
        h('button', { class: 'btn', onclick: () => this.pickStory() }, '🎯 בחר אלמנט בדף כסיפור'),
      ),
      this.els.manual,
    );
  }

  private buildHistory() {
    const sec = this.tabs.history.sec;
    this.els.monthCost = h('div', { class: 'status' }, 'טוען…');
    this.els.history = h('div');
    sec.append(this.els.monthCost, this.els.history);
    this.tabs.history.btn.addEventListener('click', () => this.loadHistory());
  }

  private async loadHistory(data?: { tasks: TaskSummary[]; monthCost: number }) {
    const res = data ?? (await send<{ tasks: TaskSummary[]; monthCost: number }>({ type: 'history-list' }));
    this.els.monthCost.textContent = `הוצאה החודש: $${res.monthCost.toFixed(2)} · ${res.tasks.length} משימות שמורות`;
    if (!res.tasks.length) {
      this.els.history.replaceChildren(h('div', { class: 'muted' }, 'עוד אין משימות שמורות. כל משימה שתפתור תישמר כאן.'));
      return;
    }
    this.els.history.replaceChildren(
      ...res.tasks.map((t) =>
        h(
          'div',
          { class: 'card hist' },
          h(
            'h3',
            {},
            h('span', { title: t.url }, t.title || t.url),
            h('button', { class: 'btn mini', title: 'הצג תשובות', onclick: () => this.openHistory(t.key) }, '👁️'),
            h(
              'button',
              {
                class: 'btn mini',
                title: 'מחק',
                onclick: async () => this.loadHistory(await send({ type: 'history-delete', key: t.key })),
              },
              '🗑️',
            ),
          ),
          h(
            'div',
            { class: 'muted' },
            `${new Date(t.updatedAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })} · ${t.pages} עמודים · ${t.answers} תשובות · $${t.costUsd.toFixed(3)}`,
          ),
        ),
      ),
    );
  }

  private async openHistory(key: string) {
    const r = await send<{ result: SolveResult; at: number; title: string; url: string } | null>({ type: 'history-open', key });
    if (!r) return this.toast('לא נמצאו תשובות שמורות');
    this.showTab('answer');
    this.showResult(r.result);
    const same = r.url.split('#')[0] === location.href.split('#')[0];
    this.els.banner.replaceChildren(
      h('div', { class: 'warn info' }, `📚 תשובות שמורות מ-${new Date(r.at).toLocaleString('he-IL')}${same ? '' : ' – מדף אחר, אז מילוי בדף הזה לא יעבוד (אפשר להעתיק)'}`),
    );
  }

  // ---------- visibility ----------
  private showTab(key: string) {
    for (const [k, t] of Object.entries(this.tabs)) {
      t.btn.classList.toggle('active', k === key);
      t.sec.classList.toggle('active', k === key);
    }
  }

  open(on: boolean) {
    this.panel.classList.toggle('open', on);
    this.fabWrap.style.display = on ? 'none' : '';
  }

  isOpen() {
    return this.panel.classList.contains('open');
  }

  /** Hides the whole thing (button too) until the shortcut is pressed. */
  setHidden(hidden: boolean, announce: boolean) {
    this.root.style.display = hidden ? 'none' : '';
    chrome.storage.local.set({ uiHidden: hidden });
    if (hidden && announce) this.toast('העוזר הוסתר. לפתיחה מחדש: Alt+Shift+S');
  }

  /** Shortcut / toolbar icon: hidden → show + open; open → close; closed → open. */
  toggle() {
    if (this.root.style.display === 'none') {
      this.setHidden(false, false);
      this.open(true);
      return;
    }
    this.open(!this.isOpen());
  }

  private toast(text: string) {
    const t = h('div', { class: 'toast' }, text);
    this.shadow.append(t);
    setTimeout(() => t.remove(), 3500);
  }

  // ---------- actions ----------
  async scan() {
    this.els.scanInfo.textContent = 'קורא את הדף…';
    const res = await send<{ snapshots: TaggedSnapshot[]; opener: TaggedSnapshot[] }>({ type: 'scan' });
    this.renderScan(res.snapshots, res.opener);
  }

  private renderScan(snaps: TaggedSnapshot[], opener: TaggedSnapshot[]) {
    const fields = snaps.flatMap((s) => s.fields.map((f) => ({ ...f, frame: s.frameId })));
    const story = [...snaps, ...opener].find((s) => s.story)?.story;
    const videos = new Set([...snaps, ...opener].flatMap((s) => (s.videos ?? []).map((v) => v.url))).size;
    const docs = [...new Map([...snaps, ...opener].flatMap((s) => s.documents ?? []).map((d) => [d.url, d])).values()];
    this.els.docs.replaceChildren(
      ...(docs.length ? [h('div', { class: 'muted' }, 'מסמכים שנמצאו במשימה (יישלחו ל-Claude):')] : []),
      ...docs.slice(0, 3).map((d) => h('a', { href: d.url, target: '_blank', rel: 'noopener' }, `📄 ${d.title}`)),
    );
    if (docs.length && !this.tabs.story.btn.querySelector('.dot')) this.tabs.story.btn.append(h('span', { class: 'dot' }));
    const pages = Math.max(1, ...snaps.map((s) => s.pages ?? 1));
    this.els.scanInfo.textContent =
      `נמצאו ${fields.length} שדות תשובה` +
      (pages > 1 ? ` ב-${pages} עמודים 📑` : '') +
      ` ב-${snaps.length} מסגרות` +
      (videos ? ` · ${videos} סרטוני יוטיוב 🎬` : '') +
      (docs.length ? ` · ${docs.length} מסמכים 📄` : '') +
      (opener.length ? ' · נמצא גם החלון שפתח את המשימה' : '') +
      (story ? ' · זוהה סיפור ✓' : ' · לא זוהה סיפור');
    this.els.fields.replaceChildren(
      ...fields.map((f) =>
        h('div', { title: f.context }, `${f.page ? `עמ' ${f.page} · ` : ''}[${kindLabel(f.kind)}] ${f.context.replace(/\s+/g, ' ').slice(0, 90)}`),
      ),
    );
    if (story) this.setStory(story.text, story.title);
  }

  private setStory(text: string, title?: string) {
    this.els.storyText.textContent = title ? `${title}\n\n${text}` : text;
    if (!this.tabs.story.btn.querySelector('.dot')) this.tabs.story.btn.append(h('span', { class: 'dot' }));
  }

  solve() {
    return this.run('solve');
  }

  /** solve / review / complete missing fields / solve again. */
  async run(mode: SolveRequest['mode'], extra: Pick<SolveRequest, 'onlyFields' | 'force'> = {}) {
    if (this.busy) return;
    if (!chrome.runtime?.id) return this.toast('התוסף התעדכן – תרענן את הדף (F5) ואז תנסה שוב.');
    this.busy = true;
    (this.els.solveBtn as HTMLButtonElement).disabled = true;
    (this.els.reviewBtn as HTMLButtonElement).disabled = true;
    this.open(true);
    this.showTab('answer');
    if (!extra.onlyFields) {
      this.els.answers.replaceChildren();
      this.els.sources.replaceChildren();
      this.els.searches.replaceChildren();
      this.els.fillRow.style.display = 'none';
    }
    this.els.banner.replaceChildren();
    this.setStatus('קורא את הדף…', true);

    let screenshot: string | null = null;
    if ((this.els.shot as HTMLInputElement).checked) {
      this.host.style.visibility = 'hidden';
      await new Promise((r) => setTimeout(r, 150));
      screenshot = await send<{ dataUrl: string | null }>({ type: 'capture' }).then((r) => r?.dataUrl ?? null).catch(() => null);
      this.host.style.visibility = '';
    }

    const port = chrome.runtime.connect({ name: 'solve' });
    port.onMessage.addListener((m: PortMessage) => this.onPortMessage(m));
    port.onDisconnect.addListener(() => this.finish());
    const req: SolveRequest = {
      mode,
      note: (this.els.note as HTMLTextAreaElement).value,
      manualStory: this.manualStory,
      screenshot,
      ...extra,
    };
    port.postMessage(req);
  }

  private finish() {
    this.busy = false;
    (this.els.solveBtn as HTMLButtonElement).disabled = false;
    (this.els.reviewBtn as HTMLButtonElement).disabled = false;
  }

  private onPortMessage(m: PortMessage) {
    switch (m.type) {
      case 'scan':
        this.setStatus(
          `מצאתי ${m.fields} שדות${m.pages > 1 ? ` ב-${m.pages} עמודים` : ''} ב-${m.frames} מסגרות${m.story ? ' + סיפור' : ''}${m.documents ? ` + ${m.documents} מסמכים` : ''}${m.videos ? ` + ${m.videos} סרטונים` : ''}${m.opener ? ' + החלון המקורי' : ''}.`,
          true,
        );
        break;
      case 'status':
        this.setStatus(m.text, true);
        break;
      case 'thinking':
        this.setStatus(`חושב… ${m.text.slice(-160)}`, true);
        break;
      case 'search':
        this.els.searches.append(h('div', {}, m.query));
        break;
      case 'result':
        this.showResult(m.result);
        this.finish();
        break;
      case 'cached':
        this.showResult(m.result);
        this.els.banner.replaceChildren(
          h(
            'div',
            { class: 'warn info' },
            `💾 כבר פתרת את הדף הזה (${new Date(m.at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}) – אלה התשובות השמורות, בחינם. `,
            h('button', { class: 'btn mini', onclick: () => this.run('solve', { force: true }) }, '🔄 פתור מחדש'),
          ),
        );
        this.finish();
        break;
      case 'review':
        this.showReview(m.review);
        this.finish();
        break;
      case 'error':
        this.setStatus(m.message, false, true);
        this.finish();
        break;
    }
  }

  private setStatus(text: string, spinning = false, error = false) {
    this.els.status.className = error ? 'status err' : 'status';
    this.els.status.replaceChildren(...(spinning ? [h('span', { class: 'spinner' })] : []), text);
  }

  showResult(result: SolveResult) {
    this.result = result;
    const cost = result.costUsd ? ` · עלות משוערת: $${result.costUsd.toFixed(3)}` : '';
    this.setStatus(`✅ מוכן – ${result.answers.length} תשובות${cost}${result.notes ? `\n${result.notes}` : ''}`);
    this.els.searches.replaceChildren(
      ...(result.videos ?? []).map((v) =>
        h('div', { class: v.ok ? 'video ok' : 'video bad', title: v.url }, `${v.ok ? '🎬 נצפה' : '⚠️ לא נצפה'}: ${v.url.replace('https://www.', '')}${v.message ? ` – ${v.message}` : ''}`),
      ),
      ...result.searches.map((q) => h('div', {}, q)),
    );
    this.els.answers.replaceChildren(...result.answers.map((a) => this.answerCard(a)));
    this.els.sources.replaceChildren(
      ...(result.sources.length ? [h('div', { class: 'muted' }, 'מקורות:')] : []),
      ...result.sources.map((s) => h('a', { href: s.url, target: '_blank', rel: 'noopener', title: s.url }, `🔗 ${s.title || s.url}`)),
    );
    this.els.fillRow.style.display = result.answers.some((a) => a.field_id) ? '' : 'none';

    const banners: HTMLElement[] = [];
    if (result.missing?.length) {
      banners.push(
        h(
          'div',
          { class: 'warn' },
          h('b', {}, `⚠️ ${result.missing.length} שדות לא קיבלו תשובה:`),
          ...result.missing.slice(0, 6).map((m) => h('div', { class: 'muted' }, `• ${m.context.slice(0, 90)}`)),
          h(
            'button',
            { class: 'btn primary mini', onclick: () => this.run('solve', { onlyFields: result.missing!.map((m) => m.field_id) }) },
            '✨ השלם את החסר',
          ),
          h('div', { class: 'muted' }, 'אם זה שדה כמו שם או כיתה – אפשר להתעלם.'),
        ),
      );
    }
    if (result.duplicates?.length) {
      banners.push(h('div', { class: 'warn' }, `⚠️ ${result.duplicates.length} שדות קיבלו יותר מתשובה אחת – תבדוק אותם לפני מילוי.`));
    }
    if (result.storyFromMemory) banners.push(h('div', { class: 'warn info' }, '📖 הסיפור נלקח מעמוד קודם של אותה משימה.'));
    for (const d of result.documents ?? []) {
      banners.push(h('div', { class: d.ok ? 'video ok' : 'video bad' }, `${d.ok ? '📄 נקרא' : '⚠️ לא נקרא'}: ${d.title}${d.message ? ` – ${d.message}` : ''}`));
    }
    this.els.banner.replaceChildren(...banners);
  }

  showReview(review: ReviewResult) {
    this.result = null;
    const avg = review.items.length ? Math.round(review.items.reduce((n, i) => n + i.grade, 0) / review.items.length) : 0;
    this.setStatus(`✅ הבדיקה מוכנה – ציון ממוצע: ${avg} · עלות משוערת: $${review.costUsd.toFixed(3)}${review.overall ? `\n${review.overall}` : ''}`);
    this.els.fillRow.style.display = 'none';
    this.els.searches.replaceChildren(...review.searches.map((q) => h('div', {}, q)));
    this.els.answers.replaceChildren(...review.items.map((i) => this.reviewCard(i)));
    this.els.sources.replaceChildren(
      ...(review.sources.length ? [h('div', { class: 'muted' }, 'מקורות:')] : []),
      ...review.sources.map((s) => h('a', { href: s.url, target: '_blank', rel: 'noopener', title: s.url }, `🔗 ${s.title || s.url}`)),
    );
  }

  private reviewCard(i: ReviewItem): HTMLElement {
    const outcome = h('span');
    const cls = i.grade >= 85 ? 'grade good' : i.grade >= 60 ? 'grade mid' : 'grade low';
    return h(
      'div',
      { class: 'card' },
      h('h3', {}, h('span', {}, [i.question, i.part].filter(Boolean).join(' · ') || 'תשובה'), outcome, h('b', { class: cls }, `${i.grade}`)),
      i.correct ? h('div', { class: 'answer' }, `👍 ${i.correct}`) : null,
      i.missing ? h('div', { class: 'answer miss' }, `✏️ ${i.missing}`) : null,
      h('details', {}, h('summary', {}, 'גרסה משופרת'), h('div', { class: 'answer' }, i.improved)),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn mini', onclick: () => this.copy(i.improved) }, '📋 העתק משופר'),
        i.field_id
          ? h(
              'button',
              { class: 'btn mini', onclick: () => this.fill([{ question: i.question, part: i.part, answer: i.improved, field_id: i.field_id, option: null }], outcome) },
              '✍️ החלף בגרסה המשופרת',
            )
          : null,
      ),
    );
  }

  private answerCard(a: Answer): HTMLElement {
    const outcome = h('span');
    const title = [a.question, a.part].filter(Boolean).join(' · ') || 'תשובה';
    return h(
      'div',
      { class: 'card' },
      h(
        'h3',
        {},
        h('span', {}, title),
        outcome,
        h('button', { class: 'btn mini', title: 'העתק', onclick: () => this.copy(a.option ?? a.answer) }, '📋'),
        a.field_id
          ? h('button', { class: 'btn mini', title: 'מלא בשדה', onclick: () => this.fill([a], outcome) }, '✍️')
          : null,
      ),
      a.option ? h('div', { class: 'opt' }, `✔ ${a.option}`) : null,
      h('div', { class: 'answer' }, a.answer),
    );
  }

  async fill(answers: Answer[], outcomeEl?: HTMLElement) {
    const items = answers
      .filter((a) => a.field_id)
      .map((a) => ({ fieldId: a.field_id!, value: a.answer, option: a.option }));
    if (!items.length) return this.toast('אין שדות למילוי – העתק את התשובות ידנית');
    const outcomes = await send<FillOutcome[]>({ type: 'fill', items });
    const ok = outcomes.filter((o) => o.ok).length;
    if (outcomeEl) {
      const o = outcomes[0];
      outcomeEl.className = o?.ok ? 'ok' : 'bad';
      outcomeEl.textContent = o?.ok ? 'מולא ✓' : o?.message ?? 'נכשל';
    }
    this.toast(`מולאו ${ok} מתוך ${items.length} שדות. תבדוק לפני שאתה שולח!`);
  }

  fillLast() {
    if (!this.result) return this.toast('קודם צריך לפתור (Alt+Shift+A)');
    this.fill(this.result.answers);
  }

  async undo() {
    const n = await send<number>({ type: 'undo' });
    this.toast(n ? 'המילוי בוטל' : 'אין מה לבטל');
  }

  private copy(text: string) {
    navigator.clipboard.writeText(text).then(
      () => this.toast('הועתק ✓'),
      () => this.toast('ההעתקה נכשלה'),
    );
  }

  private copyAll() {
    if (!this.result) return;
    this.copy(
      this.result.answers
        .map((a) => `${[a.question, a.part].filter(Boolean).join(' ')}\n${a.option ? `${a.option}\n` : ''}${a.answer}`)
        .join('\n\n'),
    );
  }

  private async openStoryBar() {
    const label = await send<string | null>({ type: 'open-story' });
    if (!label) return this.toast('לא מצאתי כפתור שפותח את הסיפור – נסה "בחר אלמנט בדף"');
    this.toast(`לחצתי על "${label}"`);
    setTimeout(() => this.scan(), 1200);
  }

  private pickStory() {
    this.open(false);
    this.toast('לחץ על הסיפור בדף (Esc לביטול)');
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483645;border:3px solid #4f46e5;background:rgba(79,70,229,.08);border-radius:4px';
    document.documentElement.append(box);
    let target: Element | null = null;
    const move = (e: MouseEvent) => {
      target = e.target as Element;
      const r = target.getBoundingClientRect();
      Object.assign(box.style, { top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px` });
    };
    const done = (pick: boolean) => {
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key, true);
      box.remove();
      this.open(true);
      this.showTab('story');
      if (pick && target) {
        (window as unknown as { __sabManualStory?: Element }).__sabManualStory = target;
        this.scan();
      }
    };
    const click = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      done(true);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && done(false);
    document.addEventListener('mousemove', move, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
  }

  private async exportStructure() {
    const data = await send<object[]>({ type: 'structure' });
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sab-structure-${location.hostname}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    this.toast('הקובץ ירד – שלח אותו כדי שאכוון את התוסף לאתר הזה');
  }
}

function kindLabel(kind: string): string {
  return ({ text: 'טקסט', textarea: 'טקסט ארוך', richtext: 'עורך', radio: 'בחירה', checkbox: 'סימון', select: 'רשימה' } as Record<string, string>)[kind] ?? kind;
}
