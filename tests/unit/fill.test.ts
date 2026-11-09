import { beforeEach, describe, expect, it } from 'vitest';
import { extractFrame } from '../../src/content/extract';
import { fillFields, matchScore, undoFill } from '../../src/content/fill';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('fill', () => {
  it('fills a textarea and fires input events (React-style)', () => {
    document.body.innerHTML = `<p>שאלה</p><textarea id="t"></textarea>`;
    const [f] = extractFrame().fields;
    const ta = document.getElementById('t') as HTMLTextAreaElement;
    let events = 0;
    ta.addEventListener('input', () => events++);
    const [res] = fillFields([{ fieldId: f.id, value: 'תשובה', option: null }]);
    expect(res.ok).toBe(true);
    expect(ta.value).toBe('תשובה');
    expect(events).toBeGreaterThan(0);
    undoFill();
    expect(ta.value).toBe('');
  });

  it('picks the matching radio option', () => {
    document.body.innerHTML = `<fieldset><legend>מתי?</legend>
      <label><input type="radio" name="q" id="a"> א. 1945</label>
      <label><input type="radio" name="q" id="b"> ב. 1948</label></fieldset>`;
    const [f] = extractFrame().fields;
    const [res] = fillFields([{ fieldId: f.id, value: 'הסבר', option: '1948' }]);
    expect(res.ok).toBe(true);
    expect((document.getElementById('b') as HTMLInputElement).checked).toBe(true);
  });

  it('clicks role=radio options (Google Forms)', () => {
    document.body.innerHTML = `<div role="listitem"><div role="heading">מי?</div><div role="radiogroup">
      <div role="radio" id="r1" aria-label="עגנון" aria-checked="false"></div>
      <div role="radio" id="r2" aria-label="ביאליק" aria-checked="false"></div></div></div>`;
    document.getElementById('r2')!.addEventListener('click', (e) => (e.currentTarget as Element).setAttribute('aria-checked', 'true'));
    const [f] = extractFrame().fields;
    fillFields([{ fieldId: f.id, value: '', option: 'ביאליק' }]);
    expect(document.getElementById('r2')!.getAttribute('aria-checked')).toBe('true');
  });

  it('reports a missing field instead of throwing', () => {
    expect(fillFields([{ fieldId: 'nope', value: 'x', option: null }])[0].ok).toBe(false);
  });

  it('matches option text loosely', () => {
    expect(matchScore('ב. 1948', '1948')).toBeGreaterThan(0.9);
    expect(matchScore('חיים נחמן ביאליק', 'ביאליק')).toBeGreaterThan(0.45);
    expect(matchScore('1945', '1948')).toBeLessThan(0.45);
  });
});
