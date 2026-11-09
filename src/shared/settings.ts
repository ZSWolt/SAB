export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface Settings {
  apiKey: string;
  model: string;
  effort: Effort;
  autoFill: boolean;
  answerLength: 'short' | 'normal' | 'long';
  extraInstructions: string;
  /** Dev / tests only: point the SDK at another server. */
  apiBaseUrl: string;
}

export const MODELS: { id: string; label: string; inPerM: number; outPerM: number }[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 – הכי מדויק (מומלץ)', inPerM: 4, outPerM: 20 },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 – מהיר וזול יותר', inPerM: 2, outPerM: 10 },
];

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  model: 'claude-opus-5-5',
  effort: 'high',
  autoFill: false,
  answerLength: 'normal',
  extraInstructions: '',
  apiBaseUrl: '',
};

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored.settings ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}
