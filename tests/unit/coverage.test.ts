import { describe, expect, it } from 'vitest';
import { attachOrphans, checkCoverage, textQuestionNumbers } from '../../src/background/coverage';
import type { SolveResult, TaggedSnapshot } from '../../src/shared/types';

const result = (answers: SolveResult['answers'], extra: Partial<SolveResult> = {}): SolveResult => ({ answers, sources: [], notes: '', model: 'm', searches: [], videos: [], costUsd: 0, ...extra });
const snap = (fields: TaggedSnapshot['fields'], fullText = ''): TaggedSnapshot =>
  ({ url: 'u', title: 't', isTop: true, adapter: 'g', frameId: 0, fullText, videos: [], documents: [], fields });

const s = snap([
  { id: 'a', kind: 'textarea', context: 'שאלה 1: מי הגיבור?' },
  { id: 'b', kind: 'radio', context: 'שאלה 2: מי כתב את הסיפור?', options: ['ביאליק', 'עגנון'] },
  { id: 'c', kind: 'textarea', context: 'שאלה 3: תאר את הסבא של יואב ואת היחסים ביניהם' },
  { id: 'n', kind: 'text', context: 'שם התלמיד' },
]);

describe('answers written without their field', () => {
  it('go to the field of their question (by number or by the question words)', () => {
    const out = attachOrphans(
      [
        { question: 'שאלה 1', part: '', answer: 'יואב', field_id: null, option: null },
        { question: 'שאלה 2', part: '', answer: 'כי', field_id: '0:zzz', option: 'עגנון' }, // made-up id
        { question: 'תאר את הסבא של יואב', part: '', answer: 'חם', field_id: null, option: null, questionText: 'תאר את הסבא של יואב ואת היחסים' },
      ],
      [s],
    );
    expect(out.map((a) => a.field_id)).toEqual(['0:a', '0:b', '0:c']);
  });

  it('a choice answer only joins a field that has that option, and a field is used once', () => {
    const out = attachOrphans(
      [
        { question: 'שאלה 2', part: '', answer: '', field_id: null, option: 'טשרניחובסקי' },
        { question: 'שאלה 1', part: '', answer: 'x', field_id: '0:a', option: null },
        { question: 'שאלה 1', part: '', answer: 'y', field_id: null, option: null },
      ],
      [s],
    );
    expect(out.map((a) => a.field_id)).toEqual([null, '0:a', null]);
  });
});

describe('coverage', () => {
  it('fields Claude skipped as not questions are not missing', () => {
    const r = result([{ question: 'שאלה 1', part: '', answer: 'x', field_id: '0:a', option: null }], {
      skipped: [{ field_id: '0:c', reason: 'דוגמה' }],
    });
    expect(checkCoverage([s], r).missing.map((m) => m.field_id)).toEqual(['0:b']); // "שם התלמיד" is not a question either
  });

  it('"שאלה N" headings in the text without an answer', () => {
    const page = snap([], 'הוראות: קראו.\nשאלה 4 (32 נקודות)\nמי תמך?\nכמו בשאלה 5 שראיתם\n=== עמוד 2 === שאלה 6\nבחרו');
    expect(textQuestionNumbers([page])).toEqual([4, 6]);
    const r = result([{ question: 'שאלה 4', part: '', answer: 'x', field_id: null, option: null }]);
    expect(checkCoverage([page], r).missingText).toEqual([6]);
  });
});

import { checkMap, mergeResults } from '../../src/background/coverage';
import type { TaskMapItem } from '../../src/shared/types';

const map: TaskMapItem[] = [
  { id: 'q1', number: 'שאלה 1', page: null, kind: 'question', text: 'תארו ובססו', parts: [{ label: 'א', asks: 'לתאר' }, { label: 'ב', asks: 'לבסס על ציטוטים' }], field_ids: ['0:a', '0:b'], belongs_to: null },
  { id: 'h1', number: null, page: null, kind: 'helper', text: 'היעזרו בשאלות המנחות', parts: [], field_ids: ['0:h'], belongs_to: 'q1' },
];

describe('the task map', () => {
  it('drops answers to helper prompts and finds the parts left without an answer', () => {
    const r = result(
      [
        { item: 'q1', question: 'שאלה 1', part: 'א', answer: 'תיאור', field_id: '0:a', option: null },
        { item: 'h1', question: 'עזר', part: '', answer: 'לא צריך', field_id: '0:h', option: null },
      ],
      { taskMap: map },
    );
    const out = checkMap(r);
    expect(out.answers.map((a) => a.item)).toEqual(['q1']);
    expect(out.skipped?.map((s) => s.field_id)).toEqual(['0:h']);
    expect(out.missingParts?.map((p) => p.label)).toEqual(['ב']);
  });

  it('all parts answered (also several parts in one answer): nothing missing', () => {
    expect(checkMap(result([{ item: 'q1', question: '1', part: 'א, ב', answer: 'x', field_id: null, option: null }], { taskMap: map })).missingParts).toEqual([]);
    expect(checkMap(result([{ item: 'q1', question: '1', part: '', answer: 'x', field_id: null, option: null }], { taskMap: map })).missingParts).toEqual([]);
  });

  it('a completed part replaces by question + part, not added twice', () => {
    const prev = result([{ item: 'q1', question: '1', part: 'ב', answer: 'ישן', field_id: null, option: null }], { taskMap: map });
    const next = result([{ item: 'q1', question: '1', part: 'ב', answer: 'חדש', field_id: null, option: null }]);
    expect(mergeResults(prev, next).answers.map((a) => a.answer)).toEqual(['חדש']);
  });
});
