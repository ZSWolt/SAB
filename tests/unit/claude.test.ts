import { describe, expect, it } from 'vitest';
import { parseAnswers, parseReview } from '../../src/ai/claude';
import { buildContent, collectStories, reviewSystemPrompt, systemPrompt, type PromptInput } from '../../src/ai/prompt';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import type { TaggedSnapshot } from '../../src/shared/types';

const snap: TaggedSnapshot = {
  url: 'https://x', title: 't', isTop: true, adapter: 'generic', frameId: 0, fullText: 'שאלה 1', videos: [], documents: [],
  fields: [{ id: 'f1', kind: 'textarea', context: 'שאלה 1' }, { id: 'f2', kind: 'text', context: 'שאלה 2', value: 'מה שכתבתי' }],
  story: { text: 'סיפור', source: 'hint' },
};
const base: PromptInput = {
  mode: 'solve', snaps: [snap], opener: [], note: '', stories: collectStories([snap, { ...snap, frameId: 3, isTop: false }], [], ''),
  pdfs: [], videos: [], missingVideos: [], previousPages: '',
};
const texts = (c: ReturnType<typeof buildContent>) => c.map((b) => (b.type === 'text' ? b.text : '')).join('\n');

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

describe('parseReview', () => {
  it('clamps grades and validates items', () => {
    const r = parseReview({
      items: [{ question: '1', part: '', field_id: '0:f2', grade: 140, correct: 'a', missing: '', improved: 'b' }],
      overall: 'טוב',
      sources: [],
    });
    expect(r?.items[0].grade).toBe(100);
    expect(parseReview({ items: [{ question: '1' }], overall: '' })).toBeNull();
  });
});

describe('buildContent', () => {
  it('prefixes field ids with the frame id and includes the story once', () => {
    const text = texts(buildContent(base));
    expect(text).toContain('"0:f1"');
    expect(text.match(/<story/g)).toHaveLength(1);
  });

  it('puts the story first with cache_control, page text last without it', () => {
    const c = buildContent(base);
    expect((c[0] as any).cache_control).toEqual({ type: 'ephemeral' });
    expect(c[0].type === 'text' && c[0].text).toContain('<story');
    expect((c.at(-1) as any).cache_control).toBeUndefined();
  });

  it('sends PDFs as document blocks before the story', () => {
    const c = buildContent({ ...base, pdfs: [{ title: 'הסיפור.pdf', base64: 'JVBERi0=' }] });
    expect(c[0]).toMatchObject({ type: 'document', source: { media_type: 'application/pdf', data: 'JVBERi0=' }, title: 'הסיפור.pdf' });
    expect((c[0] as any).cache_control).toBeUndefined();
    expect((c[1] as any).cache_control).toEqual({ type: 'ephemeral' });
  });

  it('asks only for the listed fields when completing missing ones', () => {
    const text = texts(buildContent({ ...base, onlyFields: ['0:f2'] }));
    expect(text).toContain('"0:f2"');
    expect(text).not.toContain('"0:f1"');
    expect(text).toContain('רק');
  });

  it('includes earlier pages and review instructions', () => {
    expect(texts(buildContent({ ...base, previousPages: 'שאלה 1: תשובה' }))).toContain('<previous_pages');
    expect(texts(buildContent({ ...base, mode: 'review' }))).toContain('submit_review');
  });
});

describe('system prompts', () => {
  it('adds the style sample only when set', () => {
    expect(systemPrompt(DEFAULT_SETTINGS)).not.toContain('<style_sample>');
    const s = { ...DEFAULT_SETTINGS, styleSample: 'אני כותב ככה, בקצרה.' };
    expect(systemPrompt(s)).toContain('אני כותב ככה, בקצרה.');
    expect(reviewSystemPrompt(s)).toContain('<style_sample>');
  });
});
