export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface Settings {
  apiKey: string;
  model: string;
  effort: Effort;
  autoFill: boolean;
  answerLength: 'short' | 'normal' | 'long';
  extraInstructions: string;
  /** A few paragraphs the student wrote, so answers sound like them. */
  styleSample: string;
  /** Dev / tests only: point the SDK at another server. */
  apiBaseUrl: string;
  /** Google AI Studio key, used only to watch videos. Empty = videos are skipped. */
  geminiApiKey: string;
  geminiModel: string;
  /** Dev / tests only. */
  geminiBaseUrl: string;
}

export const GEMINI_MODELS: { id: string; label: string; free: boolean; inPerM: number; outPerM: number }[] = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash – מומלץ (יש בחינם)', free: true, inPerM: 0.75, outPerM: 3.75 },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite – הכי זול (יש בחינם)', free: true, inPerM: 0.3, outPerM: 2.5 },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro – הכי מדויק (בתשלום בלבד)', free: false, inPerM: 2, outPerM: 12 },
];

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
  styleSample: '',
  apiBaseUrl: '',
  geminiApiKey: '',
  geminiModel: 'gemini-3.8-flash',
  geminiBaseUrl: '',
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
