import { describe, expect, it } from 'vitest';
import { buildChatContent, chatSystemPrompt } from '../../src/ai/prompt';
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
