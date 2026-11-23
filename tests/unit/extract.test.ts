import { beforeEach, describe, expect, it } from 'vitest';
import { extractFrame, isStorySite } from '../../src/content/extract';

const LONG = 'זהו קטע מתוך הסיפור. '.repeat(120);

function page(html: string) {
  document.body.innerHTML = html;
}

/** Story detection runs only on classe.world; tests turn it on with the meta tag. */
function storySite(on: boolean) {
  document.head.querySelector('meta[name="sab-story-site"]')?.remove();
  if (on) document.head.insertAdjacentHTML('beforeend', '<meta name="sab-story-site">');
}

beforeEach(() => {
  storySite(false);
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
  beforeEach(() => storySite(true));

  it('finds a collapsed story panel and keeps it out of the page text', () => {
    page(`
      <main><h1>משימה בספרות</h1><p>ענה על השאלות לפי הסיפור.</p><textarea></textarea></main>
      <aside class="story-drawer" hidden><h3>הכלה ומצוד הפרפרים</h3><div>${LONG}</div></aside>`);
    const snap = extractFrame();
    expect(snap.story?.text).toContain('קטע מתוך הסיפור');
    expect(snap.story?.title).toBe('הכלה ומצוד הפרפרים');
    expect(snap.fullText).not.toContain('קטע מתוך הסיפור');
  });

  it('looks for a story only on classe.world (literature)', () => {
    const html = `<main><h1>משימה</h1><textarea></textarea></main><aside class="story-drawer" hidden><h3>כותרת</h3><div>${LONG}</div></aside>`;
    storySite(false);
    page(html);
    expect(isStorySite()).toBe(false);
    const snap = extractFrame();
    expect(snap.story).toBeUndefined();
    expect(snap.fullText).not.toContain('קטע מתוך הסיפור'); // hidden text isn't page text either
    expect(isStorySite(document, { hostname: 'www.classe.world' } as Location)).toBe(true);
    expect(isStorySite(document, { hostname: 'bagruthumanities.cet.ac.il' } as Location)).toBe(false);
    expect(isStorySite(document, { hostname: 'notclasse.world.evil.com' } as Location)).toBe(false);
  });

  it('does not call ordinary page text a story', () => {
    page(`<div><p>הוראות קצרות</p><textarea></textarea></div>`);
    expect(extractFrame().story).toBeUndefined();
  });
});

describe('classe: the story is only in the bar on the right', () => {
  beforeEach(() => storySite(true));

  it('takes the bar, not a long text in the middle of the page', () => {
    page(`
      <main><h1>מבוא לשיעור</h1><div class="intro">${'הסבר ארוך על הסופר ועל התקופה, לא הסיפור. '.repeat(60)}</div>
        <p>שאלה 1: מה עשה הגיבור?</p><textarea></textarea></main>
      <div class="story-panel" hidden><h3>הנסיעה לסבא</h3><div>${LONG}</div></div>`);
    const snap = extractFrame();
    expect(snap.story?.title).toBe('הנסיעה לסבא');
    expect(snap.story?.text).not.toContain('הסבר ארוך על הסופר');
  });

  it('no bar: no story (even with a long text on the page)', () => {
    page(`<main><div class="intro">${'הסבר ארוך על הסופר ועל התקופה, לא הסיפור. '.repeat(60)}</div><p>שאלה 1</p><textarea></textarea></main>`);
    expect(extractFrame().story).toBeUndefined();
  });
});

import { pageTopic } from '../../src/content/extract';

describe('the topic of the page', () => {
  it('is the main heading, not a button or the site name', () => {
    document.title = 'משימה | מטח';
    page(`<header><button><h1>תפריט</h1></button><h1>מטח</h1></header><main><h1>הדיון על הכרזת העצמאות</h1></main>`);
    expect(pageTopic()).toBe('הדיון על הכרזת העצמאות');
  });
  it('falls back to the tab title without the site name', () => {
    document.title = 'תיאטרון ביוון העתיקה | מטח';
    page(`<p>טקסט</p>`);
    expect(pageTopic()).toBe('תיאטרון ביוון העתיקה');
  });
});

import { findDocuments } from '../../src/content/extract/documents';

describe('privacy, terms, support and footers are not read', () => {
  it('leaves them out of the page text, fields and documents', () => {
    page(`
      <main><p>שאלה 1: מה עשה הגיבור?</p><textarea></textarea><a href="/files/story.pdf">הסיפור (PDF)</a></main>
      <section><h2>מדיניות פרטיות</h2><p>אנו אוספים מידע על המשתמשים…</p></section>
      <div class="cookie-banner">האתר משתמש בעוגיות <button>אישור</button></div>
      <footer><a href="/terms.pdf">תנאי שימוש</a> <a href="/support">תנאי תמיכה</a> כל הזכויות שמורות <input type="email" placeholder="ניוזלטר"></footer>`);
    const snap = extractFrame();
    expect(snap.fullText).toContain('מה עשה הגיבור');
    for (const junk of ['אנו אוספים מידע', 'עוגיות', 'כל הזכויות שמורות', 'תנאי שימוש']) expect(snap.fullText).not.toContain(junk);
    expect(snap.fields).toHaveLength(1); // the newsletter box in the footer is not a question
    expect(findDocuments().map((d) => d.title)).toEqual(['הסיפור (PDF)']);
  });
});

describe('Moodle question markup', () => {
  it('choice texts from aria-labelledby, and the match stem in each select context', () => {
    page(`<div class="que multichoice"><div class="info"><h3 class="no">Question 1</h3></div><div class="qtext">Pick one</div>
      <div class="answer"><div><input type="radio" name="a" id="x0" aria-labelledby="x0_label"><div id="x0_label" data-region="answer-label"><span class="answernumber">a. </span><div>Paris</div></div></div>
      <div><input type="radio" name="a" id="x1" aria-labelledby="x1_label"><div id="x1_label" data-region="answer-label"><span class="answernumber">b. </span><div>Rome</div></div></div></div></div>
      <div class="que match"><div class="info"><h3 class="no">Question 2</h3></div><div class="qtext">Match</div><table class="answer"><tbody>
      <tr><td class="text">big</td><td class="control"><select><option>Choose</option><option>large</option></select></td></tr>
      <tr><td class="text">tiny</td><td class="control"><select><option>Choose</option><option>small</option></select></td></tr></tbody></table></div>`);
    const fields = extractFrame().fields;
    expect(fields[0].options).toEqual(['a. Paris', 'b. Rome']);
    expect(fields[0].context).toContain('Question 1');
    expect(fields[2].context).toContain('פריט: tiny');
    expect(fields[2].context).toContain('Question 2');
  });
});
