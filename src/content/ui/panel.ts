import { DEFAULT_SETTINGS, getSettings, saveSettings, type Settings } from '../../shared/settings';
import type { Answer, ChatMessage, FillOutcome, PortMessage, ReviewItem, SolveRequest, SolveResult, TaggedSnapshot, TaskSummary } from '../../shared/types';
import { questionLine } from '../../background/coverage';
import { PANEL_HOST_ID } from '../text';
import { isStorySite } from '../extract';
import { orderedRows } from '../../shared/labels';
import { h, iconBtn, swap } from './dom';
import { loadFonts } from './fonts';
import { icon } from './icons';
import { createStore, initialState, resolveTheme, upsertStep, type AnswersMode, type Filter, type ScanSummary, type Sheet, type Tab, type UIState } from './store';
import { PANEL_CSS } from './styles';
import { answersView } from './views/answers';
import { boardView } from './views/board';
import { chatView } from './views/chat';
import { historyTab, settingsSheet, SHEET_TITLES, storyTab } from './views/sheets';
import type { Actions, Drafts, Rendered } from './views/types';

/** Messages to the background. If the extension was updated, this old copy can't talk to it anymore. */
const send = <T = unknown>(msg: object): Promise<T> => {
  if (!chrome.runtime?.id) return Promise.reject(new Error('התוסף התעדכן. תרענן את הדף (F5)'));
  return chrome.runtime.sendMessage(msg);
};

const CHOICE_KINDS = new Set(['radio', 'checkbox', 'select']);

export function summarizeScan(snaps: TaggedSnapshot[], opener: TaggedSnapshot[]): ScanSummary {
  const all = [...snaps, ...opener];
  const fields = snaps.flatMap((s) => s.fields);
  return {
    fields: fields.length,
    choice: fields.filter((f) => CHOICE_KINDS.has(f.kind)).length,
    open: fields.filter((f) => !CHOICE_KINDS.has(f.kind)).length,
    pages: Math.max(1, ...snaps.map((s) => s.pages ?? s.pagesFound ?? 1)),
    story: all.find((s) => s.story)?.story ?? null,
    docs: [...new Map(all.flatMap((s) => s.documents ?? []).map((d) => [d.url, d])).values()],
    videos: new Set(all.flatMap((s) => (s.videos ?? []).map((v) => v.url))).size,
    opener: opener.length > 0,
    questions: fields.map((f) => ({ text: questionLine(f.context), page: f.page, kind: f.kind })),
  };
}

export class Panel {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private root!: HTMLElement;
  private panel!: HTMLElement;
  private fabWrap!: HTMLElement;
  private head!: HTMLElement;
  private tabbar!: HTMLElement;
  private top!: HTMLElement;
  private body!: HTMLElement;
  private foot!: HTMLElement;
  private chatPort: chrome.runtime.Port | null = null;
  private store = createStore({ ...initialState(), storySite: isStorySite() });
  private lastTab: Tab | null = null;
  private drafts: Drafts = { note: '', shot: false, manualStory: '', chat: '' };
  private port: chrome.runtime.Port | null = null;
  private prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)');
  private scannedOnce = false;
  private actions: Actions;

  constructor() {
    this.host = document.createElement('div');
    this.host.id = PANEL_HOST_ID;
    this.shadow = this.host.attachShadow({ mode: 'open' });
    loadFonts();
    this.actions = this.makeActions();
    this.buildShell();
    document.documentElement.appendChild(this.host);
    this.store.subscribe(() => this.render());
    this.render();

    chrome.storage.local.get('uiHidden').then(({ uiHidden }) => this.setHidden(!!uiHidden, false));
    this.loadSettings();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings) this.loadSettings();
    });
    this.prefersDark?.addEventListener?.('change', () => this.applyTheme());
    send<{ result: SolveResult | null }>({ type: 'get-last' })
      .then((r) => r?.result && this.store.set({ result: r.result }))
      .catch(() => {});
    send<ChatMessage[] | null>({ type: 'chat-load' })
      .then((chat) => chat?.length && this.store.set({ chat }))
      .catch(() => {});
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen() && this.store.get().sheet) {
        this.store.set({ sheet: null });
        e.stopPropagation();
      }
    }, true);
  }

  // ---------- shell & rendering ----------
  private buildShell() {
    this.shadow.append(h('style', {}, PANEL_CSS));
    this.root = h('div', { class: 'root', 'data-theme': 'notebook' });
    // round button in the bottom-left corner, like an accessibility button
    this.fabWrap = h(
      'div',
      { class: 'launcher' },
      h('button', { type: 'button', class: 'fab', 'aria-label': 'פתח את SAB', onclick: () => this.toggle() }, icon('notebook', 24)),
      h('span', { class: 'fab-tip', role: 'tooltip' }, 'SAB · ', h('span', { class: 'kb' }, 'Alt Shift S')),
      h('button', { type: 'button', class: 'fab-x', title: 'הסתר עד Alt Shift S', 'aria-label': 'הסתר', onclick: () => this.setHidden(true, true) }, icon('close', 12)),
    );
    this.head = h('div', { class: 'head' });
    this.tabbar = h('div', { class: 'tabbar', role: 'tablist' });
    this.top = h('div', { class: 'top' });
    this.body = h('div', { class: 'body' });
    this.foot = h('div', { class: 'foot' });
    this.panel = h('div', { class: 'panel', role: 'dialog', 'aria-label': 'SAB עוזר משימות' }, this.head, this.tabbar, this.top, this.body, this.foot);
    this.root.append(this.fabWrap, this.panel);
    this.shadow.append(this.root);
  }

  private render() {
    const s = this.store.get();
    const a = this.actions;
    if (s.sheet) {
      swap(this.head, [iconBtn('back', 'חזרה', () => a.closeSheet()), h('span', { class: 'sheet-title' }, SHEET_TITLES[s.sheet])]);
      this.head.className = 'head sheet';
    } else {
      swap(this.head, [
        h('div', { class: 'brand' }, h('b', {}, 'SAB'), h('span', { title: document.title }, document.title.slice(0, 40) || 'עוזר משימות'), h('small', {}, `v${chrome.runtime.getManifest().version}`)),
        iconBtn('refresh', 'זהה מחדש את הדף', () => a.rescan()),
        iconBtn('sliders', 'הגדרות', () => a.openSheet('settings')),
        iconBtn('close', 'סגור', () => this.open(false)),
      ]);
      this.head.className = 'head';
    }
    const count = s.result ? s.result.answers.length : s.review ? s.review.items.length : 0;
    const tab = (id: Tab, label: string, name: 'board' | 'answers' | 'chat' | 'book' | 'history', badge?: number) =>
      h(
        'button',
        { type: 'button', role: 'tab', 'data-tab': id, 'aria-selected': String(s.tab === id), onclick: () => a.setTab(id) },
        icon(name, 14),
        label,
        badge ? h('span', { class: 'tcount' }, String(badge)) : null,
      );
    swap(
      this.tabbar,
      s.sheet
        ? null
        : [tab('board', 'לוח', 'board'), tab('answers', 'תשובות', 'answers', count), tab('chat', 'שיחה', 'chat'), tab('story', 'סיפור', 'book'), tab('history', 'היסטוריה', 'history')],
    );
    this.tabbar.style.display = s.sheet ? 'none' : '';
    const view = this.viewFor(s);
    swap(this.top, view.top ?? null);
    swap(this.body, view.body);
    swap(this.foot, view.foot ?? null);
    this.foot.style.padding = !s.sheet && s.tab === 'chat' ? '0' : '';
    this.foot.style.display = !s.sheet && s.tab === 'chat' ? 'block' : '';
    const where: Tab | null = s.sheet ? null : s.tab;
    if (where !== this.lastTab) this.body.scrollTop = 0; // a new tab starts at its top
    this.lastTab = where;
    if (where === 'chat') this.body.scrollTop = this.body.scrollHeight;
    this.fabWrap.classList.toggle('beside', this.isOpen());
  }

  private viewFor(s: UIState): Rendered {
    const a = this.actions;
    if (s.sheet === 'settings') return settingsSheet(s, a);
    if (s.tab === 'answers') return answersView(s, a);
    if (s.tab === 'chat') return chatView(s, a, this.drafts);
    if (s.tab === 'story') return storyTab(s, a, this.drafts);
    if (s.tab === 'history') return historyTab(s, a);
    return boardView(s, a, this.drafts);
  }

  // ---------- settings & theme ----------
  private async loadSettings() {
    const st = await getSettings();
    this.store.set({
      hasKey: !!st.apiKey,
      settings: { theme: st.theme ?? DEFAULT_SETTINGS.theme, answerLength: st.answerLength, autoFill: st.autoFill, readAllPages: st.readAllPages },
    });
    this.applyTheme();
  }

  private applyTheme() {
    const theme = resolveTheme(this.store.get().settings.theme, !!this.prefersDark?.matches);
    this.root.setAttribute('data-theme', theme);
    if (this.store.get().theme !== theme) this.store.set({ theme });
  }

  // ---------- visibility ----------
  open(on: boolean) {
    this.panel.classList.toggle('open', on);
    this.fabWrap.classList.toggle('beside', on);
    const fab = this.fabWrap.querySelector('.fab');
    fab?.replaceChildren(icon(on ? 'close' : 'notebook', on ? 20 : 24));
    fab?.setAttribute('aria-label', on ? 'סגור את SAB' : 'פתח את SAB');
    if (on && !this.scannedOnce && !this.store.get().busy) {
      this.scannedOnce = true;
      this.scan();
    }
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

  // ---------- page reading ----------
  /** Quick look at the page (no page clicking). `announce`: the student asked, so say what was found. */
  async scan(announce = false) {
    if (this.store.get().scanning) return;
    const prev = this.store.get().scan?.fields;
    this.store.set({ scanning: true, error: null });
    try {
      const res = await send<{ snapshots: TaggedSnapshot[]; opener: TaggedSnapshot[] }>({ type: 'scan' });
      const scan = summarizeScan(res?.snapshots ?? [], res?.opener ?? []);
      this.store.set({ scan, scanning: false });
      if (announce) {
        const n = scan.fields ? (scan.fields === 1 ? 'זוהתה שאלה אחת' : `זוהו ${scan.fields} שאלות`) : 'לא זוהו שאלות עם שדה תשובה';
        const changed = prev !== undefined && prev !== scan.fields;
        this.toast(`${n}${changed ? ` (קודם ${prev})` : ''}`);
        const r = this.store.get().result;
        if (changed && r && scan.fields > r.answers.length) setTimeout(() => this.toast('יש שאלות חדשות. אפשר "השלם חסר" או "פתור מחדש"'), 1800);
      }
    } catch (e) {
      this.store.set({ scanning: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // ---------- solving ----------
  solve() {
    return this.run('solve');
  }

  /** solve / review / complete missing fields / solve again. */
  async run(mode: SolveRequest['mode'], extra: Pick<SolveRequest, 'onlyFields' | 'force'> = {}) {
    const s = this.store.get();
    if (s.busy) return;
    if (!chrome.runtime?.id) return this.toast('התוסף התעדכן. תרענן את הדף (F5) ואז תנסה שוב');
    if (!s.hasKey) {
      this.open(true);
      this.store.set({ view: 'idle', sheet: null });
      return this.toast('קודם צריך לחבר את Claude');
    }
    this.open(true);
    this.store.set({
      tab: 'board',
      filter: 'all',
      busy: true,
      mode,
      view: 'working',
      sheet: null,
      steps: [],
      status: '',
      error: null,
      savedAt: null,
      savedElsewhere: false,
      ...(extra.onlyFields ? {} : mode === 'review' ? { review: null } : { result: null, filled: {} }),
    });

    let screenshot: string | null = null;
    if (this.drafts.shot) {
      this.host.style.visibility = 'hidden';
      await new Promise((r) => setTimeout(r, 150));
      screenshot = await send<{ dataUrl: string | null }>({ type: 'capture' }).then((r) => r?.dataUrl ?? null).catch(() => null);
      this.host.style.visibility = '';
      if (!screenshot) this.store.set({ status: 'צילום המסך דולג, כי הלשונית לא הייתה גלויה' });
    }

    const port = chrome.runtime.connect({ name: 'solve' });
    this.port = port;
    port.onMessage.addListener((m: PortMessage) => this.onPortMessage(m));
    port.onDisconnect.addListener(() => {
      if (this.port !== port) return;
      this.port = null;
      const cur = this.store.get();
      if (cur.busy) this.store.set({ busy: false, view: cur.result ? 'results' : 'idle', error: cur.error ?? 'העבודה נעצרה לפני שהסתיימה' });
    });
    port.postMessage({ mode, note: this.drafts.note, manualStory: this.drafts.manualStory, screenshot, ...extra } satisfies SolveRequest);
  }

  private onPortMessage(m: PortMessage) {
    const set = this.store.set;
    switch (m.type) {
      case 'step':
        set((s) => ({ steps: upsertStep(s.steps, { id: m.id, state: m.state, label: m.label, meta: m.meta }) }));
        break;
      case 'status':
        set({ status: m.text });
        break;
      case 'thinking':
        set({ status: `חושב · ${m.text.replace(/\s+/g, ' ').slice(-140)}` });
        break;
      case 'result':
        set({ result: m.result, view: 'results', busy: false, openRow: -1, filled: this.keepFilled(m.result), ...this.showAnswers('answers') });
        break;
      case 'cached':
        set({ result: m.result, view: 'results', busy: false, openRow: -1, savedAt: m.at, savedElsewhere: false, ...this.showAnswers('answers') });
        break;
      case 'review':
        set({ review: m.review, view: 'review', busy: false, openRow: 0, filled: {}, ...this.showAnswers('grades') });
        break;
      case 'error': {
        const cur = this.store.get();
        set({ error: m.message, busy: false, view: cur.result && cur.mode === 'solve' ? 'results' : 'idle' });
        break;
      }
    }
  }

  /** Results open the answers tab, unless the student went off to chat or read the story meanwhile. */
  private showAnswers(mode: AnswersMode): Partial<UIState> {
    const tab = this.store.get().tab;
    return tab === 'board' || tab === 'answers' ? { tab: 'answers', answersMode: mode, filter: 'all' } : { answersMode: mode };
  }

  /** After "complete the missing", keep the fill marks of answers that didn't change. */
  private keepFilled(r: SolveResult) {
    const prev = this.store.get().filled;
    const ids = new Set(r.answers.map((a) => a.field_id).filter(Boolean));
    return Object.fromEntries(Object.entries(prev).filter(([id]) => ids.has(id)));
  }

  // ---------- chat ----------
  private sendChat(text: string) {
    const s = this.store.get();
    if (s.chatBusy) return;
    if (!s.hasKey) return this.toast('קודם צריך לחבר את Claude');
    if (!chrome.runtime?.id) return this.toast('התוסף התעדכן. תרענן את הדף (F5) ואז תנסה שוב');
    const chat: ChatMessage[] = [...s.chat, { role: 'user', text }];
    this.store.set({ chat, chatBusy: true, chatLive: '', chatStatus: '', error: null, tab: 'chat' });
    const port = chrome.runtime.connect({ name: 'chat' });
    this.chatPort = port;
    port.onMessage.addListener((m: PortMessage) => {
      if (m.type === 'chat-delta') this.store.set((st) => ({ chatLive: st.chatLive + m.text, chatStatus: '' }));
      else if (m.type === 'status') this.store.set({ chatStatus: m.text });
      else if (m.type === 'chat-done') {
        const next: ChatMessage[] = [...this.store.get().chat, { role: 'assistant', text: m.text, answers: m.answers, costUsd: m.costUsd }];
        this.store.set({ chat: next, chatBusy: false, chatLive: '', chatStatus: '', ...(m.result ? { result: m.result } : {}) });
        send({ type: 'chat-save', chat: next }).catch(() => {});
        if (m.answers.length) this.toast(m.answers.length === 1 ? 'התשובה עודכנה גם בלשונית תשובות' : `${m.answers.length} תשובות עודכנו גם בלשונית תשובות`);
      } else if (m.type === 'error') {
        this.store.set({ chatBusy: false, chatLive: '', error: m.message });
      }
    });
    port.onDisconnect.addListener(() => {
      if (this.chatPort !== port) return;
      this.chatPort = null;
      if (this.store.get().chatBusy) this.store.set({ chatBusy: false, chatLive: '' });
    });
    // the answers on screen go along, so "תקצר את תשובה 1" means the answer the student sees as 1
    port.postMessage({ messages: chat, result: s.savedElsewhere ? null : s.result });
    send({ type: 'chat-save', chat }).catch(() => {});
  }

  fillLast() {
    const r = this.store.get().result;
    if (!r) return this.toast('קודם צריך לפתור. Alt Shift A');
    this.actions.fill(r.answers);
  }

  private async fill(answers: Answer[]) {
    const items = answers.filter((a) => a.field_id).map((a) => ({ fieldId: a.field_id!, value: a.answer, option: a.option }));
    if (!items.length) return this.toast('אין שדות למילוי. אפשר להעתיק את התשובות');
    try {
      const outcomes = await send<FillOutcome[]>({ type: 'fill', items });
      const filled = { ...this.store.get().filled };
      for (const o of outcomes) filled[o.fieldId] = { ok: o.ok, message: o.message };
      this.store.set({ filled });
      const ok = outcomes.filter((o) => o.ok).length;
      this.toast(items.length === 1 ? (ok ? 'מולא. תעבור עליו לפני שאתה שולח' : outcomes[0]?.message ?? 'לא הצלחתי למלא') : `מולאו ${ok} מתוך ${items.length} שדות. תעבור עליהם לפני שאתה שולח`);
    } catch (e) {
      this.toast(e instanceof Error ? e.message : 'המילוי נכשל');
    }
  }

  private copy(text: string) {
    navigator.clipboard.writeText(text).then(
      () => this.toast('הועתק'),
      () => this.toast('ההעתקה נכשלה'),
    );
  }

  // ---------- actions for the views ----------
  private makeActions(): Actions {
    const set = (p: Partial<UIState> | ((s: UIState) => Partial<UIState>)) => this.store.set(p);
    return {
      solve: () => this.run('solve'),
      review: () => this.run('review'),
      stop: () => {
        const port = this.port;
        this.port = null;
        port?.disconnect();
        const cur = this.store.get();
        set({ busy: false, view: cur.result ? 'results' : 'idle', status: '' });
        this.toast('העבודה נעצרה');
      },
      showLast: () => set((s) => ({ tab: 'answers', answersMode: s.result ? 'answers' : 'grades', error: null })),
      backToIdle: () => set({ tab: 'board', view: 'idle', error: null }),
      toggleScan: () => set((s) => ({ scanOpen: !s.scanOpen })),
      rescan: () => this.scan(true),
      toggleRow: (i) => set((s) => ({ openRow: s.openRow === i ? -1 : i })),
      fill: (answers) => this.fill(answers),
      replaceWithImproved: (item: ReviewItem) =>
        this.fill([{ question: item.question, part: item.part, answer: item.improved, field_id: item.field_id, option: null }]),
      undo: async () => {
        const n = await send<number>({ type: 'undo' }).catch(() => 0);
        set({ filled: {} });
        this.toast(n ? 'המילוי בוטל' : 'אין מה לבטל');
      },
      copy: (text) => this.copy(text),
      copyAll: () => {
        const r = this.store.get().result;
        if (!r) return;
        const inOrder = orderedRows(r.answers).map((row) => r.answers[row.index]);
        this.copy(inOrder.map((a) => `${a.questionText || [a.question, a.part].filter(Boolean).join(' ')}\n${a.option ? `${a.option}\n` : ''}${a.answer}`).join('\n\n'));
      },
      completeMissing: () => {
        const r = this.store.get().result;
        if (r?.missing?.length) this.run('solve', { onlyFields: r.missing.map((m) => m.field_id) });
      },
      solveAgain: () => this.run('solve', { force: true }),
      openSheet: (sheet: Exclude<Sheet, null>) => set({ sheet }),
      closeSheet: () => set({ sheet: null }),
      saveKey: async (key) => {
        if (!/^sk-ant-/.test(key)) return set({ keyStatus: 'המפתח צריך להתחיל ב-sk-ant-' });
        set({ keyStatus: 'בודק את החיבור' });
        const res = await send<string>({ type: 'test-key', settings: { apiKey: key } }).catch((e) => String(e?.message ?? e));
        if (typeof res === 'string' && res.startsWith('החיבור עובד')) {
          await saveSettings({ apiKey: key });
          set({ hasKey: true, keyStatus: '' });
          this.toast('Claude מחובר');
        } else {
          set({ keyStatus: res || 'לא הצלחתי להתחבר' });
        }
      },
      setSetting: async (patch: Partial<Settings>) => {
        await saveSettings(patch);
        await this.loadSettings();
      },
      openOptions: () => send({ type: 'open-options' }),
      openStoryBar: async () => {
        const label = await send<string | null>({ type: 'open-story' }).catch(() => null);
        if (!label) return this.toast('לא מצאתי כפתור שפותח את הסיפור. אפשר לבחור אותו בדף');
        this.toast(`לחצתי על "${label}"`);
        setTimeout(() => this.scan(), 1200);
      },
      pickStory: () => this.pickStory(),
      exportStructure: () => this.exportStructure(),
      openHistory: async (key) => {
        const r = await send<{ result: SolveResult; at: number; url: string } | null>({ type: 'history-open', key }).catch(() => null);
        if (!r) return this.toast('לא נמצאו תשובות שמורות');
        const elsewhere = r.url.split('#')[0] !== location.href.split('#')[0];
        set({ result: r.result, view: 'results', sheet: null, tab: 'answers', answersMode: 'answers', filter: 'all', savedAt: r.at, savedElsewhere: elsewhere, openRow: -1, filled: {} });
      },
      setTab: (tab: Tab) => {
        set({ tab, sheet: null, error: null, openRow: -1 });
        if (tab === 'history') this.loadHistory();
        if (tab === 'story' && !this.store.get().scan && !this.store.get().scanning) this.scan();
      },
      openAnswers: (mode: AnswersMode) => set({ tab: 'answers', answersMode: mode, sheet: null, filter: 'all', openRow: -1 }),
      setAnswersMode: (mode: AnswersMode) => set({ answersMode: mode, openRow: -1 }),
      setFilter: (filter: Filter) => set({ filter, openRow: -1 }),
      sendChat: (text: string) => this.sendChat(text),
      stopChat: () => {
        const port = this.chatPort;
        this.chatPort = null;
        port?.disconnect();
        const live = this.store.get().chatLive;
        const chat: ChatMessage[] = live ? [...this.store.get().chat, { role: 'assistant', text: `${live}\n(נעצר)` }] : this.store.get().chat;
        set({ chatBusy: false, chatLive: '', chat });
      },
      newChat: () => {
        set({ chat: [], chatLive: '', error: null });
        send({ type: 'chat-save', chat: [] }).catch(() => {});
      },
      deleteHistory: async (key) => {
        const hist = await send<{ tasks: TaskSummary[]; monthCost: number }>({ type: 'history-delete', key }).catch(() => null);
        if (hist) set({ history: hist });
      },
    };
  }

  private async loadHistory() {
    this.store.set({ history: null });
    const hist = await send<{ tasks: TaskSummary[]; monthCost: number }>({ type: 'history-list' }).catch(() => ({ tasks: [], monthCost: 0 }));
    this.store.set({ history: hist });
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
      this.store.set({ sheet: null, tab: 'story' });
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
    const data = await send<object>({ type: 'structure' });
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sab-report-${location.hostname}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    this.toast('דוח האבחון ירד. שלח אותו, והוא יעזור לי לכוון את התוסף לאתר הזה (בלי התשובות שלך)');
  }
}
