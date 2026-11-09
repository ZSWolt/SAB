export type FieldKind = 'text' | 'textarea' | 'richtext' | 'radio' | 'checkbox' | 'select';

/** An answerable field the reader found in one frame. `id` is local to that frame. */
export interface FieldInfo {
  id: string;
  kind: FieldKind;
  /** Text around the field: the question it belongs to. */
  context: string;
  /** Option labels, for radio / checkbox / select. */
  options?: string[];
  /** What is already filled in. */
  value?: string;
  /** Page number, when the task has page buttons (1, 2, 3…) and all pages were read. */
  page?: number;
}

export interface StoryInfo {
  text: string;
  /** Why it was picked: 'hint' (class/id), 'frame' (separate frame), 'side' (right side panel), 'manual'. */
  source: string;
  title?: string;
}

export interface VideoInfo {
  /** Normalized https://www.youtube.com/watch?v=ID */
  url: string;
  title?: string;
}

/** A PDF / Google Doc / Drive file linked or embedded in the task (often the story). */
export interface DocumentRef {
  /** The link as it appears on the page. */
  url: string;
  /** Where to download it from (e.g. the Google Docs text export). */
  fetchUrl: string;
  kind: 'pdf' | 'gdoc' | 'drive';
  title: string;
  /** Embedded in the page (iframe/embed) rather than just linked. */
  embedded: boolean;
}

/** Everything the reader got from one frame. */
export interface FrameSnapshot {
  url: string;
  title: string;
  isTop: boolean;
  adapter: string;
  fields: FieldInfo[];
  story?: StoryInfo;
  fullText: string;
  videos: VideoInfo[];
  documents: DocumentRef[];
  /** How many pages were read (page buttons at the bottom of the task). */
  pages?: number;
}

/** A frame snapshot after the background tagged it with its frame id. */
export interface TaggedSnapshot extends FrameSnapshot {
  frameId: number;
}

export interface Answer {
  question: string;
  part: string;
  answer: string;
  /** "<frameId>:<localId>" or null when no field matches. */
  field_id: string | null;
  /** For choice fields: the exact option label to pick. */
  option: string | null;
}

export interface Source {
  title: string;
  url: string;
}

export interface SolveResult {
  answers: Answer[];
  sources: Source[];
  notes: string;
  model: string;
  searches: string[];
  /** Videos Gemini watched, and ones it couldn't. */
  videos: { url: string; ok: boolean; message?: string }[];
  /** Documents (PDF / Google Docs) that were read, and ones that couldn't be. */
  documents?: { title: string; url: string; ok: boolean; message?: string }[];
  /** Fields on the page that got no answer. */
  missing?: { field_id: string; context: string }[];
  /** Fields that got more than one answer. */
  duplicates?: string[];
  /** The story came from an earlier page of the same task. */
  storyFromMemory?: boolean;
  /** Approximate cost in USD. */
  costUsd: number;
}

export interface FillItem {
  fieldId: string;
  value: string;
  option: string | null;
}

export interface FillOutcome {
  fieldId: string;
  ok: boolean;
  message?: string;
}

export interface SolveRequest {
  mode: 'solve' | 'review';
  note: string;
  manualStory: string;
  screenshot: string | null;
  /** Answer only these fields ("complete the missing ones"). */
  onlyFields?: string[];
  /** Solve again even if this page was already solved. */
  force?: boolean;
}

export interface ReviewItem {
  question: string;
  part: string;
  field_id: string | null;
  /** 0–100 */
  grade: number;
  correct: string;
  missing: string;
  improved: string;
}

export interface ReviewResult {
  items: ReviewItem[];
  overall: string;
  sources: Source[];
  model: string;
  searches: string[];
  costUsd: number;
}

/** One task in the history list. */
export interface TaskSummary {
  key: string;
  title: string;
  url: string;
  pages: number;
  answers: number;
  costUsd: number;
  updatedAt: number;
}

/** Messages the background sends back on the solve port. */
export type PortMessage =
  | { type: 'status'; text: string }
  | { type: 'search'; query: string }
  | { type: 'thinking'; text: string }
  | { type: 'scan'; fields: number; story: boolean; frames: number; opener: boolean; videos: number; documents: number; pages: number }
  | { type: 'cached'; result: SolveResult; at: number }
  | { type: 'review'; review: ReviewResult }
  | { type: 'result'; result: SolveResult }
  | { type: 'error'; message: string };
