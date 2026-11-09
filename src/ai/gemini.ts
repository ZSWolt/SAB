import { GEMINI_MODELS, type Settings } from '../shared/settings';

/**
 * Watches a YouTube video with Gemini (sees the picture and hears the sound) and returns a detailed
 * description, which is then given to Claude as context. Uses the Gemini Interactions REST API.
 */

export class VideoError extends Error {}

export interface VideoAnalysis {
  text: string;
  costUsd: number;
}

function videoPrompt(questions: string): string {
  return `אתה צופה בסרטון עבור תלמיד תיכון שצריך לענות על שאלות עליו. כתוב בעברית.
תן תיאור מלא ומדויק, כי מי שיקרא אותו לא יראה את הסרטון:
1. סיכום קצר: על מה הסרטון, מי מופיע בו, ומה המסר.
2. ציר זמן מפורט (עם זמנים בפורמט דקה:שנייה): מה רואים (סצנות, אנשים, פעולות, מקומות, טקסט/כתוביות/גרפים על המסך) ומה שומעים (מה אומרים – כולל ציטוטים מדויקים של משפטים חשובים, מי אומר, מוזיקה, קולות רקע, טון הדיבור ורגשות).
3. פרטים שקשורים לשאלות למטה – תכתוב את כל מה שבסרטון יכול לעזור לענות עליהן (בלי לענות במקום התלמיד).
אל תמציא: אם משהו לא ברור בסרטון, תכתוב שהוא לא ברור.

השאלות במשימה:
${questions.slice(0, 6000) || '(לא ידוע – תתאר את כל הסרטון)'}`;
}

/** Collects the model's text from an Interactions API response. */
export function interactionText(res: unknown): string {
  const r = res as Record<string, unknown>;
  if (typeof r?.output_text === 'string') return r.output_text;
  const steps = Array.isArray(r?.steps) ? (r.steps as Record<string, unknown>[]) : [];
  const pick = (s: Record<string, unknown>[]) =>
    s
      .flatMap((step) => (Array.isArray(step.content) ? (step.content as Record<string, unknown>[]) : []))
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string)
      .join('\n')
      .trim();
  const outputs = steps.filter((s) => s.type === 'model_output');
  return pick(outputs.length ? outputs : steps);
}

function usageCost(model: string, res: unknown): number {
  const m = GEMINI_MODELS.find((x) => x.id === model);
  const u = (res as { usage?: Record<string, number> })?.usage;
  if (!m || !u) return 0;
  const input = u.total_input_tokens ?? u.input_tokens ?? 0;
  const output = (u.total_output_tokens ?? u.output_tokens ?? 0) + (u.total_thought_tokens ?? 0);
  return (input * m.inPerM + output * m.outPerM) / 1e6;
}

async function friendly(res: Response): Promise<string> {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message ?? '';
  } catch {
    /* ignore */
  }
  if (res.status === 400 && /api key/i.test(detail)) return 'מפתח Gemini לא תקין – תבדוק בהגדרות.';
  if (res.status === 401 || res.status === 403) return 'מפתח Gemini לא תקין או בלי הרשאה – תבדוק בהגדרות.';
  if (res.status === 429)
    return 'הגעת למגבלה של Gemini (בחינם יש מגבלה ליום ולדקה). תנסה עוד מעט, או תפעיל תשלום ב-AI Studio.';
  if (/private|unlisted|not.*(public|available)|permission/i.test(detail))
    return 'Gemini לא יכול לצפות בסרטון הזה – הוא כנראה פרטי או לא רשום (Unlisted). רק סרטונים ציבוריים עובדים.';
  if (res.status === 404) return 'המודל של Gemini לא נמצא – תבחר מודל אחר בהגדרות.';
  if (res.status === 503 || res.status === 500 || res.status === 502 || res.status === 504)
    return 'השרתים של Gemini עמוסים כרגע (זה זמני). תנסה שוב עוד כמה דקות – או תבחר מודל אחר בהגדרות.';
  return `שגיאה מ-Gemini (${res.status})${detail ? `: ${detail}` : ''}`;
}

/** Overloaded / temporary errors worth retrying (and then trying another model). */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [2000, 6000];
/** When the chosen model is overloaded, these run on separate capacity. */
const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];

class RetryableError extends VideoError {}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new VideoError('בוטל.'));
    });
  });

async function watchOnce(settings: Settings, model: string, url: string, questions: string, signal?: AbortSignal): Promise<VideoAnalysis> {
  const base = (settings.geminiBaseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/v1beta/interactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': settings.geminiApiKey },
      body: JSON.stringify({
        model,
        input: [
          { type: 'video', uri: url },
          { type: 'text', text: videoPrompt(questions) },
        ],
      }),
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw new VideoError('בוטל.');
    throw new RetryableError('אין חיבור ל-Gemini. תבדוק את האינטרנט.');
  }
  if (!res.ok) {
    const msg = await friendly(res);
    throw RETRYABLE.has(res.status) ? new RetryableError(msg) : new VideoError(msg);
  }
  const body = await res.json();
  const text = interactionText(body);
  if (!text) throw new VideoError('Gemini לא החזיר תיאור של הסרטון.');
  return { text, costUsd: usageCost(model, body) };
}

/**
 * Watches the video with the chosen model; on "overloaded" errors retries a couple of times, then
 * tries a fallback model (Google's free tier has a separate quota per model).
 */
export async function watchVideo(
  settings: Settings,
  url: string,
  questions: string,
  signal?: AbortSignal,
  onRetry?: (text: string) => void,
): Promise<VideoAnalysis & { model: string }> {
  const models = [settings.geminiModel, ...FALLBACK_MODELS.filter((m) => m !== settings.geminiModel)];
  let last: unknown;
  for (const [mi, model] of models.entries()) {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        return { ...(await watchOnce(settings, model, url, questions, signal)), model };
      } catch (e) {
        last = e;
        if (!(e instanceof RetryableError)) throw e;
        if (attempt < RETRY_DELAYS_MS.length) {
          onRetry?.(`Gemini עמוס כרגע – מנסה שוב בעוד ${RETRY_DELAYS_MS[attempt] / 1000} שניות…`);
          await sleep(RETRY_DELAYS_MS[attempt], signal);
        }
      }
    }
    if (mi < models.length - 1) onRetry?.(`${model} עמוס – עובר ל-${models[mi + 1]}…`);
  }
  throw last instanceof Error ? last : new VideoError('Gemini לא זמין כרגע. תנסה שוב עוד כמה דקות.');
}

/** Cached per video + model, so watching the same video twice costs nothing. */
export async function watchVideoCached(
  settings: Settings,
  url: string,
  questions: string,
  signal?: AbortSignal,
  onRetry?: (text: string) => void,
): Promise<VideoAnalysis & { cached: boolean }> {
  const key = `video:${settings.geminiModel}:${url}`;
  const got = await chrome.storage.local.get(key);
  const hit = got[key] as { text: string; at: number } | undefined;
  if (hit && Date.now() - hit.at < 30 * 24 * 3600 * 1000) return { text: hit.text, costUsd: 0, cached: true };
  const out = await watchVideo(settings, url, questions, signal, onRetry);
  await chrome.storage.local.set({ [key]: { text: out.text, at: Date.now() } });
  return { ...out, cached: false };
}

export async function testGeminiKey(settings: Settings): Promise<string> {
  const base = (settings.geminiBaseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/v1beta/models/${settings.geminiModel}`, {
      headers: { 'x-goog-api-key': settings.geminiApiKey },
    });
    if (res.ok) return '✅ Gemini מחובר';
    return `❌ ${await friendly(res)}`;
  } catch {
    return '❌ אין חיבור ל-Gemini';
  }
}
