/**
 * "שאלה 3 · א" from what Claude wrote in `question` / `part` (it copies the page's own numbering),
 * or the row's position when the question has no number. The answers tab and the chat use the
 * same label, so "תקצר את תשובה 3" means the row the student sees as "שאלה 3".
 */
export function questionLabel(question: string, part: string, fallback: number): string {
  const num = question.match(/\d{1,3}/)?.[0] ?? (/^[א-ת]['׳]?$/.test(question.trim()) ? question.trim() : String(fallback));
  const p = part.trim().replace(/^סעיף\s*/, '');
  return `שאלה ${num}${p && p.length <= 6 ? ` · ${p}` : ''}`;
}

/**
 * Labels for a whole list, never twice the same: when two answers would both be "שאלה 1"
 * (for example after "complete the missing"), the later one gets its place in the list.
 */
export function answerLabels(items: { question: string; part: string }[]): string[] {
  const used = new Set<string>();
  return items.map((a, i) => {
    let label = questionLabel(a.question, a.part, i + 1);
    if (used.has(label)) {
      label = `שאלה ${i + 1}`;
      for (let n = i + 1; used.has(label); n++) label = `שאלה ${n}`;
    }
    used.add(label);
    return label;
  });
}

/** Numbers for the questions without an answer: after the answers, skipping numbers already used. */
export function missingLabels(answerLabelList: string[], count: number): string[] {
  const used = new Set(answerLabelList);
  const out: string[] = [];
  for (let n = answerLabelList.length + 1; out.length < count; n++) {
    const label = `שאלה ${n}`;
    if (!used.has(label)) out.push(label);
  }
  return out;
}
