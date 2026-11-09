import type { SolveResult, TaggedSnapshot } from '../shared/types';

/** Which fields got no answer, and which got more than one. */
export function checkCoverage(snaps: TaggedSnapshot[], result: SolveResult, only?: string[]) {
  const counts = new Map<string, number>();
  for (const a of result.answers) if (a.field_id) counts.set(a.field_id, (counts.get(a.field_id) ?? 0) + 1);
  const wanted = only?.length ? new Set(only) : null;
  const missing = snaps.flatMap((s) =>
    s.fields
      .map((f) => ({ field_id: `${s.frameId}:${f.id}`, context: f.context.replace(/\s+/g, ' ').slice(0, 200) }))
      .filter((f) => (!wanted || wanted.has(f.field_id)) && !counts.has(f.field_id)),
  );
  const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  return { missing, duplicates };
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
    return { ...it, questionText: questionLine(f.context), page: f.page, ...(withValue && f.value ? { studentAnswer: f.value } : {}) };
  });
}
