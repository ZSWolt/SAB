import type { Settings } from '../../../shared/settings';
import type { Answer, ReviewItem } from '../../../shared/types';
import type { Kid } from '../dom';
import type { AnswersMode, Filter, Sheet, Tab } from '../store';

/** What the views can ask the panel to do. Views only draw; the panel does the work. */
export interface Actions {
  solve(): void;
  review(): void;
  stop(): void;
  showLast(): void;
  backToIdle(): void;
  toggleScan(): void;
  rescan(): void;
  toggleRow(i: number): void;
  fill(answers: Answer[]): void;
  replaceWithImproved(item: ReviewItem): void;
  undo(): void;
  copy(text: string): void;
  copyAll(): void;
  completeMissing(): void;
  solveAgain(): void;
  openSheet(s: Exclude<Sheet, null>): void;
  closeSheet(): void;
  saveKey(key: string): void;
  setSetting(patch: Partial<Settings>): void;
  openOptions(): void;
  openStoryBar(): void;
  pickStory(): void;
  exportStructure(): void;
  openHistory(key: string): void;
  deleteHistory(key: string): void;
  setTab(tab: Tab): void;
  /** Answers tab, showing the answers or the check-me grades. */
  openAnswers(mode: AnswersMode): void;
  setAnswersMode(mode: AnswersMode): void;
  setFilter(filter: Filter): void;
  sendChat(text: string): void;
  stopChat(): void;
  newChat(): void;
}

/** Values the student types: kept outside the store so redrawing never steals focus. */
export interface Drafts {
  note: string;
  shot: boolean;
  manualStory: string;
  chat: string;
}

export interface Rendered {
  /** Fixed area above the scrolling body (the dashboard's ring and counters). */
  top?: Kid;
  body: Kid;
  foot?: Kid;
}
