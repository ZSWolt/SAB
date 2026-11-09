import { describe, expect, it } from 'vitest';
import { parseAnswers } from '../../src/ai/claude';
import { buildUserText } from '../../src/ai/prompt';

describe('parseAnswers', () => {
  it('accepts a valid payload and drops bad source urls', () => {
    const r = parseAnswers({
      answers: [{ question: '1', part: 'א', answer: 'x', field_id: '0:f1', option: null }],
      sources: [{ title: 'a', url: 'https://gov.il' }, { title: 'b', url: 'javascript:alert(1)' }],
      notes: '',
    });
    expect(r?.answers).toHaveLength(1);
    expect(r?.sources).toHaveLength(1);
  });
  it('rejects a cut-off payload', () => {
    expect(parseAnswers({ answers: [{ question: '1', answer: 'x' }] })).toBeNull();
  });
});

describe('buildUserText', () => {
  it('prefixes field ids with the frame id and includes the story once', () => {
    const snap = { url: 'https://x', title: 't', isTop: true, adapter: 'generic', frameId: 0, fullText: 'שאלה 1',
      fields: [{ id: 'f1', kind: 'textarea' as const, context: 'שאלה 1' }], story: { text: 'סיפור', source: 'hint' } };
    const text = buildUserText([snap, { ...snap, frameId: 3, isTop: false, fields: [] }], [], '', '');
    expect(text).toContain('"0:f1"');
    expect(text.match(/<story/g)).toHaveLength(1);
  });
});
