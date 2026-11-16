/**
 * How much an answer *looks* AI-written, by well-known signs: long dashes, empty lines, colons,
 * lists, cliché openers ("חשוב לציין", "לסיכום"), very even sentence lengths. A local estimate, not
 * a real detector: free, instant, and the text never leaves the page.
 */

export interface AiScore {
  /** 0–100, or null when the text is too short to judge. */
  score: number | null;
  issues: { label: string; count: number }[];
}

const PHRASES = [
  'חשוב לציין', 'יש לציין', 'ראוי לציין', 'לסיכום', 'ראשית', 'שנית', 'בנוסף לכך', 'יתרה מזאת', 'יתרה מכך',
  'נוסף על כך', 'כמו כן', 'מעבר לכך', 'ניתן לומר', 'מכאן ניתן להסיק', 'לאור זאת', 'באופן כללי', 'בסופו של דבר',
  'furthermore', 'moreover', 'in conclusion', 'delve', 'it is important to note', 'additionally',
];

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

export function aiScore(text: string): AiScore {
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  const issues: AiScore['issues'] = [];
  let points = 0;
  const add = (label: string, n: number, weight: number) => {
    if (n <= 0) return;
    issues.push({ label, count: n });
    points += weight * Math.min(n, 4);
  };

  // structure
  add('מקף ארוך (— או –)', count(t, /[—–]/g), 12);
  add('שורה ריקה (רווח גדול)', count(t, /\n[ \t]*\n/g), 10);
  add('נקודתיים או נקודה-פסיק', count(t, /[:;]/g), 5);
  add('רשימה (•, -, 1.)', count(t, /^\s*([•\-*]|\d+[.)])\s/gm), 8);
  add('סימני markdown (* או #)', count(t, /\*\*|^#+\s/gm), 10);
  add('מירכאות מעוגלות (“ ”)', count(t, /[“”„]/g), 6);
  add('תווים נסתרים', count(t, /[​-‏‪-‮⁦-⁩﻿]/g), 8);

  // wording
  const low = t.toLowerCase();
  for (const p of PHRASES) add(`"${p}"`, low.split(p).length - 1, 9);

  // style: very long sentences, sentences all about the same length, dense punctuation
  const sentences = t.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 3);
  const lengths = sentences.map((s) => s.split(/\s+/).length);
  add('משפטים ארוכים מאוד', lengths.filter((n) => n > 35).length, 6);
  if (lengths.length >= 4) {
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const sd = Math.sqrt(lengths.reduce((a, n) => a + (n - mean) ** 2, 0) / lengths.length);
    if (sd / mean < 0.25) add('משפטים באורך כמעט זהה', 1, 12);
  }
  const punct = count(t, /[,.;:!?]/g);
  if (words >= 25 && punct / words > 0.22) add('הרבה סימני פיסוק', 1, 8);

  if (words < 8) return { score: null, issues };
  return { score: Math.min(100, Math.round(points * (words < 40 ? 1.2 : 1))), issues };
}

/** Fixes the structural signs (not the wording): dashes, empty lines, colons, lists, curly quotes. */
export function fixStructure(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*([•\-*]|\d+[.)])\s+/gm, '')
    .replace(/[“”„]/g, '"')
    .replace(/\s*;\s*/g, '. ')
    .replace(/(\S)\s*:\s+/g, '$1, ')
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n\s*\n+/g, '\n')
    .replace(/,\s*,/g, ',')
    .replace(/ {2,}/g, ' ')
    .trim();
}
