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
