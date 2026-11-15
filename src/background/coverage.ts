import type { Answer, SolveResult, TaggedSnapshot } from '../shared/types';
import { looksLikeQuestion } from '../shared/questions';
import { questionNumber } from '../shared/labels';

type Field = TaggedSnapshot['fields'][number] & { field_id: string };
const allFields = (snaps: TaggedSnapshot[]): Field[] => snaps.flatMap((s) => s.fields.map((f) => ({ ...f, field_id: `${s.frameId}:${f.id}` })));

/** "שאלה 3" in a field's text (its first lines), as a number. */
function fieldNumber(context: string): number | undefined {
  const m = context.slice(0, 300).match(/שאלה\s*(\d{1,3})(?!\d)/);
  return m ? Number(m[1]) : undefined;
}

const words = (t: string) => new Set(t.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2));
function overlap(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  A.forEach((w) => B.has(w) && n++);
  return n / Math.min(A.size, B.size);
}

/**
 * An answer Claude wrote without a field (field_id null) or with a field id that doesn't exist, while
 * a field for that question sits empty: connect them. By the question number ("שאלה 3" on both, same
 * page when known) or by the words of the question. A choice answer only joins a field that has that option.
 */
export function attachOrphans(answers: Answer[], snaps: TaggedSnapshot[]): Answer[] {
  const fields = allFields(snaps);
  const ids = new Set(fields.map((f) => f.field_id));
  const taken = new Set(answers.map((a) => a.field_id).filter((id): id is string => !!id && ids.has(id)));
  return answers.map((a) => {
    if (a.field_id && ids.has(a.field_id)) return a;
    const num = questionNumber(a.question) ?? (a.questionText ? fieldNumber(a.questionText) : undefined);
    const free = fields.filter((f) => !taken.has(f.field_id) && (!a.option || (f.options ?? []).some((o) => a.option!.split(';').some((x) => o.includes(x.trim()) || x.includes(o)))));
    let match =
      num !== undefined ? free.find((f) => fieldNumber(f.context) === num && (!a.page || !f.page || a.page === f.page)) : undefined;
    if (!match && a.questionText) match = free.find((f) => overlap(a.questionText!, f.context) >= 0.6);
    if (!match && !a.option && a.question.length > 12) match = free.find((f) => overlap(a.question, f.context) >= 0.6);
    if (!match) return a.field_id && !ids.has(a.field_id) ? { ...a, field_id: null } : a;
    taken.add(match.field_id);
    return { ...a, field_id: match.field_id };
  });
}

/** "שאלה N" headings in the page text: at the start of a line (not "כמו בשאלה 5" inside a sentence). */
export function textQuestionNumbers(snaps: TaggedSnapshot[]): number[] {
  const nums = new Set<number>();
  for (const s of snaps) {
    for (const line of s.fullText.split('\n')) {
      const m = line.trim().match(/^(?:===.*?===\s*)?שאלה\s*(\d{1,3})(?!\d)/);
      if (m) nums.add(Number(m[1]));
    }
  }
  return [...nums].sort((a, b) => a - b);
}

/** Question numbers that have an answer (as shown in the answers tab). */
export function answeredNumbers(result: SolveResult): Set<number> {
  const out = new Set<number>();
  for (const a of result.answers) {
    const n = (a.questionText ? fieldNumber(a.questionText) : undefined) ?? questionNumber(a.question);
    if (n !== undefined) out.add(n);
  }
  return out;
}

/** Which fields got no answer, and which got more than one. */
export function checkCoverage(snaps: TaggedSnapshot[], result: SolveResult, only?: string[]) {
  const counts = new Map<string, number>();
  for (const a of result.answers) if (a.field_id) counts.set(a.field_id, (counts.get(a.field_id) ?? 0) + 1);
  const wanted = only?.length ? new Set(only) : null;
  // fields Claude says are not questions (name, class…) are not missing
  for (const sk of result.skipped ?? []) counts.set(sk.field_id, counts.get(sk.field_id) ?? 0);
  const skippedIds = new Set((result.skipped ?? []).map((s) => s.field_id));
  const missing = snaps.flatMap((s) =>
    s.fields
      .map((f) => ({ kind: f.kind, field_id: `${s.frameId}:${f.id}`, context: f.context.replace(/\s+/g, ' ').slice(0, 200), ...(f.page ? { page: f.page } : {}), ...(f.table ? { table: f.table.rows } : {}), ...(f.section ? { section: f.section } : {}) }))
      // only real questions count as missing: an empty box without a question next to it is not one
      .filter((f) => (!wanted || wanted.has(f.field_id)) && !counts.has(f.field_id) && !skippedIds.has(f.field_id) && (wanted || f.kind === 'richtext' || f.kind === 'textarea' || looksLikeQuestion(f.context)))
      .map(({ kind: _kind, ...m }) => m),
  );
  const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  // "שאלה N" in the text without an answer (and without a field that is already listed as missing)
  const done = answeredNumbers(result);
  const missingNums = new Set(missing.map((m) => fieldNumber(m.context)).filter((n): n is number => n !== undefined));
  const missingText = wanted ? [] : textQuestionNumbers(snaps).filter((n) => !done.has(n) && !missingNums.has(n));
  return { missing, duplicates, missingText };
}

export function mergeResults(prev: SolveResult, next: SolveResult): SolveResult {
  const byField = new Map(next.answers.filter((a) => a.field_id).map((a) => [a.field_id, a]));
  const answers = prev.answers.map((a) => (a.field_id && byField.has(a.field_id) ? byField.get(a.field_id)! : a));
  for (const a of next.answers) if (!a.field_id || !prev.answers.some((p) => p.field_id === a.field_id)) answers.push(a);
  const seen = new Set<string>();
  return {
    ...prev,
    answers,
    sources: [...prev.sources, ...next.sources].filter((s) => !seen.has(s.url) && !!seen.add(s.url)),
    searches: [...prev.searches, ...next.searches],
    notes: [prev.notes, next.notes].filter(Boolean).join('\n'),
    skipped: [...(prev.skipped ?? []).filter((s) => !next.answers.some((a) => a.field_id === s.field_id)), ...(next.skipped ?? [])],
    costUsd: prev.costUsd + next.costUsd,
  };
}


/** The question line of a field's context (skips a short "שאלה 3" line before it). */
export function questionLine(context: string): string {
  const lines = context.split('\n').map((l) => l.trim()).filter((l) => l.length > 1);
  let q = lines[0] ?? '';
  if (q.length < 14 && lines[1]) q = `${q} ${lines[1]}`;
  return q.length > 180 ? `${q.slice(0, 177)}…` : q;
}

/** Adds the real question text, page and (for check-me) the student's answer, from the page. */
export function enrich<T extends { field_id: string | null }>(items: T[], snaps: TaggedSnapshot[], withValue = false): T[] {
  const map = new Map<string, TaggedSnapshot["fields"][number]>(snaps.flatMap((s) => s.fields.map((f) => [`${s.frameId}:${f.id}`, f] as [string, TaggedSnapshot["fields"][number]])));
  return items.map((it) => {
    const f = it.field_id ? map.get(it.field_id) : undefined;
    if (!f) return it;
    return { ...it, questionText: questionLine(f.context), ...(f.page ? { page: f.page } : {}), ...(f.table ? { table: f.table.rows } : {}), ...(f.section ? { section: f.section } : {}), ...(withValue && f.value ? { studentAnswer: f.value } : {}) };
  });
}
