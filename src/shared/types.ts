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
}

export interface StoryInfo {
  text: string;
  /** Why it was picked: 'hint' (class/id), 'frame' (separate frame), 'side' (right side panel), 'manual'. */
  source: string;
  title?: string;
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
  note: string;
  manualStory: string;
  screenshot: string | null;
}

/** Messages the background sends back on the solve port. */
export type PortMessage =
  | { type: 'status'; text: string }
  | { type: 'search'; query: string }
  | { type: 'thinking'; text: string }
  | { type: 'scan'; fields: number; story: boolean; frames: number; opener: boolean }
  | { type: 'result'; result: SolveResult }
  | { type: 'error'; message: string };
