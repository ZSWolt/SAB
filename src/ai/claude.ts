import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessageParam,
  BetaToolUnion,
  BetaUsage,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { MODELS, type Settings } from '../shared/settings';
import type { Answer, ReviewItem, ReviewResult, SolveResult, Source } from '../shared/types';

export interface SolveCallbacks {
  onSearch(query: string): void;
  onThinking(text: string): void;
  onStatus(text: string): void;
  /** Live text as Claude writes it (used by the chat). */
  onText?(delta: string): void;
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

const SOURCES_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'url'],
    properties: { title: { type: 'string' }, url: { type: 'string' } },
  },
};

const REVIEW_TOOL: BetaToolUnion = {
  name: 'submit_review',
  description: 'מגיש את הבדיקה של התשובות שהתלמיד כתב: ציון, מה נכון, מה חסר וגרסה משופרת לכל תשובה.',
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'overall', 'sources'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['question', 'part', 'field_id', 'grade', 'correct', 'missing', 'improved'],
          properties: {
            question: { type: 'string' },
            part: { type: 'string' },
            field_id: { type: ['string', 'null'] },
            grade: { type: 'integer', description: 'ציון 0–100 לפי מחוון בגרות' },
            correct: { type: 'string', description: 'מה טוב ונכון בתשובה' },
            missing: { type: 'string', description: 'מה חסר או שגוי. מחרוזת ריקה אם אין.' },
            improved: { type: 'string', description: 'גרסה משופרת שהייתה מקבלת ניקוד מלא, בסגנון של התלמיד' },
          },
        },
      },
      overall: { type: 'string' },
      sources: SOURCES_SCHEMA,
    },
  },
};

const UPDATE_TOOL: BetaToolUnion = {
  name: 'update_answers',
  description:
    'מעדכן תשובות קיימות במשימה (או מוסיף תשובה לשאלה שחסרה) לפי בקשת התלמיד. רק כשהתלמיד ביקש לשנות, לקצר, לתרגם או להשלים תשובה. כל פריט עם ה-field_id של השדה.',
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['answers'],
    properties: {
      answers: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['question', 'part', 'answer', 'field_id', 'option'],
          properties: {
            question: { type: 'string' },
            part: { type: 'string' },
            answer: { type: 'string', description: 'התשובה החדשה, טקסט רגיל' },
            field_id: { type: ['string', 'null'] },
            option: { type: ['string', 'null'] },
          },
        },
      },
    },
  },
};

const WEB_SEARCH: BetaToolUnion = {
  type: 'web_search_20260209',
  name: 'web_search',
  max_uses: 8,
  // No user_location: web search rejects country "IL". The prompt says the student is in Israel.
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

function isReviewItem(a: unknown): a is ReviewItem {
  const x = a as Record<string, unknown>;
  return (
    !!x &&
    typeof x.question === 'string' &&
    typeof x.part === 'string' &&
    (x.field_id === null || typeof x.field_id === 'string') &&
    typeof x.grade === 'number' &&
    typeof x.correct === 'string' &&
    typeof x.missing === 'string' &&
    typeof x.improved === 'string'
  );
}

export function parseReview(input: unknown): { items: ReviewItem[]; overall: string; sources: Source[] } | null {
  const x = input as Record<string, unknown>;
  if (!x || !Array.isArray(x.items) || !x.items.every(isReviewItem)) return null;
  const items = (x.items as ReviewItem[]).map((i) => ({ ...i, grade: Math.max(0, Math.min(100, Math.round(i.grade))) }));
  const sources = Array.isArray(x.sources)
    ? (x.sources as Source[]).filter((s) => s && typeof s.url === 'string' && /^https?:\/\//.test(s.url))
    : [];
  return { items, overall: typeof x.overall === 'string' ? x.overall : '', sources };
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
  if (e instanceof Anthropic.AuthenticationError) return 'מפתח ה-API לא תקין. תבדוק אותו בהגדרות';
  if (e instanceof Anthropic.PermissionDeniedError) return 'למפתח הזה אין הרשאה למודל. תבחר מודל אחר בהגדרות.';
  if (e instanceof Anthropic.RateLimitError) return 'יותר מדי בקשות כרגע. תחכה דקה ותנסה שוב';
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

interface RunOutput {
  /** Input of the final tool call, or null if Claude answered in plain text. */
  toolInput: unknown;
  text: string;
  model: string;
  searches: string[];
  searchSources: Source[];
  costUsd: number;
}

/**
 * One Claude run with web search: streams, follows pause_turn, handles refusal / max_tokens, and
 * returns the input of the given tool (submit_answers / submit_review).
 */
async function runClaude(
  settings: Settings,
  system: string,
  userContent: BetaContentBlockParam[],
  tool: BetaToolUnion,
  cb: SolveCallbacks,
  signal?: AbortSignal,
  history?: BetaMessageParam[],
): Promise<RunOutput> {
  const toolName = (tool as { name: string }).name;
  const client = new Anthropic({
    apiKey: settings.apiKey,
    dangerouslyAllowBrowser: true,
    baseURL: settings.apiBaseUrl || undefined,
    maxRetries: 2,
  });
  const messages: BetaMessageParam[] = history ? [...history] : [{ role: 'user', content: userContent }];
  const searches: string[] = [];
  const searchSources: Source[] = [];
  let totalCost = 0;

  try {
    // pause_turn: the server paused a long search turn; send it back to let it continue.
    for (let round = 0; round < 6; round++) {
      const stream = client.beta.messages.stream(
        {
          model: settings.model,
          max_tokens: 32000,
          system,
          messages,
          tools: [WEB_SEARCH, tool],
          tool_choice: { type: 'auto' },
          thinking: { type: 'adaptive', display: 'summarized' },
          output_config: { effort: settings.effort },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        },
        { signal },
      );
      stream.on('thinking', (_d, snapshot) => cb.onThinking(snapshot));
      if (cb.onText) stream.on('text', (delta) => cb.onText!(delta));
      stream.on('contentBlock', (block: BetaContentBlock) => {
        if (block.type === 'server_tool_use' && block.name === 'web_search') {
          const q = (block.input as { query?: string })?.query;
          if (q) {
            searches.push(q);
            cb.onSearch(q);
          }
        } else if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
          for (const r of block.content) searchSources.push({ title: r.title, url: r.url });
        } else if (block.type === 'tool_use' && block.name === toolName) {
          cb.onStatus('כותב את התשובות');
        }
      });

      const msg = await stream.finalMessage();
      totalCost += cost(msg.model, msg.usage, 0);

      if (msg.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: msg.content as BetaContentBlockParam[] });
        cb.onStatus('ממשיך לחפש');
        continue;
      }
      if (msg.stop_reason === 'refusal') {
        throw new SolveError('Claude סירב לענות על הבקשה הזאת. נסה לנסח אחרת או לבחור רק חלק מהשאלות.');
      }
      const call = msg.content.find((b) => b.type === 'tool_use' && b.name === toolName);
      if (msg.stop_reason === 'max_tokens' && call) {
        throw new SolveError('התשובה נחתכה כי היא ארוכה מדי. נסה "תשובות קצרות" בהגדרות או לפתור חלק מהשאלות.');
      }
      const text = msg.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('\n')
        .trim();
      return {
        toolInput: call && call.type === 'tool_use' ? call.input : null,
        text,
        model: msg.model,
        searches,
        searchSources,
        costUsd: totalCost + searches.length * 0.01,
      };
    }
    throw new SolveError('החיפוש לקח יותר מדי זמן. תנסה שוב או תצמצם את השאלה.');
  } catch (e) {
    if (e instanceof SolveError) throw e;
    throw new SolveError(friendlyError(e));
  }
}

export async function solveWithClaude(
  settings: Settings,
  system: string,
  userContent: BetaContentBlockParam[],
  cb: SolveCallbacks,
  signal?: AbortSignal,
): Promise<SolveResult> {
  const out = await runClaude(settings, system, userContent, ANSWER_TOOL, cb, signal);
  if (out.toolInput !== null) {
    const parsed = parseAnswers(out.toolInput);
    if (!parsed) throw new SolveError('התשובה חזרה בפורמט לא תקין. תנסה שוב.');
    // Prefer the sources Claude says it relied on; otherwise list what the searches returned.
    const sources = dedupeSources(parsed.sources.length ? parsed.sources : out.searchSources);
    return { ...parsed, sources: sources.slice(0, 12), model: out.model, searches: out.searches, videos: [], costUsd: out.costUsd };
  }
  if (out.text) {
    // No tool call: fall back to the plain text as one answer.
    return {
      answers: [{ question: 'תשובה', part: '', answer: out.text, field_id: null, option: null }],
      sources: dedupeSources(out.searchSources).slice(0, 12),
      notes: 'התשובה חזרה כטקסט ולא שויכה לשדות, אז צריך להעתיק ידנית',
      model: out.model,
      searches: out.searches,
      videos: [],
      costUsd: out.costUsd,
    };
  }
  throw new SolveError('לא התקבלה תשובה. תנסה שוב.');
}

export async function reviewWithClaude(
  settings: Settings,
  system: string,
  userContent: BetaContentBlockParam[],
  cb: SolveCallbacks,
  signal?: AbortSignal,
): Promise<ReviewResult> {
  const out = await runClaude(settings, system, userContent, REVIEW_TOOL, cb, signal);
  const parsed = out.toolInput !== null ? parseReview(out.toolInput) : null;
  if (!parsed) throw new SolveError(out.text ? `הבדיקה חזרה בלי ציונים:\n${out.text}` : 'הבדיקה חזרה בפורמט לא תקין. תנסה שוב.');
  return {
    ...parsed,
    sources: dedupeSources(parsed.sources.length ? parsed.sources : out.searchSources).slice(0, 12),
    model: out.model,
    searches: out.searches,
    costUsd: out.costUsd,
  };
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
    return `החיבור עובד · ${m.display_name}`;
  } catch (e) {
    return friendlyError(e);
  }
}

export interface ChatReply {
  text: string;
  answers: Answer[];
  costUsd: number;
}

/** One chat turn: Claude answers in text, and may call update_answers to change answers. */
export async function chatWithClaude(
  settings: Settings,
  system: string,
  messages: BetaMessageParam[],
  cb: SolveCallbacks,
  signal?: AbortSignal,
): Promise<ChatReply> {
  const out = await runClaude(settings, system, [], UPDATE_TOOL, cb, signal, messages);
  const input = out.toolInput as { answers?: unknown[] } | null;
  const answers = Array.isArray(input?.answers) ? (input!.answers.filter(isAnswer) as Answer[]) : [];
  if (!out.text && !answers.length) throw new SolveError('לא התקבלה תשובה. תנסה שוב.');
  return { text: out.text || (answers.length === 1 ? 'עדכנתי את התשובה.' : `עדכנתי ${answers.length} תשובות.`), answers, costUsd: out.costUsd };
}
