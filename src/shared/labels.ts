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

// ---------- order by question number ----------

const HEB = 'אבגדהוזחטיכלמנסעפצקרשת';

/**
 * "3", "3.", "שאלה 3", "ב", "שאלה ב׳" → 3 / 2. Only a question number: "עמוד 3 - מה העמדה שלי" or
 * a date inside a title is not one → undefined.
 */
export function questionNumber(text: string): number | undefined {
  const q = text.match(/(?:שאלה|\bquestion|\bq)\s*\.?\s*(\d{1,3})(?!\d)/i);
  if (q) return Number(q[1]);
  const lead = text.match(/^\s*(\d{1,3})(?![\d/.:-]\d)/);
  if (lead && !/^\s*\d{1,3}\s*[-/.]\s*\d/.test(text)) return Number(lead[1]);
  const t = text.replace(/^\s*שאלה\s*/, '').trim();
  const m = t.match(/^([א-ת])['׳]?$/);
  return m ? HEB.indexOf(m[1].replace(/[ךםןףץ]/, (c) => 'כמנפצ'['ךםןףץ'.indexOf(c)])) + 1 || undefined : undefined;
}

/** "שאלה 3", "שאלה ב׳", "Question 3", "Q3" → the number (or letter) as written. */
const Q_RE = /(?:שאלה\s*(\d{1,3}|[א-ת]['׳]?)(?![א-ת])|\b(?:question|q)\s*\.?\s*(\d{1,3})(?!\d))/i;
const rawNum = (t: string): string | undefined => {
  const m = t.match(Q_RE);
  return m ? (m[1] ?? m[2]) : undefined;
};

function partRank(part: string): string {
  const p = part.trim().replace(/^סעיף\s*/, '');
  if (!p) return '';
  const heb = HEB.indexOf(p[0]);
  if (heb >= 0) return `a${String(heb).padStart(2, '0')}${p}`;
  return `b${p.toLowerCase()}`;
}

/** Page of a row: its own page, or the "p2." in a page-walk field id ("0:p2.3"). */
function pageOf(page: number | undefined, fieldId: string | null | undefined): number {
  if (page) return page;
  const m = fieldId?.match(/:p(\d+)\./);
  return m ? Number(m[1]) : 0;
}

export type OrderedRow =
  | { kind: 'answer'; index: number; label: string }
  | { kind: 'missing'; index: number; label: string };

interface Keyed {
  kind: 'answer' | 'missing';
  index: number;
  page: number;
  num: number;
  part: string;
  pos: number;
  question: string;
  partText: string;
  explicit?: number;
}

/**
 * Answers and missing questions in one list, sorted like the page: by page, then question number,
 * then part (א, ב…). A row without a number stays right after the row before it. Labels are given
 * after sorting and never repeat; the data itself is not reordered (rows keep their index).
 */
/** The task's own number for a question: "שאלה 4" in the page text, else what Claude wrote. */
function taskNumber(questionText: string | undefined, question: string): number | undefined {
  const fromPage = (questionText ? rawNum(questionText) : undefined);
  if (fromPage) return questionNumber(fromPage);
  return questionNumber(question);
}

export function orderedRows(
  answers: { question: string; part: string; page?: number; field_id?: string | null; questionText?: string }[],
  missing: { field_id: string; context: string; page?: number }[] = [],
): OrderedRow[] {
  const keyed: Keyed[] = [];
  let lastNum = 0;
  let lastPage = 0;
  answers.forEach((a, i) => {
    const n = taskNumber(a.questionText, a.question);
    const own = pageOf(a.page, a.field_id);
    // a row without a number (or page) stays right after the row before it
    const page = own || (n === undefined ? lastPage : 0);
    if (n !== undefined) lastNum = n;
    lastPage = page;
    keyed.push({ kind: 'answer', index: i, page, num: n ?? lastNum + 0.5, part: partRank(a.part), pos: i, question: a.question, partText: a.part, explicit: n });
  });
  missing.forEach((m, i) => {
    const raw = rawNum(m.context);
    const n = raw ? questionNumber(raw) : undefined;
    keyed.push({ kind: 'missing', index: i, page: pageOf(m.page, m.field_id), num: n ?? Number.MAX_SAFE_INTEGER, part: '', pos: answers.length + i, question: raw ?? '', partText: '', explicit: n });
  });
  keyed.sort((x, y) => x.page - y.page || x.num - y.num || (x.part < y.part ? -1 : x.part > y.part ? 1 : 0) || x.pos - y.pos);

  // The number is the task's own ("שאלה 4"), never a running count. If two rows would look the same
  // (pages that restart at 1), the page tells them apart; a question without a number gets "#".
  const used = new Set<string>();
  return keyed.map((k, i) => {
    const p = k.partText.trim().replace(/^סעיף\s*/, '');
    let label = k.explicit !== undefined ? `שאלה ${k.explicit}${p && p.length <= 6 ? ` · ${p}` : ''}` : `#${i + 1}`;
    if (used.has(label) && k.page) label = `${label} (עמוד ${k.page})`;
    for (let n = 2; used.has(label); n++) label = `${label.replace(/ \(\d+\)$/, '')} (${n})`;
    used.add(label);
    return { kind: k.kind, index: k.index, label } as OrderedRow;
  });
}
