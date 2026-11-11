import { describe, expect, it } from 'vitest';
import { buildChatContent, chatSystemPrompt } from '../../src/ai/prompt';
import { answerLabels, missingLabels, orderedRows, questionNumber } from '../../src/shared/labels';
import { filterCounts } from '../../src/content/ui/views/board';
import { initialState } from '../../src/content/ui/store';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import type { SolveResult, TaggedSnapshot } from '../../src/shared/types';

const snap = {
  frameId: 0, url: 'https://x', title: 't', isTop: true, adapter: 'generic', fullText: 'שאלה 1: מי?', videos: [], documents: [],
  fields: [{ id: 'f1', kind: 'textarea', context: 'שאלה 1: מי?' }],
} as unknown as TaggedSnapshot;

const result: SolveResult = {
  answers: [
    { question: '1', part: '', answer: 'א', field_id: '0:f1', option: null, questionText: 'שאלה 1: מי?' },
    { question: '2', part: '', answer: 'ב', field_id: '0:f2', option: null },
    { question: '3', part: '', answer: 'ג', field_id: null, option: null },
  ],
  missing: [{ field_id: '0:f9', context: 'שאלה 9' }],
  sources: [], notes: '', model: 'm', searches: [], videos: [], costUsd: 0.01,
};

describe('dashboard filter counts', () => {
  it('counts all, missing, not filled and filled', () => {
    const s = { ...initialState(), filled: { '0:f1': { ok: true } } };
    expect(filterCounts(result, s)).toEqual({ all: 4, missing: 1, unfilled: 1, filled: 1 });
  });
});

describe('chat content', () => {
  it('numbers the current answers like the answers tab, and missing ones after them', () => {
    const [first] = buildChatContent({ snaps: [snap], stories: [], result, previousPages: '' }, [{ role: 'user', text: 'תקצר את תשובה 2' }]);
    const text = (first.content as { text?: string }[]).map((c) => c.text ?? '').join('\n');
    const cur = JSON.parse(text.match(/<current_answers[^>]*>\n([\s\S]*?)\n<\/current_answers>/)![1]);
    expect(cur.map((a: { label: string }) => a.label)).toEqual(['שאלה 1', 'שאלה 2', 'שאלה 3']);
    expect(cur[1]).toMatchObject({ field_id: '0:f2', question: '2', answer: 'ב' });
    expect(text).toContain('שאלה 9 (field_id 0:f9)');
    expect(chatSystemPrompt(DEFAULT_SETTINGS)).toContain('label');
  });

  it('orders the answers tab by page, question number and part, with missing questions in place', () => {
    const rows = orderedRows(
      [
        { question: 'שאלה 3', part: '' },
        { question: 'שאלה 1', part: 'ב' },
        { question: 'שאלה 1', part: 'א' },
        { question: 'שאלה 1', part: '', page: 2 },
        { question: '', part: '' },
      ],
      [{ field_id: '0:f2', context: 'שאלה 2: מי כתב?' }],
    );
    expect(rows.map((r) => `${r.kind}:${r.index}:${r.label}`)).toEqual([
      'answer:2:שאלה 1 · א',
      'answer:1:שאלה 1 · ב',
      'missing:0:שאלה 2',
      'answer:0:שאלה 3',
      'answer:3:שאלה 5', // page 2 restarts at 1 → gets its place instead of a repeated label
      'answer:4:שאלה 6', // no number: stays right after the row before it (on page 2)
    ]);
    expect(questionNumber('ב׳')).toBe(2);
    expect(questionNumber('שאלה ד')).toBe(4);
    expect(questionNumber('הסבר')).toBeUndefined();
  });

  it('never gives two answers the same number', () => {
    expect(answerLabels([{ question: 'שאלה 1', part: '' }, { question: 'שאלה 2', part: '' }, { question: 'שאלה 1', part: '' }])).toEqual(['שאלה 1', 'שאלה 2', 'שאלה 3']);
    expect(answerLabels([{ question: '1', part: 'א' }, { question: '1', part: 'ב' }])).toEqual(['שאלה 1 · א', 'שאלה 1 · ב']);
    expect(missingLabels(['שאלה 1', 'שאלה 2', 'שאלה 4'], 2)).toEqual(['שאלה 5', 'שאלה 6']);
  });

  it('puts the page context first, cached, then the turns in order', () => {
    const msgs = buildChatContent({ snaps: [snap], stories: [{ title: 'סיפור', text: 'היה היה' }], result, previousPages: '' }, [
      { role: 'user', text: 'תקצר את תשובה 1' },
      { role: 'assistant', text: 'קיצרתי' },
      { role: 'user', text: 'באנגלית' },
    ]);
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    const first = msgs[0].content as { type: string; text: string; cache_control?: object }[];
    expect(first[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(first[0].text).toContain('<story');
    expect(first[0].text).toContain('"0:f1"');
    expect(first[0].text).toContain('<missing');
    expect(first[1].text).toBe('תקצר את תשובה 1');
    expect(msgs[2].content).toBe('באנגלית');
  });

  it('lists the fields before solving, and drops a leading assistant turn', () => {
    const msgs = buildChatContent({ snaps: [snap], stories: [], result: null, previousPages: '' }, [
      { role: 'assistant', text: 'שלום' },
      { role: 'user', text: 'על מה הסיפור?' },
    ]);
    expect(msgs).toHaveLength(1);
    const ctx = (msgs[0].content as { text: string }[])[0].text;
    expect(ctx).toContain('<fields>');
    expect(ctx).toContain('עוד לא נפתרה');
  });

  it('chat prompt keeps the writing rules and explains update_answers', () => {
    const p = chatSystemPrompt({ ...DEFAULT_SETTINGS, styleSample: 'ככה אני כותב' });
    expect(p).toContain('update_answers');
    expect(p).toContain('מעט סימני פיסוק');
    expect(p).toContain('ככה אני כותב');
  });
});

describe('defaults', () => {
  it('the dashboard look (school) is the default theme', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('school');
  });
});
