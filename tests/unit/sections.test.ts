import { beforeEach, describe, expect, it } from 'vitest';
import { findSectionTabs, sectionTabsEnabled } from '../../src/content/extract/sections';

const bar = (active = 1, extra = '') => `
  <div class="top"><ul class="tabs">
    ${['המשימה', 'מפת מקורות', 'שולחן כתיבה', 'שיתוף'].map((t, i) => `<li class="${i + 1 === active ? 'active' : ''}"><a>${t}</a></li>`).join('')}
    ${extra}
  </ul></div><main><p>שאלה 1</p><textarea></textarea></main>`;

function cet(on: boolean) {
  document.head.querySelector('meta[name="sab-section-tabs"]')?.remove();
  if (on) document.head.insertAdjacentHTML('beforeend', '<meta name="sab-section-tabs">');
}

beforeEach(() => {
  cet(true);
  document.body.innerHTML = '';
});

describe('CET section tabs', () => {
  it('finds המשימה | מפת מקורות | שולחן כתיבה and skips שיתוף', () => {
    document.body.innerHTML = bar(3);
    const s = findSectionTabs()!;
    expect(s.labels).toEqual(['המשימה', 'מפת מקורות', 'שולחן כתיבה']);
    expect(s.current).toBe(3);
  });

  it('only on CET', () => {
    cet(false);
    document.body.innerHTML = bar(1);
    expect(findSectionTabs()).toBeNull();
    expect(sectionTabsEnabled(document, { hostname: 'bagruthumanities.cet.ac.il' } as Location)).toBe(true);
    expect(sectionTabsEnabled(document, { hostname: 'www.classe.world' } as Location)).toBe(false);
  });

  it('a menu of links to other pages is not task tabs', () => {
    document.body.innerHTML = `<nav><ul>${['ראשי', 'קורסים', 'ציונים'].map((t, i) => `<li class="${i ? '' : 'active'}"><a href="/other/${i}">${t}</a></li>`).join('')}</ul></nav>`;
    expect(findSectionTabs()).toBeNull();
  });

  it('needs to know which tab is open', () => {
    document.body.innerHTML = `<ul class="tabs"><li><a>א</a></li><li><a>ב</a></li></ul>`;
    expect(findSectionTabs()).toBeNull();
  });
});

import { firstQuestion, looksLikeQuestion } from '../../src/shared/questions';

describe('what counts as a question', () => {
  it('questions, task verbs and numbered questions', () => {
    expect(looksLikeQuestion('מי כתב את הסיפור?')).toBe(true);
    expect(looksLikeQuestion('שאלה 4 (32 נקודות)')).toBe(true);
    expect(looksLikeQuestion('הסבירו את עמדת בן גוריון')).toBe(true);
    expect(looksLikeQuestion('ונמקו את תשובתכם')).toBe(true);
  });
  it('source texts and input boxes are not', () => {
    expect(looksLikeQuestion('רעיונות/טענות')).toBe(false); // "ענו" inside "טענות"
    expect(looksLikeQuestion('ההיסטוריונית אניטה שפירא: ההחלטה התקבלה ברוב של 6 נגד 4')).toBe(false);
    expect(looksLikeQuestion('')).toBe(false);
  });
  it('finds the task question in a text', () => {
    expect(firstQuestion('קראו את המקורות. האם התקיימה או לא התקיימה הצבעה על הכרזת המדינה? בכתיבתכם…')).toBe('האם התקיימה או לא התקיימה הצבעה על הכרזת המדינה?');
  });
});
