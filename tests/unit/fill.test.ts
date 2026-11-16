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

import { describeFields as describeTable, findFieldGroups as groupsForTable } from '../../src/content/extract/fields';
import { fillFields as fillTableFields } from '../../src/content/fill';

describe('a table inside an editor', () => {
  it('is read as a table question and filled cell by cell', () => {
    document.body.innerHTML = `<p>השלימו את הטבלה</p><div contenteditable="true"><table>
      <tr><th>מאפיין</th><th>הדגמה</th></tr><tr><td>דמות חונך</td><td></td></tr><tr><td>מסע פיזי</td><td></td></tr></table></div>`;
    const groups = groupsForTable();
    const [f] = describeTable(groups);
    expect(f.kind).toBe('richtext');
    expect(f.table?.rows).toEqual([['מאפיין', 'הדגמה'], ['דמות חונך', ''], ['מסע פיזי', '']]);
    expect(f.value).toBeUndefined(); // empty cells: not answered yet
    const [res] = fillTableFields([{ fieldId: groups[0].id, value: '', option: null, cells: [{ row: 1, col: 1, text: 'הסבא' }, { row: 2, col: 1, text: 'הנסיעה' }] }]);
    expect(res.ok).toBe(true);
    const rows = [...document.querySelectorAll('tr')].map((tr) => [...tr.cells].map((c) => c.textContent));
    expect(rows).toEqual([['מאפיין', 'הדגמה'], ['דמות חונך', 'הסבא'], ['מסע פיזי', 'הנסיעה']]);
  });
});

import { cleanFillText } from '../../src/content/fill';

describe('clean text on the page', () => {
  it('one line break between parts, never an empty line', () => {
    expect(cleanFillText('החלק הראשון.\n\nהחלק השני.')).toBe('החלק הראשון.\nהחלק השני.');
    expect(cleanFillText('א  \n \n\n ב')).toBe('א\nב');
  });
  it('plain Hebrew letters and no invisible marks', () => {
    expect(cleanFillText('כּמו ‏כי​')).toBe('כּמו כי'.normalize('NFC'));
    expect(cleanFillText('כמו שכתוב "אחים שלנו"')).toBe('כמו שכתוב "אחים שלנו"');
  });
  it('fills a rich editor without an empty line between the parts', () => {
    document.body.innerHTML = `<p>תארו ונמקו</p><div contenteditable="true"></div>`;
    const [f] = extractFrame().fields;
    fillFields([{ fieldId: f.id, value: 'תשובה לחלק א.\n\nתשובה לחלק ב.', option: null }]);
    const ed = document.querySelector('[contenteditable]')!;
    expect(ed.querySelectorAll('br').length).toBeLessThanOrEqual(1);
    expect(ed.textContent).toBe('תשובה לחלק א.תשובה לחלק ב.');
  });
});
