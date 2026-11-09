import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessageParam,
  BetaToolUnion,
  BetaUsage,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { MODELS, type Settings } from '../shared/settings';
import type { Answer, SolveResult, Source } from '../shared/types';

export interface SolveCallbacks {
  onSearch(query: string): void;
  onThinking(text: string): void;
  onStatus(text: string): void;
}

const ANSWER_TOOL: BetaToolUnion = {
  name: 'submit_answers',
  description:
    'מגיש את כל התשובות למשימה. קרא לכלי הזה פעם אחת בסוף, אחרי שבדקת עובדות, עם תשובה לכל שאלה ולכל סעיף.',
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['answers', 'sources', 'notes'],
    properties: {
      answers: {
        type: 'array',
        description: 'תשובה לכל שאלה/סעיף, לפי הסדר בדף.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['question', 'part', 'answer', 'field_id', 'option'],
          properties: {
            question: { type: 'string', description: 'מספר/כותרת השאלה כמו בדף, למשל "שאלה 2".' },
            part: { type: 'string', description: 'הסעיף, למשל "א" – או מחרוזת ריקה.' },
            answer: { type: 'string', description: 'התשובה המלאה, טקסט רגיל בלי markdown.' },
            field_id: { type: ['string', 'null'], description: 'id של השדה מרשימת fields, או null.' },
            option: { type: ['string', 'null'], description: 'בשאלות בחירה: הנוסח המדויק של האפשרות הנכונה. אחרת null.' },
          },
        },
      },
      sources: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'url'],
          properties: { title: { type: 'string' }, url: { type: 'string' } },
        },
      },
      notes: { type: 'string', description: 'הערות קצרות לתלמיד (מה לא היה ברור). מחרוזת ריקה אם אין.' },
    },
  },
};

const WEB_SEARCH: BetaToolUnion = {
  type: 'web_search_20260209',
  name: 'web_search',
  max_uses: 8,
  user_location: { type: 'approximate', country: 'IL', timezone: 'Asia/Jerusalem' },
};

function isAnswer(a: unknown): a is Answer {
  const x = a as Record<string, unknown>;
  return (
    !!x &&
    typeof x.answer === 'string' &&
    typeof x.question === 'string' &&
    typeof x.part === 'string' &&
    (x.field_id === null || typeof x.field_id === 'string') &&
    (x.option === null || typeof x.option === 'string')
  );
}

/** Validates the tool input: the streamed JSON can come back cut off. */
export function parseAnswers(input: unknown): { answers: Answer[]; sources: Source[]; notes: string } | null {
  const x = input as Record<string, unknown>;
  if (!x || !Array.isArray(x.answers) || !x.answers.every(isAnswer)) return null;
  const sources = Array.isArray(x.sources)
    ? (x.sources as Source[]).filter((s) => s && typeof s.url === 'string' && /^https?:\/\//.test(s.url))
    : [];
  return { answers: x.answers, sources, notes: typeof x.notes === 'string' ? x.notes : '' };
}

function cost(model: string, usage: BetaUsage | undefined, searches: number): number {
  const m = MODELS.find((x) => x.id === model) ?? MODELS[0];
  if (!usage) return 0;
  const input = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) * 1.25 + (usage.cache_read_input_tokens ?? 0) * 0.1;
  return (input * m.inPerM + (usage.output_tokens ?? 0) * m.outPerM) / 1e6 + searches * 0.01;
}

function friendlyError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'מפתח ה-API לא תקין. תבדוק אותו בהגדרות (⚙️).';
  if (e instanceof Anthropic.PermissionDeniedError) return 'למפתח הזה אין הרשאה למודל. תבחר מודל אחר בהגדרות.';
  if (e instanceof Anthropic.RateLimitError) return 'יותר מדי בקשות כרגע – תחכה דקה ותנסה שוב.';
  if (e instanceof Anthropic.BadRequestError) {
    const msg = e.message ?? '';
    if (/credit|balance|billing/i.test(msg)) return 'נגמר הקרדיט בחשבון Anthropic. צריך להטעין ב-console.anthropic.com.';
    return `הבקשה נדחתה: ${msg}`;
  }
  if (e instanceof Anthropic.InternalServerError) return 'השרת של Claude עמוס כרגע. תנסה שוב עוד רגע.';
  if (e instanceof Anthropic.APIConnectionError) return 'אין חיבור ל-Claude. תבדוק את האינטרנט.';
  if (e instanceof Anthropic.APIUserAbortError) return 'בוטל.';
  if (e instanceof Anthropic.APIError) return `שגיאה מ-Claude: ${e.message}`;
  return `שגיאה: ${e instanceof Error ? e.message : String(e)}`;
}

export class SolveError extends Error {}

export async function solveWithClaude(
  settings: Settings,
  system: string,
  userContent: BetaContentBlockParam[],
  cb: SolveCallbacks,
  signal?: AbortSignal,
): Promise<SolveResult> {
  const client = new Anthropic({
    apiKey: settings.apiKey,
    dangerouslyAllowBrowser: true,
    baseURL: settings.apiBaseUrl || undefined,
    maxRetries: 2,
  });
  const messages: BetaMessageParam[] = [{ role: 'user', content: userContent }];
  const searches: string[] = [];
  const searchSources: Source[] = [];
  let totalCost = 0;
  let finalModel = settings.model;

  try {
    // pause_turn: the server paused a long search turn; send it back to let it continue.
    for (let round = 0; round < 6; round++) {
      const stream = client.beta.messages.stream(
        {
          model: settings.model,
          max_tokens: 32000,
          system,
          messages,
          tools: [WEB_SEARCH, ANSWER_TOOL],
          tool_choice: { type: 'auto' },
          thinking: { type: 'adaptive', display: 'summarized' },
          output_config: { effort: settings.effort },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        },
        { signal },
      );
      stream.on('thinking', (_d, snapshot) => cb.onThinking(snapshot));
      stream.on('contentBlock', (block: BetaContentBlock) => {
        if (block.type === 'server_tool_use' && block.name === 'web_search') {
          const q = (block.input as { query?: string })?.query;
          if (q) {
            searches.push(q);
            cb.onSearch(q);
          }
        } else if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
          for (const r of block.content) searchSources.push({ title: r.title, url: r.url });
        } else if (block.type === 'tool_use' && block.name === 'submit_answers') {
          cb.onStatus('כותב את התשובות…');
        }
      });

      const msg = await stream.finalMessage();
      finalModel = msg.model;
      totalCost += cost(msg.model, msg.usage, 0);

      if (msg.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: msg.content as BetaContentBlockParam[] });
        cb.onStatus('ממשיך לחפש…');
        continue;
      }
      if (msg.stop_reason === 'refusal') {
        throw new SolveError('Claude סירב לענות על הבקשה הזאת. נסה לנסח אחרת או לבחור רק חלק מהשאלות.');
      }

      const tool = msg.content.find((b) => b.type === 'tool_use' && b.name === 'submit_answers');
      if (msg.stop_reason === 'max_tokens' && tool) {
        throw new SolveError('התשובה נחתכה כי היא ארוכה מדי. נסה "תשובות קצרות" בהגדרות או לפתור חלק מהשאלות.');
      }
      if (tool && tool.type === 'tool_use') {
        const parsed = parseAnswers(tool.input);
        if (!parsed) throw new SolveError('התשובה חזרה בפורמט לא תקין. תנסה שוב.');
        // Prefer the sources Claude says it relied on; otherwise list what the searches returned.
        const sources = dedupeSources(parsed.sources.length ? parsed.sources : searchSources);
        return {
          ...parsed,
          sources: sources.slice(0, 12),
          model: finalModel,
          searches,
          videos: [],
          costUsd: totalCost + searches.length * 0.01,
        };
      }

      // No tool call: fall back to the plain text as one answer.
      const text = msg.content
        .filter((b) => b.type === 'text')
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('\n')
        .trim();
      if (text) {
        return {
          answers: [{ question: 'תשובה', part: '', answer: text, field_id: null, option: null }],
          sources: dedupeSources(searchSources).slice(0, 12),
          notes: 'התשובה חזרה כטקסט ולא שויכה לשדות – תעתיק ידנית.',
          model: finalModel,
          searches,
          videos: [],
          costUsd: totalCost + searches.length * 0.01,
        };
      }
      throw new SolveError('לא התקבלה תשובה. תנסה שוב.');
    }
    throw new SolveError('החיפוש לקח יותר מדי זמן. תנסה שוב או תצמצם את השאלה.');
  } catch (e) {
    if (e instanceof SolveError) throw e;
    throw new SolveError(friendlyError(e));
  }
}

function dedupeSources(list: Source[]): Source[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = s.url.replace(/[#?].*$/, '');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Cheap call used by the "test connection" button in the options page. */
export async function testKey(settings: Settings): Promise<string> {
  const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true, baseURL: settings.apiBaseUrl || undefined });
  try {
    const m = await client.models.retrieve(settings.model);
    return `✅ החיבור עובד (${m.display_name})`;
  } catch (e) {
    return `❌ ${friendlyError(e)}`;
  }
}
