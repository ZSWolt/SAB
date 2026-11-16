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
      'answer:3:שאלה 1', // page 2 restarts at 1: the task's own number, the page shows next to it
      'answer:4:#6', // no number in the task: no made-up number; stays after the row before it (page 2)
    ]);
    expect(questionNumber('ב׳')).toBe(2);
    expect(questionNumber('שאלה ד')).toBe(4);
    expect(questionNumber('הסבר')).toBeUndefined();
    // a page heading or a date is not a question number
    expect(questionNumber('עמוד 3 - היתה או לא היתה הצבעה - מה העמדה שלי')).toBeUndefined();
    expect(questionNumber('15.5.1948 הבריטים עוזבים')).toBeUndefined();
    expect(questionNumber('4. מה הייתה הטענה?')).toBe(4);
  });

  it('labels use the number written in the task, also when only some questions are answered', () => {
    const rows = orderedRows([
      { question: 'שאלה 4', part: '', page: 2 },
      { question: 'עמוד 3 - מה העמדה שלי', part: '', page: 3, questionText: 'שאלה 7: מה העמדה שלך?' },
      { question: 'שאלה 2', part: '', page: 2, questionText: 'שאלה 2 (10 נקודות)' },
      { question: 'שאלה 2', part: '', page: 3 },
    ]);
    expect(rows.map((r) => r.label)).toEqual(['שאלה 2', 'שאלה 4', 'שאלה 2 (עמוד 3)', 'שאלה 7']);
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

import { buildPageText } from '../../src/ai/prompt';
import { wantsOnlyEmpty } from '../../src/content/ui/panel';

describe('the chat answers questions', () => {
  it('a question gets an answer in words; only an explicit request changes answers', () => {
    const p = chatSystemPrompt(DEFAULT_SETTINGS);
    expect(p).toContain('שאלה מקבלת תשובה במילים, בלי לשנות שום תשובה');
    expect(p).toContain('update_answers **רק** כשהתלמיד מבקש במפורש');
  });
  it('sends what the student wrote in the fields', () => {
    const s2 = { ...snap, fields: [{ id: 'f1', kind: 'textarea', context: 'שאלה 1: מי?', value: 'כמו שכתוב "אחים שלנו"' }] } as unknown as TaggedSnapshot;
    const [first] = buildChatContent({ snaps: [s2], stories: [], result, previousPages: '' }, [{ role: 'user', text: 'התשובה שלי כוללת ציטוטים?' }]);
    const text = (first.content as { text?: string }[]).map((c) => c.text ?? '').join('\n');
    expect(text).toContain('<student_wrote');
    expect(text).toContain('כמו שכתוב "אחים שלנו"');
  });
});

describe('fixed instructions from the settings', () => {
  it('lead the chat instructions and apply to every chat reply', () => {
    const p = chatSystemPrompt({ ...DEFAULT_SETTINGS, extraInstructions: 'תמיד תענה באנגלית' });
    expect(p).toContain('תמיד תענה באנגלית');
    expect(p.indexOf('תמיד תענה באנגלית')).toBeLessThan(p.indexOf('## איך לענות בשיחה'));
    expect(p).toContain('בכל הודעה שאתה כותב בשיחה');
    expect(chatSystemPrompt(DEFAULT_SETTINGS)).not.toContain('הוראות קבועות של התלמיד');
  });
});

describe('the student note comes first', () => {
  const base = { mode: 'solve' as const, snaps: [snap], opener: [], stories: [], pdfs: [], videos: [], missingVideos: [], previousPages: '' };
  it('a note replaces "answer every question" with "do what the note says"', () => {
    const text = buildPageText({ ...base, note: 'רק שאלה 3' });
    expect(text).toContain('<student_note>\nרק שאלה 3');
    expect(text).toContain('תעשה בדיוק מה שכתוב ב-student_note');
    expect(text.trim().endsWith('תענה על כל השאלות והסעיפים שבמשימה, ואז תקרא ל-submit_answers.')).toBe(false);
  });
  it('"only empty" asks for the listed fields only', () => {
    const text = buildPageText({ ...base, note: '', onlyFields: ['0:f1'], onlyReason: 'empty' });
    expect(text).toContain('התלמיד כבר ענה בעצמו על שאר השאלות');
  });
  it('recognizes "only what I didn\'t answer" in the note', () => {
    expect(wantsOnlyEmpty('תענה רק על השאלות שלא עניתי עליהם')).toBe(true);
    expect(wantsOnlyEmpty('רק על הריקות')).toBe(true);
    expect(wantsOnlyEmpty('תענה באנגלית')).toBe(false);
  });
});
