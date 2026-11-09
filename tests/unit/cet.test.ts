import { beforeEach, describe, expect, it } from 'vitest';
import { extractFrame } from '../../src/content/extract';
import { findPagination } from '../../src/content/extract/pages';
import { fillFields } from '../../src/content/fill';

// Shaped like the CET lesson the student pasted: menu, Zoom box, story, option boxes 1–4, "Send Check".
const PARA = [
  'קודם כול, פרולוג אוטוביוגרפי קצר. אימי, שהייתה אינטליגנטית באופן מיוחד, הייתה הבחורה היפה ביותר באלבמה. כולם אמרו זאת, וזה היה נכון.',
  'במשך השנים כמעט לא ראיתי אף אחד מהוריי. אבי היה עסוק בניו אורלינס, ואימי, לאחר שסיימה את הקולג\', עשתה חיל בניו יורק.',
  'הייתה זו סוק שסיפרה לי על סנטה קלאוס, על זקנו המתנפנף, חליפתו האדומה, על מזחלתו המצלצלת מלאת המתנות, ואני האמנתי לה.',
  'בכיתי. לא רציתי לנסוע. מעולם לא עזבתי קודם את העיירה הקטנה והמבודדת באלבמה, המוקפת יערות וחוות ונהרות.',
  'שלג! לפני שידעתי לקרוא, סוק הייתה מקריאה לי סיפורים רבים, ונראה שבכולם היה הרבה שלג. פתותי אגדות מסנוורים, נישאים ברוח.',
  'הייתה לי חליפה חדשה. כרטיס עם שמי וכתובתי היה מחובר בסיכה לדש הבגד. זה היה למקרה שאלך לאיבוד. תבינו, נאלצתי לנסוע לבדי.',
];

const options = (q: string, opts: string[]) => `
  <div class="task"><div class="q-title">${q}</div>
    <div class="answers">${opts.map((o, i) => `<div class="answer-box"><span class="num">${i + 1}</span><span class="txt">${o}</span></div>`).join('')}</div>
    <button>Send Check</button>
  </div>`;

function page() {
  document.body.innerHTML = `
  <div class="app">
    <div class="lesson-menu">
      <div class="part"><span>01</span><ul><li><img alt="mark icon">דיון - חלק...</li><li><img alt="mark icon">קראו במסך ...</li></ul></div>
      <div class="part"><span>02</span><ul><li><img alt="mark icon">דמותה של ס...</li></ul></div>
      <div class="part"><span>03</span><ul><li><img alt="mark icon">המפגש בין ...</li></ul></div>
    </div>
    <div class="zoom">Link for Zoom meeting <button>Save</button> <button>Activate the Zoom meeting</button></div>
    <div class="split">
      <div class="reading"><h3>חג מולד אחד / טרומן קפוטה</h3><div class="text">${PARA.map((p) => `<p>${p}</p>`).join('')}</div></div>
      <div class="tasks">
        ${options('מה ידוע לנו על אימו של המספר?', ['היא חיה עם בעלה בניו אורלינס.', 'היא אוהבת לאפות.', 'היא עזבה את בנה שילדה בגיל צעיר מאוד, לטובת הגשמת שאיפות אישיות.', 'שמה סוּק פוֹק.'])}
        ${options('מה ידוע לנו על הילד המספר? (סמנו את כל התשובות הנכונות)', ['הוא לא גדל עם הוריו.', 'הוא בעל אמונה תמימה.', 'הוא גדל בבית אמיד.', 'הוא חזק לגילו.', 'שמו באדי.'])}
      </div>
    </div>
    <div class="pager"><span>1</span><span>2</span><span>3</span></div>
  </div>`;
}

beforeEach(() => {
  (window as any).__sabCounter = 0;
  page();
});

describe('CET-style lesson', () => {
  it('reads numbered option boxes as multiple-choice questions', () => {
    const snap = extractFrame();
    expect(snap.fields).toHaveLength(2);
    expect(snap.fields[0]).toMatchObject({ kind: 'radio', options: ['היא חיה עם בעלה בניו אורלינס.', 'היא אוהבת לאפות.', 'היא עזבה את בנה שילדה בגיל צעיר מאוד, לטובת הגשמת שאיפות אישיות.', 'שמה סוּק פוֹק.'] });
    expect(snap.fields[0].context).toContain('מה ידוע לנו על אימו של המספר');
    expect(snap.fields[1].kind).toBe('checkbox'); // "סמנו את כל התשובות הנכונות"
  });

  it('takes only the story as the story, without the menu, Zoom box or questions', () => {
    const story = extractFrame().story!;
    expect(story.text).toContain('פרולוג אוטוביוגרפי');
    expect(story.text).toContain('נאלצתי לנסוע לבדי');
    for (const junk of ['Zoom', 'mark icon', 'דיון - חלק', 'מה ידוע לנו', 'Send Check', 'היא אוהבת לאפות']) expect(story.text).not.toContain(junk);
  });

  it('keeps the questions in the page text', () => {
    expect(extractFrame().fullText).toContain('מה ידוע לנו על אימו של המספר');
  });

  it('finds the 1 2 3 page buttons, not the answer options or the 01 02 03 menu', () => {
    const p = findPagination()!;
    expect(p.buttons.map((b) => b.parentElement!.className)).toEqual(['pager', 'pager', 'pager']);
  });

  it('fills by clicking the right option boxes', () => {
    const [q1, q2] = extractFrame().fields;
    document.querySelectorAll('.answer-box').forEach((b) => b.addEventListener('click', () => b.classList.toggle('selected')));
    fillFields([
      { fieldId: q1.id, value: '', option: 'היא עזבה את בנה שילדה בגיל צעיר מאוד, לטובת הגשמת שאיפות אישיות.' },
      { fieldId: q2.id, value: '', option: 'הוא לא גדל עם הוריו.; הוא בעל אמונה תמימה.; שמו באדי.' },
    ]);
    const selected = Array.from(document.querySelectorAll('.answer-box.selected')).map((b) => b.querySelector('.txt')!.textContent);
    expect(selected).toEqual(['היא עזבה את בנה שילדה בגיל צעיר מאוד, לטובת הגשמת שאיפות אישיות.', 'הוא לא גדל עם הוריו.', 'הוא בעל אמונה תמימה.', 'שמו באדי.']);
  });
});
