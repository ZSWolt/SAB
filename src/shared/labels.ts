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

/** "3", "שאלה 3", "ב", "שאלה ב׳" → 3 / 2; nothing numeric → undefined. */
export function questionNumber(text: string): number | undefined {
  const d = text.match(/\d{1,3}/);
  if (d) return Number(d[0]);
  const t = text.replace(/^\s*שאלה\s*/, '').trim();
  const m = t.match(/^([א-ת])['׳]?$/);
  return m ? HEB.indexOf(m[1].replace(/[ךםןףץ]/, (c) => 'כמנפצ'['ךםןףץ'.indexOf(c)])) + 1 || undefined : undefined;
}

const MISSING_NUM = /שאלה\s*(\d{1,3}|[א-ת]['׳]?)(?![א-ת])/;

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
export function orderedRows(
  answers: { question: string; part: string; page?: number; field_id?: string | null }[],
  missing: { field_id: string; context: string; page?: number }[] = [],
): OrderedRow[] {
  const keyed: Keyed[] = [];
  let lastNum = 0;
  let lastPage = 0;
  answers.forEach((a, i) => {
    const n = questionNumber(a.question);
    const own = pageOf(a.page, a.field_id);
    // a row without a number (or page) stays right after the row before it
    const page = own || (n === undefined ? lastPage : 0);
    if (n !== undefined) lastNum = n;
    lastPage = page;
    keyed.push({ kind: 'answer', index: i, page, num: n ?? lastNum + 0.5, part: partRank(a.part), pos: i, question: a.question, partText: a.part, explicit: n });
  });
  missing.forEach((m, i) => {
    const raw = m.context.match(MISSING_NUM)?.[1];
    const n = raw ? questionNumber(raw) : undefined;
    keyed.push({ kind: 'missing', index: i, page: pageOf(m.page, m.field_id), num: n ?? Number.MAX_SAFE_INTEGER, part: '', pos: answers.length + i, question: raw ?? '', partText: '', explicit: n });
  });
  keyed.sort((x, y) => x.page - y.page || x.num - y.num || (x.part < y.part ? -1 : x.part > y.part ? 1 : 0) || x.pos - y.pos);

  // pages that restart at "שאלה 1" would repeat labels; then the later ones get their place in the list
  const used = new Set<string>();
  const numPage = new Map<number, number>();
  return keyed.map((k, i) => {
    let label = k.kind === 'answer' ? questionLabel(k.question, k.partText, i + 1) : k.explicit !== undefined ? `שאלה ${k.explicit}` : `שאלה ${i + 1}`;
    const restarted = k.explicit !== undefined && numPage.has(k.explicit) && numPage.get(k.explicit) !== k.page;
    if (k.explicit !== undefined && !numPage.has(k.explicit)) numPage.set(k.explicit, k.page);
    if (used.has(label) || restarted) {
      let n = i + 1;
      label = `שאלה ${n}`;
      while (used.has(label)) label = `שאלה ${++n}`;
    }
    used.add(label);
    return { kind: k.kind, index: k.index, label } as OrderedRow;
  });
}
