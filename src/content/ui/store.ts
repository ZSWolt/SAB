import type { DocumentRef, ReviewResult, SolveResult, StepId, StepState, StoryInfo, TaskSummary } from '../../shared/types';
import type { Settings } from '../../shared/settings';

/** One line in the "working" list. */
export interface Step {
  id: StepId;
  state: StepState;
  label: string;
  meta?: string;
}

/** What the quick look (no page clicking) found on the page. */
export interface ScanSummary {
  fields: number;
  pages: number;
  story: StoryInfo | null;
  docs: DocumentRef[];
  videos: number;
  opener: boolean;
  open: number;
  choice: number;
}

export type ThemeName = 'notebook' | 'focus' | 'school';
export type View = 'idle' | 'working' | 'results' | 'review';
export type Sheet = null | 'story' | 'history' | 'settings';

export interface UIState {
  view: View;
  sheet: Sheet;
  mode: 'solve' | 'review';
  busy: boolean;
  steps: Step[];
  /** Latest free-text status (retries, thinking). */
  status: string;
  error: string | null;
  result: SolveResult | null;
  review: ReviewResult | null;
  /** When the shown answers were saved earlier (already solved page / history), or null. */
  savedAt: number | null;
  savedElsewhere: boolean;
  scan: ScanSummary | null;
  scanning: boolean;
  scanOpen: boolean;
  openRow: number;
  /** Fill outcome per field id. */
  filled: Record<string, { ok: boolean; message?: string }>;
  hasKey: boolean;
  keyStatus: string;
  theme: ThemeName;
  settings: Pick<Settings, 'theme' | 'answerLength' | 'autoFill' | 'readAllPages'>;
  history: { tasks: TaskSummary[]; monthCost: number } | null;
}

export const STEP_ORDER: StepId[] = ['pages', 'story', 'videos', 'search', 'write'];

export function initialState(): UIState {
  return {
    view: 'idle',
    sheet: null,
    mode: 'solve',
    busy: false,
    steps: [],
    status: '',
    error: null,
    result: null,
    review: null,
    savedAt: null,
    savedElsewhere: false,
    scan: null,
    scanning: false,
    scanOpen: false,
    openRow: 0,
    filled: {},
    hasKey: true,
    keyStatus: '',
    theme: 'notebook',
    settings: { theme: 'auto', answerLength: 'normal', autoFill: false, readAllPages: true },
    history: null,
  };
}

/** Adds or replaces a step, keeping the fixed order. */
export function upsertStep(steps: Step[], next: Step): Step[] {
  const others = steps.filter((s) => s.id !== next.id);
  return [...others, next].sort((a, b) => STEP_ORDER.indexOf(a.id) - STEP_ORDER.indexOf(b.id));
}

/** auto → notebook in light mode, focus (dark) in dark mode. */
export function resolveTheme(setting: Settings['theme'], prefersDark: boolean): ThemeName {
  if (setting === 'auto') return prefersDark ? 'focus' : 'notebook';
  return setting;
}

export interface Store {
  get(): UIState;
  set(patch: Partial<UIState> | ((s: UIState) => Partial<UIState>)): void;
  subscribe(fn: (s: UIState, prev: UIState) => void): () => void;
}

export function createStore(initial: UIState = initialState()): Store {
  let state = initial;
  const subs = new Set<(s: UIState, prev: UIState) => void>();
  return {
    get: () => state,
    set(patch) {
      const prev = state;
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      subs.forEach((fn) => fn(state, prev));
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
