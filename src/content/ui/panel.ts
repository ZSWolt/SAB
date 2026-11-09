import type { Answer, FillOutcome, PortMessage, ReviewItem, ReviewResult, SolveRequest, SolveResult, Source, TaggedSnapshot, TaskSummary } from '../../shared/types';
import { PANEL_HOST_ID } from '../text';
import { loadFonts } from './fonts';
import { icon, type IconName } from './icons';
import { PANEL_CSS } from './styles';

type Attrs = Record<string, string | ((e: Event) => void) | boolean | undefined>;
type Kid = Node | string | null | false | undefined;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: Kid[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const k of kids) if (k !== null && k !== false && k !== undefined) el.append(k);
  return el;
}

/** Small keycaps for a shortcut, like Alt Shift A. */
const keys = (...k: string[]) => h('span', { class: 'kbd' }, ...k.map((x) => h('kbd', {}, x)));
/** A row with a line icon and text. */
const metaRow = (name: IconName, text: string, opts: { bad?: boolean; title?: string } = {}) =>
  h('div', { class: opts.bad ? 'm bad' : 'm', title: opts.title ?? text }, icon(name), h('span', { class: 't' }, text));
const iconBtn = (name: IconName, title: string, onclick: (e: Event) => void, sm = false) =>
  h('button', { class: sm ? 'icon-btn sm' : 'icon-btn', title, 'aria-label': title, onclick }, icon(name));
const fmtCost = (usd: number) => `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
const fmtDate = (t: number) => new Date(t).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

/** Messages to the background. If the extension was updated, this old copy can't talk to it anymore. */
const send = <T = unknown>(msg: object): Promise<T> => {
  if (!chrome.runtime?.id) return Promise.reject(new Error('התוסף התעדכן. תרענן את הדף (F5)'));
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
  private liveSearches: string[] = [];
  private currentTab = 'task';

  constructor() {
    this.host = document.createElement('div');
    this.host.id = PANEL_HOST_ID;
    this.shadow = this.host.attachShadow({ mode: 'open' });
    loadFonts();
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
      h('button', { class: 'fab', title: 'SAB עוזר משימות · Alt Shift S', 'aria-label': 'פתח את SAB', onclick: () => this.toggle() }, icon('notebook', 18)),
      h('button', { class: 'fab-x', title: 'הסתר עד Alt Shift S', 'aria-label': 'הסתר', onclick: () => this.setHidden(true, true) }, icon('close', 12)),
    );

    const tabBar = h('div', { class: 'tabs', role: 'tablist' });
    const body = h('div', { class: 'body' });
    for (const [key, label] of [
      ['task', 'משימה'],
      ['answer', 'תשובה'],
      ['story', 'סיפור'],
      ['history', 'היסטוריה'],
    ] as const) {
      const btn = h('button', { class: 'tab', role: 'tab', onclick: () => this.showTab(key) }, label) as HTMLButtonElement;
      const sec = h('div', { class: 'section', role: 'tabpanel' });
      tabBar.append(btn);
      body.append(sec);
      this.tabs[key] = { btn, sec };
    }

    this.els.foot = h(
      'div',
      { class: 'foot' },
      h('button', { class: 'btn primary', onclick: () => this.fill(this.result?.answers ?? []) }, h('span', { class: 'lbl' }, icon('fill'), 'מלא הכול בדף'), keys('Alt', 'Shift', 'F')),
      iconBtn('undo', 'בטל מילוי', () => this.undo()),
      iconBtn('copy', 'העתק הכול', () => this.copyAll()),
    );

    this.panel = h(
      'div',
      { class: 'panel', role: 'dialog', 'aria-label': 'SAB' },
      h(
        'div',
        { class: 'head' },
        h('div', { class: 'brand' }, h('b', {}, 'SAB'), h('span', {}, 'עוזר משימות'), h('small', {}, `v${chrome.runtime.getManifest().version}`)),
        iconBtn('settings', 'הגדרות', () => send({ type: 'open-options' })),
        iconBtn('close', 'סגור', () => this.open(false)),
      ),
      tabBar,
      body,
      this.els.foot,
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
    this.els.note = h('textarea', { placeholder: 'הערה ל-Claude, למשל "רק שאלה 3" או "באנגלית"', 'aria-label': 'הערה' });
    this.els.shot = h('input', { type: 'checkbox' });
    this.els.scanInfo = h('div', { class: 'meta' });
    this.els.fields = h('div', { class: 'fields' });
    this.els.solveBtn = h('button', { class: 'btn primary big', onclick: () => this.solve() }, h('span', { class: 'lbl' }, 'פתור את המשימה'), keys('Alt', 'Shift', 'A'));
    this.els.reviewBtn = h(
      'button',
      { class: 'btn big', title: 'ציון והערות על מה שכתבת, כמו במחוון בגרות', onclick: () => this.run('review') },
      h('span', { class: 'lbl' }, icon('review'), 'בדוק אותי'),
      h('span', { class: 'muted' }, 'ציון והערות על מה שכתבתי'),
    );
    sec.append(
      this.els.solveBtn,
      this.els.reviewBtn,
      this.els.note,
      h('label', { class: 'check' }, this.els.shot, 'צרף צילום מסך לשאלות עם תמונה או גרף'),
      h(
        'div',
        { class: 'tools' },
        h('button', { class: 'btn ghost', onclick: () => this.scan() }, icon('scan'), 'בדוק מה זוהה'),
        h('button', { class: 'btn ghost', onclick: () => this.exportStructure() }, icon('download'), 'ייצא מבנה דף'),
      ),
      this.els.scanInfo,
      this.els.fields,
    );
  }

  private buildAnswer() {
    const sec = this.tabs.answer.sec;
    this.els.status = h('div', { class: 'status' }, h('span', { class: 'st' }, 'עוד לא נפתרה משימה בדף הזה'));
    this.els.note2 = h('div', { class: 'note' });
    this.els.banner = h('div', { class: 'notices' });
    this.els.searches = h('div', { class: 'meta' });
    this.els.answers = h('div', { class: 'cards' });
    this.els.sources = h('div', { class: 'sources' });
    sec.append(this.els.status, this.els.note2, this.els.banner, this.els.searches, this.els.answers, this.els.sources);
  }

  private buildStory() {
    const sec = this.tabs.story.sec;
    this.els.storyText = h('div', { class: 'story empty' }, 'עוד לא זוהה סיפור. אפשר ללחוץ "בדוק מה זוהה" בלשונית משימה, או להשתמש באפשרויות למטה');
    this.els.manual = h('textarea', { placeholder: 'אפשר להדביק כאן את הסיפור או השיר, והוא יישלח יחד עם השאלות', style: 'min-height:96px', 'aria-label': 'סיפור' });
    this.els.manual.addEventListener('input', () => (this.manualStory = (this.els.manual as HTMLTextAreaElement).value));
    this.els.docs = h('div', { class: 'meta' });
    sec.append(
      this.els.docs,
      this.els.storyText,
      h(
        'div',
        { class: 'tools' },
        h('button', { class: 'btn ghost', onclick: () => this.openStoryBar() }, icon('book'), 'פתח את בר הסיפור'),
        h('button', { class: 'btn ghost', onclick: () => this.pickStory() }, icon('pick'), 'בחר את הסיפור בדף'),
      ),
      this.els.manual,
    );
  }

  private buildHistory() {
    const sec = this.tabs.history.sec;
    this.els.monthCost = h('div', { class: 'stat' }, h('div', { class: 'muted' }, 'הוצאה החודש'), h('div', { class: 'num' }, '…'));
    this.els.history = h('div', { class: 'hist-list' });
    sec.append(this.els.monthCost, this.els.history);
    this.tabs.history.btn.addEventListener('click', () => this.loadHistory());
  }

  private async loadHistory(data?: { tasks: TaskSummary[]; monthCost: number }) {
    const res = data ?? (await send<{ tasks: TaskSummary[]; monthCost: number }>({ type: 'history-list' }));
    this.els.monthCost.replaceChildren(
      h('div', { class: 'muted' }, 'הוצאה החודש'),
      h('div', { class: 'num' }, fmtCost(res.monthCost)),
      h('div', { class: 'muted' }, plural(res.tasks.length, 'משימה אחת שמורה', 'משימות שמורות')),
    );
    if (!res.tasks.length) {
      this.els.history.replaceChildren(h('div', { class: 'muted' }, 'כל משימה שתפתור תישמר כאן'));
      return;
    }
    this.els.history.replaceChildren(
      ...res.tasks.map((t) =>
        h(
          'div',
          { class: 'hist' },
          h(
            'div',
            { class: 'hm' },
            h('div', { class: 'ht', title: t.url }, t.title || t.url),
            h('div', { class: 'hd' }, `${fmtDate(t.updatedAt)} · ${plural(t.pages, 'עמוד אחד', 'עמודים')} · ${t.answers} תשובות · ${fmtCost(t.costUsd)}`),
          ),
          iconBtn('eye', 'הצג תשובות', () => this.openHistory(t.key), true),
          iconBtn('trash', 'מחק', async () => this.loadHistory(await send({ type: 'history-delete', key: t.key })), true),
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
    this.els.banner.prepend(
      h('div', { class: 'info' }, `תשובות שמורות מ-${fmtDate(r.at)}${same ? '' : '. זה דף אחר, אז אפשר להעתיק אבל לא למלא'}`),
    );
  }

  // ---------- visibility ----------
  private showTab(key: string) {
    this.currentTab = key;
    for (const [k, t] of Object.entries(this.tabs)) {
      t.btn.classList.toggle('active', k === key);
      t.btn.setAttribute('aria-selected', String(k === key));
      t.sec.classList.toggle('active', k === key);
    }
    this.updateFoot();
  }

  /** The fill bar sits at the bottom of the answer tab when there's something to fill. */
  private updateFoot() {
    const show = this.currentTab === 'answer' && !!this.result?.answers.some((a) => a.field_id);
    this.els.foot.classList.toggle('show', show);
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
    if (hidden && announce) this.toast('העוזר הוסתר. פותחים אותו שוב עם Alt Shift S');
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
    const t = h('div', { class: 'toast', role: 'status' }, text);
    this.root.append(t);
    setTimeout(() => t.remove(), 3500);
  }

  // ---------- actions ----------
  async scan() {
    this.els.scanInfo.replaceChildren(h('div', { class: 'm' }, h('span', { class: 'spinner' }), 'קורא את הדף'));
    const res = await send<{ snapshots: TaggedSnapshot[]; opener: TaggedSnapshot[] }>({ type: 'scan' });
    this.renderScan(res.snapshots, res.opener);
  }

  private renderScan(snaps: TaggedSnapshot[], opener: TaggedSnapshot[]) {
    const fields = snaps.flatMap((s) => s.fields.map((f) => ({ ...f, frame: s.frameId })));
    const story = [...snaps, ...opener].find((s) => s.story)?.story;
    const videos = new Set([...snaps, ...opener].flatMap((s) => (s.videos ?? []).map((v) => v.url))).size;
    const docs = [...new Map([...snaps, ...opener].flatMap((s) => s.documents ?? []).map((d) => [d.url, d])).values()];
    const pages = Math.max(1, ...snaps.map((s) => s.pages ?? 1));

    this.els.docs.replaceChildren(
      ...(docs.length ? [h('div', { class: 'label' }, 'מסמכים במשימה, יישלחו ל-Claude')] : []),
      ...docs.slice(0, 3).map((d) => h('a', { class: 'm', href: d.url, target: '_blank', rel: 'noopener' }, icon('file'), h('span', { class: 't' }, d.title))),
    );
    if ((docs.length || story) && !this.tabs.story.btn.querySelector('.dot')) this.tabs.story.btn.append(h('span', { class: 'dot' }));

    this.els.scanInfo.replaceChildren(
      metaRow('check', `נמצאו ${fields.length} שדות תשובה${pages > 1 ? ` ב-${pages} עמודים` : ''} ב-${snaps.length} מסגרות`),
      metaRow('book', story ? 'זוהה סיפור' : 'לא זוהה סיפור'),
      ...(docs.length ? [metaRow('file', `${docs.length} מסמכים`)] : []),
      ...(videos ? [metaRow('video', `${videos} סרטוני יוטיוב`)] : []),
      ...(opener.length ? [metaRow('link', 'נמצא גם החלון שפתח את המשימה')] : []),
    );
    this.els.fields.replaceChildren(
      ...fields.map((f) =>
        h(
          'div',
          { class: 'm', title: f.context },
          h('span', { class: 'pg' }, f.page ? `עמ' ${f.page}` : kindLabel(f.kind)),
          h('span', { class: 't' }, f.context.replace(/\s+/g, ' ').slice(0, 120)),
        ),
      ),
    );
    if (story) this.setStory(story.text, story.title);
  }

  private setStory(text: string, title?: string) {
    this.els.storyText.className = 'story';
    this.els.storyText.replaceChildren(...(title ? [h('h2', {}, title)] : []), text);
    if (!this.tabs.story.btn.querySelector('.dot')) this.tabs.story.btn.append(h('span', { class: 'dot' }));
  }

  solve() {
    return this.run('solve');
  }

  /** solve / review / complete missing fields / solve again. */
  async run(mode: SolveRequest['mode'], extra: Pick<SolveRequest, 'onlyFields' | 'force'> = {}) {
    if (this.busy) return;
    if (!chrome.runtime?.id) return this.toast('התוסף התעדכן. תרענן את הדף (F5) ואז תנסה שוב');
    this.busy = true;
    (this.els.solveBtn as HTMLButtonElement).disabled = true;
    (this.els.reviewBtn as HTMLButtonElement).disabled = true;
    this.open(true);
    this.showTab('answer');
    this.liveSearches = [];
    if (!extra.onlyFields) {
      this.result = null;
      this.els.answers.replaceChildren();
      this.els.sources.replaceChildren();
      this.els.searches.replaceChildren();
      this.updateFoot();
    }
    this.els.banner.replaceChildren();
    this.els.note2.textContent = '';
    this.setStatus('קורא את הדף', true);

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
      case 'scan': {
        const parts = [
          `${m.fields} שדות${m.pages > 1 ? ` ב-${m.pages} עמודים` : ''}`,
          m.story && 'סיפור',
          m.documents && `${m.documents} מסמכים`,
          m.videos && `${m.videos} סרטונים`,
          m.opener && 'החלון המקורי',
        ].filter(Boolean);
        this.setStatus(`מצאתי ${parts.join(' · ')}`, true);
        break;
      }
      case 'status':
        this.setStatus(m.text, true);
        break;
      case 'thinking':
        this.setStatus(`חושב · ${m.text.replace(/\s+/g, ' ').slice(-140)}`, true);
        break;
      case 'search':
        if (!this.liveSearches.includes(m.query)) {
          this.liveSearches.push(m.query);
          this.els.searches.append(metaRow('search', m.query));
        }
        break;
      case 'result':
        this.showResult(m.result);
        this.finish();
        break;
      case 'cached':
        this.showResult(m.result);
        this.els.banner.prepend(
          h(
            'div',
            { class: 'info' },
            `כבר פתרת את הדף הזה ב-${fmtDate(m.at)}. אלה התשובות השמורות, בלי עלות`,
            h('button', { class: 'btn sm', onclick: () => this.run('solve', { force: true }) }, icon('refresh', 14), 'פתור מחדש'),
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

  private setStatus(text: string, spinning = false, error = false, cost?: number) {
    this.els.status.className = error ? 'status err' : 'status';
    this.els.status.replaceChildren(
      spinning ? h('span', { class: 'spinner' }) : icon(error ? 'alert' : 'check'),
      h('span', { class: 'st' }, text),
      ...(cost ? [h('span', { class: 'cost', title: 'עלות משוערת' }, fmtCost(cost))] : []),
    );
  }

  private renderSources(list: Source[]) {
    this.els.sources.replaceChildren(
      ...(list.length ? [h('div', { class: 'label' }, 'מקורות')] : []),
      ...list.map((s) => {
        let dom = '';
        try {
          dom = new URL(s.url).hostname.replace(/^www\./, '');
        } catch {
          /* ignore */
        }
        return h('a', { href: s.url, target: '_blank', rel: 'noopener', title: s.url }, icon('link'), h('span', { class: 't' }, s.title || dom), h('span', { class: 'dom' }, dom));
      }),
    );
  }

  showResult(result: SolveResult) {
    this.result = result;
    this.setStatus(`מוכן · ${result.answers.length} תשובות`, false, false, result.costUsd);
    this.els.note2.textContent = result.notes ?? '';
    this.els.searches.replaceChildren(
      ...(result.documents ?? []).map((d) => metaRow(d.ok ? 'file' : 'alert', `${d.ok ? 'נקרא' : 'לא נקרא'}: ${d.title}${d.message ? ` · ${d.message}` : ''}`, { bad: !d.ok })),
      ...(result.videos ?? []).map((v) =>
        metaRow(v.ok ? 'video' : 'alert', `${v.ok ? 'נצפה' : 'לא נצפה'}: ${v.url.replace('https://www.', '')}${v.message ? ` · ${v.message}` : ''}`, { bad: !v.ok, title: v.url }),
      ),
      ...[...new Set(result.searches)].map((q) => metaRow('search', q)),
    );
    this.els.answers.replaceChildren(...result.answers.map((a) => this.answerCard(a)));
    this.renderSources(result.sources);
    this.updateFoot();

    const notices: HTMLElement[] = [];
    if (result.missing?.length) {
      const n = result.missing.length;
      notices.push(
        h(
          'div',
          { class: 'warn' },
          h('div', { class: 'wt' }, icon('alert'), n === 1 ? 'שדה אחד לא קיבל תשובה' : `${n} שדות לא קיבלו תשובה`),
          h('ul', {}, ...result.missing.slice(0, 6).map((m) => h('li', {}, m.context.slice(0, 90)))),
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn sm', onclick: () => this.run('solve', { onlyFields: result.missing!.map((m) => m.field_id) }) }, icon('plus', 14), 'השלם את החסר'),
            h('span', { class: 'muted' }, 'שדה כמו שם או כיתה אפשר להשאיר ריק'),
          ),
        ),
      );
    }
    if (result.duplicates?.length) {
      notices.push(h('div', { class: 'warn' }, h('div', { class: 'wt' }, icon('alert'), `${result.duplicates.length} שדות קיבלו יותר מתשובה אחת. כדאי לבדוק אותם לפני מילוי`)));
    }
    if (result.storyFromMemory) notices.push(h('div', { class: 'info' }, 'הסיפור נלקח מעמוד קודם של אותה משימה'));
    this.els.banner.replaceChildren(...notices);
  }

  showReview(review: ReviewResult) {
    this.result = null;
    this.updateFoot();
    const avg = review.items.length ? Math.round(review.items.reduce((n, i) => n + i.grade, 0) / review.items.length) : 0;
    this.setStatus(`הבדיקה מוכנה · ציון ממוצע: ${avg}`, false, false, review.costUsd);
    this.els.note2.textContent = review.overall;
    this.els.searches.replaceChildren(...[...new Set(review.searches)].map((q) => metaRow('search', q)));
    this.els.answers.replaceChildren(...review.items.map((i) => this.reviewCard(i)));
    this.renderSources(review.sources);
  }

  private reviewCard(i: ReviewItem): HTMLElement {
    const outcome = h('span', { class: 'out' });
    return h(
      'div',
      { class: 'card' },
      h('div', { class: 'card-h' }, h('span', { class: 'q' }, [i.question, i.part].filter(Boolean).join(' · ') || 'תשובה'), outcome, h('span', { class: 'grade', title: 'ציון' }, String(i.grade))),
      i.correct ? h('div', {}, h('div', { class: 'sub' }, 'מה טוב'), h('div', { class: 'answer sec' }, i.correct)) : null,
      i.missing ? h('div', {}, h('div', { class: 'sub' }, 'מה חסר'), h('div', { class: 'answer sec' }, i.missing)) : null,
      h('details', {}, h('summary', {}, 'גרסה משופרת'), h('div', { class: 'answer' }, i.improved)),
      h(
        'div',
        { class: 'acts' },
        h('button', { class: 'btn sm', onclick: () => this.copy(i.improved) }, icon('copy', 14), 'העתק'),
        i.field_id
          ? h(
              'button',
              { class: 'btn sm', onclick: () => this.fill([{ question: i.question, part: i.part, answer: i.improved, field_id: i.field_id, option: null }], outcome) },
              icon('fill', 14),
              'החלף בגרסה המשופרת',
            )
          : null,
      ),
    );
  }

  private answerCard(a: Answer): HTMLElement {
    const outcome = h('span', { class: 'out' });
    return h(
      'div',
      { class: 'card' },
      h(
        'div',
        { class: 'card-h' },
        h('span', { class: 'q' }, [a.question, a.part].filter(Boolean).join(' · ') || 'תשובה'),
        outcome,
        iconBtn('copy', 'העתק', () => this.copy(a.option ?? a.answer), true),
        a.field_id ? iconBtn('fill', 'מלא בשדה', () => this.fill([a], outcome), true) : null,
      ),
      a.option ? h('div', { class: 'opt' }, h('span', { class: 'hl' }, a.option)) : null,
      h('div', { class: a.option ? 'answer sec' : 'answer' }, a.answer),
    );
  }

  async fill(answers: Answer[], outcomeEl?: HTMLElement) {
    const items = answers
      .filter((a) => a.field_id)
      .map((a) => ({ fieldId: a.field_id!, value: a.answer, option: a.option }));
    if (!items.length) return this.toast('אין שדות למילוי. אפשר להעתיק את התשובות');
    const outcomes = await send<FillOutcome[]>({ type: 'fill', items });
    const ok = outcomes.filter((o) => o.ok).length;
    if (outcomeEl) {
      const o = outcomes[0];
      outcomeEl.className = o?.ok ? 'out ok' : 'out bad';
      outcomeEl.textContent = o?.ok ? 'מולא' : o?.message ?? 'נכשל';
    }
    this.toast(`מולאו ${ok} מתוך ${items.length} שדות. תעבור עליהם לפני שאתה שולח`);
  }

  fillLast() {
    if (!this.result) return this.toast('קודם צריך לפתור. Alt Shift A');
    this.fill(this.result.answers);
  }

  async undo() {
    const n = await send<number>({ type: 'undo' });
    this.toast(n ? 'המילוי בוטל' : 'אין מה לבטל');
  }

  private copy(text: string) {
    navigator.clipboard.writeText(text).then(
      () => this.toast('הועתק'),
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
    if (!label) return this.toast('לא מצאתי כפתור שפותח את הסיפור. אפשר לבחור אותו בדף');
    this.toast(`לחצתי על "${label}"`);
    setTimeout(() => this.scan(), 1200);
  }

  private pickStory() {
    this.open(false);
    this.toast('לחץ על הסיפור בדף. Esc לביטול');
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483645;border:2px solid #1d4ed8;background:rgba(29,78,216,.06);border-radius:4px';
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
    this.toast('הקובץ ירד. אפשר לשלוח אותו כדי שאכוון את התוסף לאתר הזה');
  }
}

function kindLabel(kind: string): string {
  return ({ text: 'טקסט', textarea: 'פתוחה', richtext: 'עורך', radio: 'בחירה', checkbox: 'סימון', select: 'רשימה' } as Record<string, string>)[kind] ?? kind;
}
