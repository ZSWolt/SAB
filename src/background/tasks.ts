import type { StoryBlock } from '../ai/prompt';
import type { DocumentRef, SolveResult, TaggedSnapshot, TaskSummary } from '../shared/types';

/**
 * Task memory: remembers the story and the answers across pages of the same assignment, and keeps
 * a history so a page that was already solved doesn't have to be paid for again.
 */

export type { StoryBlock };

export interface TaskPage {
  url: string;
  fieldsHash: string;
  result: SolveResult;
  at: number;
}

export interface TaskRecord {
  key: string;
  title: string;
  url: string;
  stories: StoryBlock[];
  documents: DocumentRef[];
  pages: TaskPage[];
  costUsd: number;
  /** Cost per month, "YYYY-MM" → USD. */
  costByMonth?: Record<string, number>;
  updatedAt: number;
}

const MAX_TASKS = 50;

/** Same assignment → same key, across its pages. */
export function taskKey(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  const forms = u.hostname === 'docs.google.com' && u.pathname.match(/^\/forms\/(?:u\/\d+\/)?d\/(?:e\/)?([A-Za-z0-9_-]+)/);
  if (forms) return `gforms:${forms[1]}`;
  const attempt = u.searchParams.get('attempt');
  if (attempt) return `attempt:${u.hostname}:${attempt}`;
  const cmid = u.searchParams.get('cmid') ?? u.searchParams.get('id');
  if (cmid && /\/mod\//.test(u.pathname)) return `moodle:${u.hostname}:${cmid}`;
  return `${u.origin}${u.pathname}`;
}

/** A fingerprint of the questions on the page: same questions → same hash. */
export function fieldsHash(snaps: Pick<TaggedSnapshot, 'fields'>[]): string {
  const sig = snaps
    .flatMap((s) => s.fields.map((f) => `${f.kind}|${f.context.replace(/\s+/g, ' ').slice(0, 300)}|${(f.options ?? []).join('/')}`))
    .join('\n');
  if (!sig) return '';
  let h = 5381;
  for (let i = 0; i < sig.length; i++) h = ((h << 5) + h + sig.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(36)}:${sig.length}`;
}

async function all(): Promise<Record<string, TaskRecord>> {
  const got = await chrome.storage.local.get('tasks');
  return (got.tasks as Record<string, TaskRecord> | undefined) ?? {};
}

async function store(tasks: Record<string, TaskRecord>) {
  const list = Object.values(tasks).sort((a, b) => b.updatedAt - a.updatedAt);
  const kept = Object.fromEntries(list.slice(0, MAX_TASKS).map((t) => [t.key, t]));
  await chrome.storage.local.set({ tasks: kept });
}

export async function getTask(key: string): Promise<TaskRecord | null> {
  return (await all())[key] ?? null;
}

export function findPage(task: TaskRecord | null, hash: string): TaskPage | null {
  if (!task || !hash) return null;
  return task.pages.find((p) => p.fieldsHash === hash) ?? null;
}

const month = (t: number) => new Date(t).toISOString().slice(0, 7);

export async function savePage(
  key: string,
  info: { title: string; url: string; stories: StoryBlock[]; documents: DocumentRef[] },
  page: TaskPage,
  addedCost: number,
): Promise<void> {
  const tasks = await all();
  const prev = tasks[key];
  const pages = (prev?.pages ?? []).filter((p) => p.fieldsHash !== page.fieldsHash || !page.fieldsHash);
  pages.push(page);
  const costByMonth = { ...(prev?.costByMonth ?? {}) };
  costByMonth[month(page.at)] = (costByMonth[month(page.at)] ?? 0) + addedCost;
  tasks[key] = {
    key,
    title: prev?.title || info.title,
    url: info.url,
    // keep the first story we saw: later pages often don't show it
    stories: prev?.stories?.length ? prev.stories : info.stories,
    documents: prev?.documents?.length ? prev.documents : info.documents,
    pages: pages.slice(-30),
    costUsd: (prev?.costUsd ?? 0) + addedCost,
    costByMonth,
    updatedAt: page.at,
  };
  await store(tasks);
}

/** Adds cost that wasn't tied to a saved page (e.g. a "check me" run). */
export async function addCost(key: string, title: string, url: string, cost: number): Promise<void> {
  const tasks = await all();
  const now = Date.now();
  const prev = tasks[key] ?? { key, title, url, stories: [], documents: [], pages: [], costUsd: 0, updatedAt: now };
  const costByMonth = { ...(prev.costByMonth ?? {}) };
  costByMonth[month(now)] = (costByMonth[month(now)] ?? 0) + cost;
  tasks[key] = { ...prev, costUsd: prev.costUsd + cost, costByMonth, updatedAt: now };
  await store(tasks);
}

export async function listTasks(): Promise<{ tasks: TaskSummary[]; monthCost: number }> {
  const tasks = Object.values(await all()).sort((a, b) => b.updatedAt - a.updatedAt);
  const now = month(Date.now());
  return {
    tasks: tasks.map((t) => ({
      key: t.key,
      title: t.title,
      url: t.url,
      pages: t.pages.length,
      answers: t.pages.reduce((n, p) => n + p.result.answers.length, 0),
      costUsd: t.costUsd,
      updatedAt: t.updatedAt,
    })),
    monthCost: tasks.reduce((n, t) => n + (t.costByMonth?.[now] ?? 0), 0),
  };
}

export async function deleteTask(key: string): Promise<void> {
  const tasks = await all();
  delete tasks[key];
  await chrome.storage.local.set({ tasks });
}

/** A short "what was answered on earlier pages", for continuity. */
export function previousPagesSummary(task: TaskRecord | null, currentHash: string, limit = 6000): string {
  if (!task) return '';
  const lines: string[] = [];
  let size = 0;
  for (const p of task.pages) {
    if (p.fieldsHash && p.fieldsHash === currentHash) continue;
    for (const a of p.result.answers) {
      const line = `${[a.question, a.part].filter(Boolean).join(' ')}: ${a.option ? `[${a.option}] ` : ''}${a.answer.replace(/\s+/g, ' ').slice(0, 300)}`;
      if (size + line.length > limit) return lines.join('\n');
      lines.push(line);
      size += line.length;
    }
  }
  return lines.join('\n');
}
