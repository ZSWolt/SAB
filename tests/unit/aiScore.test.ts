import { describe, expect, it } from 'vitest';
import { aiScore, fixStructure } from '../../src/shared/aiScore';

describe('how AI-looking an answer is', () => {
  it('long dashes, an empty line and cliché openers score high', () => {
    const r = aiScore('חשוב לציין כי הגיבור — שהיה צעיר מאוד — מתמודד עם קשיים רבים בדרכו.\n\nלסיכום: ניתן לומר שהוא השתנה במהלך הסיפור כולו בצורה משמעותית.');
    expect(r.score).toBeGreaterThan(55);
    const labels = r.issues.map((i) => i.label).join(' ');
    for (const s of ['מקף ארוך', 'שורה ריקה', '"חשוב לציין"', '"לסיכום"']) expect(labels).toContain(s);
  });
  it('a short plain student answer scores low', () => {
    expect(aiScore('לדעתי הגיבור השתנה כי הוא למד מהסבא שלו להקשיב לעצמו ולא רק לאחרים').score).toBeLessThan(15);
    expect(aiScore('עגנון').score).toBeNull();
  });
  it('fixStructure removes the structural signs and keeps the words', () => {
    const fixed = fixStructure('הגיבור — שהיה צעיר — השתנה.\n\nהסיבה: הוא למד מ“הסבא”; זה חשוב.');
    expect(fixed).toBe('הגיבור, שהיה צעיר, השתנה.\nהסיבה, הוא למד מ"הסבא". זה חשוב.');
    expect(aiScore(fixed).issues.some((i) => /מקף|שורה ריקה|מעוגלות/.test(i.label))).toBe(false);
  });
});
