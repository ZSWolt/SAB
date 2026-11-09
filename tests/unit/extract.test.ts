import { beforeEach, describe, expect, it } from 'vitest';
import { extractFrame } from '../../src/content/extract';

const LONG = 'זהו קטע מתוך הסיפור. '.repeat(120);

function page(html: string) {
  document.body.innerHTML = html;
}

beforeEach(() => {
  document.body.innerHTML = '';
  (window as any).__sabCounter = 0;
});

describe('generic reader', () => {
  it('finds text fields with their question text, and every part', () => {
    page(`
      <h2>שאלה 1</h2>
      <p>הסבר מהי דמוקרטיה ותן דוגמה.</p>
      <textarea></textarea>
      <h2>שאלה 2</h2>
      <div><p>א. מי היה ראש הממשלה הראשון?</p><input type="text"></div>
      <div><p>ב. באיזו שנה הוקמה המדינה?</p><input type="text"></div>
    `);
    const snap = extractFrame();
    expect(snap.fields).toHaveLength(3);
    expect(snap.fields[0].kind).toBe('textarea');
    expect(snap.fields[0].context).toContain('דמוקרטיה');
    expect(snap.fields[1].context).toContain('ראש הממשלה');
    expect(snap.fields[2].context).toContain('באיזו שנה');
    expect(snap.fullText).toContain('שאלה 2');
  });

  it('groups radio buttons and reads their labels', () => {
    page(`
      <fieldset><legend>מתי הוקמה המדינה?</legend>
        <label><input type="radio" name="q1" value="a"> 1945</label>
        <label><input type="radio" name="q1" value="b"> 1948</label>
        <label><input type="radio" name="q1" value="c"> 1967</label>
      </fieldset>`);
    const [f] = extractFrame().fields;
    expect(f.kind).toBe('radio');
    expect(f.options).toEqual(['1945', '1948', '1967']);
    expect(f.context).toContain('מתי הוקמה');
  });

  it('ignores the site search box and hidden inputs', () => {
    page(`<div role="search"><input type="text"></div><input type="hidden"><input type="text" style="display:none"><textarea></textarea>`);
    expect(extractFrame().fields).toHaveLength(1);
  });

  it('keeps ids stable between reads', () => {
    page(`<p>שאלה</p><textarea></textarea>`);
    const a = extractFrame().fields[0].id;
    const b = extractFrame().fields[0].id;
    expect(a).toBe(b);
  });
});

describe('google forms', () => {
  it('uses the list item as the question and reads role=radio options', () => {
    page(`
      <div role="list">
        <div role="listitem"><div role="heading">מי כתב את "הכלה ומצוד הפרפרים"?</div>
          <div role="radiogroup">
            <div role="radio" aria-label="ש&quot;י עגנון" aria-checked="false"></div>
            <div role="radio" aria-label="חיים נחמן ביאליק" aria-checked="false"></div>
          </div>
        </div>
        <div role="listitem"><div role="heading">נמק את תשובתך</div><textarea></textarea></div>
      </div>`);
    const snap = extractFrame();
    expect(snap.fields).toHaveLength(2);
    expect(snap.fields[0].options).toEqual(['ש"י עגנון', 'חיים נחמן ביאליק']);
    expect(snap.fields[0].context).toContain('הכלה ומצוד הפרפרים');
    expect(snap.fields[1].context).toContain('נמק');
  });
});

describe('moodle', () => {
  it('reads .que blocks', () => {
    page(`
      <div class="que essay"><div class="info"><span class="qno">1</span></div>
        <div class="content"><div class="qtext">נתח את דמותו של הגיבור.</div>
        <div class="answer"><div contenteditable="true" class="editor_atto_content"></div></div></div></div>`);
    const [f] = extractFrame().fields;
    expect(f.kind).toBe('richtext');
    expect(f.context).toContain('נתח את דמותו');
  });
});

describe('story side bar', () => {
  it('finds a collapsed story panel and keeps it out of the page text', () => {
    page(`
      <main><h1>משימה בספרות</h1><p>ענה על השאלות לפי הסיפור.</p><textarea></textarea></main>
      <aside class="story-drawer" hidden><h3>הכלה ומצוד הפרפרים</h3><div>${LONG}</div></aside>`);
    const snap = extractFrame();
    expect(snap.story?.text).toContain('קטע מתוך הסיפור');
    expect(snap.story?.title).toBe('הכלה ומצוד הפרפרים');
    expect(snap.fullText).not.toContain('קטע מתוך הסיפור');
  });

  it('does not call ordinary page text a story', () => {
    page(`<div><p>הוראות קצרות</p><textarea></textarea></div>`);
    expect(extractFrame().story).toBeUndefined();
  });
});
