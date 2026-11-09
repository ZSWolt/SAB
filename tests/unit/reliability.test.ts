import { afterEach, describe, expect, it } from 'vitest';
import { enrich, questionLine } from '../../src/background/coverage';
import { extractFrame } from '../../src/content/extract';
import { badgeValue } from '../../src/content/extract/choices';
import { goToPage, onWalkProgress, waitVisible, withLock, type WalkProgress } from '../../src/content/extract/pages';
import { systemPrompt } from '../../src/ai/prompt';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import { createStore, resolveTheme, upsertStep } from '../../src/content/ui/store';
import type { TaggedSnapshot } from '../../src/shared/types';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  setVisibility('visible');
  onWalkProgress(null);
  document.body.innerHTML = '';
});

describe('waiting for the tab', () => {
  it('resolves right away when visible, and waits while hidden', async () => {
    await waitVisible();
    setVisibility('hidden');
    let waited = false;
    let done = false;
    const p = waitVisible(document, () => (waited = true)).then(() => (done = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(waited).toBe(true);
    expect(done).toBe(false);
    setVisibility('visible');
    await p;
    expect(done).toBe(true);
  });

  it("doesn't click a page while the tab is hidden, and reports the pause", async () => {
    document.body.innerHTML = `<div class="pager"><span class="active">1</span><span>2</span><span>3</span></div>`;
    let clicked = 0;
    document.querySelectorAll('.pager span')[1].addEventListener('click', () => clicked++);
    const reports: WalkProgress[] = [];
    onWalkProgress((p) => reports.push(p));
    setVisibility('hidden');
    const p = goToPage(2);
    await new Promise((r) => setTimeout(r, 30));
    expect(clicked).toBe(0);
    expect(reports.at(-1)).toMatchObject({ page: 2, total: 3, waiting: true });
    setVisibility('visible');
    await p;
    expect(clicked).toBe(1);
    expect(reports.at(-1)).toMatchObject({ page: 2, waiting: false });
  });
});

describe('one page walk at a time', () => {
  it('runs locked jobs one after the other', async () => {
    const log: string[] = [];
    const job = (name: string, ms: number) => withLock(async () => {
      log.push(`${name} start`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`${name} end`);
    });
    await Promise.all([job('read', 30), job('scan', 5)]);
    expect(log).toEqual(['read start', 'read end', 'scan start', 'scan end']);
  });

  it('keeps going after a job fails', async () => {
    await withLock(async () => { throw new Error('x'); }).catch(() => {});
    expect(await withLock(async () => 'ok')).toBe('ok');
  });
});

describe('more questions found', () => {
  it('reads option boxes lettered א ב ג', () => {
    expect(badgeValue('א')).toBe(1);
    expect(badgeValue('ג.')).toBe(3);
    expect(badgeValue('b)')).toBe(2);
    expect(badgeValue('01')).toBeNull();
    document.body.innerHTML = `
      <div><p>מי כתב את הסיפור?</p>
        <div class="opts">${['ביאליק', 'עגנון', 'טרומן קפוטה'].map((o, i) => `<div class="o"><b>${'אבג'[i]}.</b> <span>${o}</span></div>`).join('')}</div>
      </div>`;
    const [f] = extractFrame().fields;
    expect(f).toMatchObject({ kind: 'radio', options: ['ביאליק', 'עגנון', 'טרומן קפוטה'] });
  });

  it('finds fields inside web components (open shadow DOM)', () => {
    const host = document.createElement('div');
    document.body.innerHTML = '<p>שאלה 1: הסבר את המושג דמוקרטיה</p>';
    document.body.append(host);
    host.attachShadow({ mode: 'open' }).innerHTML = '<label>תשובה <textarea></textarea></label>';
    expect(extractFrame().fields.map((f) => f.kind)).toEqual(['textarea']);
  });

  it('never reads its own panel', () => {
    const host = document.createElement('div');
    host.id = 'sab-helper-host';
    document.body.append(host);
    host.attachShadow({ mode: 'open' }).innerHTML = '<textarea></textarea><input type="checkbox">';
    expect(extractFrame().fields).toHaveLength(0);
  });

  it('counts question signs so a missing field can be noticed', () => {
    document.body.innerHTML = `
      <div><p>שאלה 1</p><button>Send Check</button></div>
      <div><p>שאלה 2</p><button>Send Check</button></div>
      <div><p>שאלה 3</p><button>Send Check</button></div>`;
    expect(extractFrame().questionMarkers).toBe(3);
  });
});

describe('question text on answers and reviews', () => {
  const snap = {
    frameId: 0, url: '', title: '', isTop: true, adapter: '', fullText: '', videos: [], documents: [],
    fields: [{ id: 'p2.0', kind: 'textarea', context: 'שאלה 4\nדמותה של סוק: מה אפשר ללמוד עליה?\nעוד טקסט', value: 'היא נחמדה', page: 2 }],
  } as unknown as TaggedSnapshot;

  it('takes the question line, joining a short "שאלה 4" line with the next one', () => {
    expect(questionLine('שאלה 4\nדמותה של סוק: מה אפשר ללמוד עליה?')).toBe('שאלה 4 דמותה של סוק: מה אפשר ללמוד עליה?');
  });

  it('adds questionText, page and the student answer by field id', () => {
    const [r] = enrich([{ field_id: '0:p2.0', grade: 60 }], [snap], true);
    expect(r).toMatchObject({ questionText: expect.stringContaining('דמותה של סוק'), page: 2, studentAnswer: 'היא נחמדה' });
    const [x] = enrich([{ field_id: null }], [snap]);
    expect(x).toEqual({ field_id: null });
  });
});

describe('shorter answers', () => {
  it('asks for the shortest answer that still covers every part', () => {
    const p = systemPrompt(DEFAULT_SETTINGS);
    expect(p).toContain('הקצרה ביותר שעדיין עונה על **כל** חלקי השאלה');
    expect(p).toContain('נימוק של משפט אחד');
  });
});

describe('panel store', () => {
  it('keeps steps in a fixed order and replaces by id', () => {
    let steps = upsertStep([], { id: 'write', state: 'wait', label: 'כותב' });
    steps = upsertStep(steps, { id: 'pages', state: 'run', label: 'עמוד 1 מתוך 3' });
    steps = upsertStep(steps, { id: 'pages', state: 'pause', label: 'עמוד 2 מתוך 3' });
    expect(steps.map((s) => `${s.id}:${s.state}`)).toEqual(['pages:pause', 'write:wait']);
  });

  it('notifies subscribers and resolves the auto theme', () => {
    const store = createStore();
    const seen: string[] = [];
    store.subscribe((s) => seen.push(s.view));
    store.set({ view: 'working' });
    store.set((s) => ({ view: s.view === 'working' ? 'results' : 'idle' }));
    expect(seen).toEqual(['working', 'results']);
    expect(resolveTheme('auto', true)).toBe('focus');
    expect(resolveTheme('auto', false)).toBe('notebook');
    expect(resolveTheme('school', true)).toBe('school');
  });
});
