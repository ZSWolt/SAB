import { describe, expect, it } from 'vitest';
import { checkCoverage, mergeResults } from '../../src/background/coverage';
import { fieldsHash, previousPagesSummary, taskKey, type TaskRecord } from '../../src/background/tasks';
import type { SolveResult, TaggedSnapshot } from '../../src/shared/types';

const result = (answers: SolveResult['answers']): SolveResult => ({ answers, sources: [], notes: '', model: 'm', searches: [], videos: [], costUsd: 0.1 });
const snap = (fields: TaggedSnapshot['fields']): TaggedSnapshot =>
  ({ url: 'u', title: 't', isTop: true, adapter: 'g', frameId: 0, fullText: '', videos: [], documents: [], fields });

describe('taskKey', () => {
  it('groups pages of the same assignment', () => {
    expect(taskKey('https://docs.google.com/forms/d/e/1FAIpQLSabc/viewform?pageHistory=0,1')).toBe(
      taskKey('https://docs.google.com/forms/d/e/1FAIpQLSabc/formResponse'),
    );
    expect(taskKey('https://moodle.school.il/mod/quiz/attempt.php?attempt=55&page=2')).toBe(
      taskKey('https://moodle.school.il/mod/quiz/attempt.php?attempt=55&page=3'),
    );
    expect(taskKey('https://site.com/task/1?x=1')).toBe('https://site.com/task/1');
  });
});

describe('fieldsHash', () => {
  it('is stable for the same questions and changes for different ones', () => {
    const a = [snap([{ id: 'f1', kind: 'text', context: 'שאלה 1' }])];
    expect(fieldsHash(a)).toBe(fieldsHash([snap([{ id: 'f9', kind: 'text', context: 'שאלה  1', value: 'x' }])]));
    expect(fieldsHash(a)).not.toBe(fieldsHash([snap([{ id: 'f1', kind: 'text', context: 'שאלה 2' }])]));
    expect(fieldsHash([snap([])])).toBe('');
  });
});

describe('coverage', () => {
  const s = snap([{ id: 'f1', kind: 'text', context: 'א' }, { id: 'f2', kind: 'text', context: 'ב' }, { id: 'f3', kind: 'text', context: 'ג' }]);
  it('finds missing and duplicate answers', () => {
    const r = result([
      { question: '1', part: '', answer: 'x', field_id: '0:f1', option: null },
      { question: '2', part: '', answer: 'y', field_id: '0:f1', option: null },
      { question: '3', part: '', answer: 'z', field_id: '0:f3', option: null },
    ]);
    const c = checkCoverage([s], r);
    expect(c.missing.map((m) => m.field_id)).toEqual(['0:f2']);
    expect(c.duplicates).toEqual(['0:f1']);
  });
  it('merges completed answers into the previous result', () => {
    const prev = result([{ question: '1', part: '', answer: 'x', field_id: '0:f1', option: null }]);
    const next = result([{ question: '2', part: '', answer: 'y', field_id: '0:f2', option: null }]);
    const m = mergeResults(prev, next);
    expect(m.answers.map((a) => a.field_id)).toEqual(['0:f1', '0:f2']);
    expect(m.costUsd).toBeCloseTo(0.2);
  });
});

describe('previousPagesSummary', () => {
  it('lists answers from other pages only', () => {
    const task = {
      pages: [
        { fieldsHash: 'a', result: result([{ question: 'שאלה 1', part: '', answer: 'ראשון', field_id: null, option: null }]) },
        { fieldsHash: 'b', result: result([{ question: 'שאלה 2', part: '', answer: 'שני', field_id: null, option: null }]) },
      ],
    } as unknown as TaskRecord;
    const s = previousPagesSummary(task, 'b');
    expect(s).toContain('ראשון');
    expect(s).not.toContain('שני');
  });
});
