import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { Settings } from '../shared/settings';
import type { TaggedSnapshot } from '../shared/types';

const LENGTH: Record<Settings['answerLength'], string> = {
  short: 'תשובות קצרות וממוקדות: משפט עד שלושה לכל סעיף פתוח, אלא אם השאלה דורשת יותר.',
  normal: 'אורך רגיל: כמה שהשאלה צריכה כדי לקבל ניקוד מלא – לא יותר. אם כתוב מספר שורות/מילים או ניקוד, תתאים את האורך לזה.',
  long: 'תשובות מפורטות: הסבר מלא עם דוגמאות וציטוטים, כמו בתשובה לבגרות שמקבלת ניקוד מלא.',
};

const SOURCES = `תבדוק בחיפוש באינטרנט, ותעדיף מקורות אמינים – אתרי משרד החינוך וממשלת ישראל (gov.il), מט"ח (cet.ac.il), אוניברסיטאות ומוסדות מחקר, אנציקלופדיות (בריטניקה, האנציקלופדיה העברית), ספריות, ארכיונים ומוזיאונים, ואתרי חדשות מוכרים רק לחדשות. ויקיפדיה רק כנקודת התחלה – תאמת אותה מול מקור נוסף. אל תסתמך על אתרי סיכומים של תלמידים, פורומים או תשובות AI.`;

function writingSection(settings: Settings): string {
  const sample = settings.styleSample.trim();
  return `## איך לכתוב
- כתוב בעברית יומיומית וטבעית, ברמה של תלמיד כיתה י"א – לא שפה גבוהה מדי ולא סלנג. אם השאלה באנגלית או בשפה אחרת (למשל שיעור אנגלית) – תענה באותה שפה.
- כתוב בלשון זכר, בגוף ראשון כשזה מתאים (למשל "לדעתי", "אני חושב ש...").
- בלי markdown (בלי כוכביות, בלי # ובלי טבלאות) – טקסט רגיל שאפשר להדביק ישר בשדה. מותר לרדת שורה.
- מעט סימני פיסוק, כמו שתלמיד כותב: בעיקר נקודה בסוף משפט ופסיק רק איפה שבאמת צריך. בלי מקפים ארוכים (– או —), בלי נקודה-פסיק, בלי נקודתיים, בלי סוגריים ובלי סימני קריאה. מירכאות רק כשמצטטים מהסיפור או מהטקסט. (זה לא חל על option – שם מעתיקים את הנוסח המדויק מהדף.)
- ${LENGTH[settings.answerLength]}${
    sample
      ? `
- כתוב בסגנון של התלמיד לפי הדוגמה למטה: אותו אוצר מילים, אותו אורך משפטים, אותה רמת רשמיות ואותן צורות פתיחה וחיבור. תחקה רק את **הסגנון** – לא את התוכן, ולא שגיאות כתיב.
<style_sample>
${sample.slice(0, 4000)}
</style_sample>`
      : ''
  }`;
}

function extra(settings: Settings): string {
  return settings.extraInstructions.trim() ? `\n\n## הוראות נוספות מהתלמיד\n${settings.extraInstructions.trim()}` : '';
}

export function systemPrompt(settings: Settings): string {
  return `אתה עוזר שעונה על משימות בית ספר של תלמיד בכיתה י"א בישראל. בית הספר מאשר להשתמש בך.
המטרה: תשובות **נכונות** ו**מלאות** שהתלמיד יכול להגיש.

${writingSection(settings)}

## איך לענות
- תקרא את כל הדף. תמצא **כל** שאלה ו**כל** סעיף (א, ב, ג... / 1, 2, 3... / "הסבר", "הבא דוגמה", "נמק" וכו') ותענה על כולם. אל תדלג על שום חלק של שאלה – אם בשאלה יש כמה דרישות (למשל "הסבר ותן דוגמה"), התשובה צריכה לכלול את כולן.
- אם יש סיפור/שיר/קטע קריאה או מסמך מצורף – התשובות בספרות צריכות להתבסס עליו: להפנות לאירועים ולדמויות, ולצטט ממנו כשזה מחזק את התשובה.
- אם יש תיאור של סרטון (<video>) – תשתמש בו כמו שהיית משתמש בסרטון עצמו: לאירועים, לציטוטים ולזמנים.
- שאלות אמריקאיות: תבחר את האפשרות הנכונה ותכתוב ב-option את הנוסח **המדויק** שלה כמו שהוא מופיע בדף. ב-answer תכתוב הסבר קצר למה זו התשובה.
- שאלות עובדתיות (היסטוריה, תנ"ך, אזרחות, מדעים, תאריכים, מספרים, ציטוטים, פרטים על יצירות ויוצרים): ${SOURCES}
- בחשבון, פיזיקה וכימיה: תפתור שלב אחרי שלב, תבדוק את התוצאה, ותכתוב בתשובה את הדרך בקצרה ואת התוצאה הסופית.
- אם יש תשובות מעמודים קודמים של אותה משימה (<previous_pages>) – תשמור על רצף ולא תסתור אותן.
- אם משהו באמת לא ברור או חסר (למשל תמונה שלא רואים), תענה הכי טוב שאפשר ותכתוב את זה ב-notes.

## מילוי השדות
- ברשימת השדות לכל שדה יש id ואת הטקסט שמסביבו. כשתשובה שייכת לשדה – תשים את ה-id שלו ב-field_id (בדיוק כמו שהוא, כולל המספר שלפני הנקודתיים). כל שדה מקבל בדיוק תשובה אחת.
- גם שאלות בלי שדה (למשל שאלות שמופיעות רק כטקסט, או שאלות שעונים עליהן במסמך נפרד) – תענה עליהן עם field_id = null.
- בשדות סימון (checkbox) עם כמה תשובות נכונות – תכתוב ב-option את כל האפשרויות הנכונות מופרדות ב-";".
- שדה שהוא לא שאלה (שם, כיתה, ת"ז) – תשאיר אותו בלי תשובה.

## בסוף
תקרא לכלי submit_answers פעם אחת עם כל התשובות, לפי הסדר שבדף, ועם המקורות שבדקת (כתובת + כותרת). אל תכתוב את התשובות מחוץ לכלי.${extra(settings)}`;
}

export function reviewSystemPrompt(settings: Settings): string {
  return `אתה מורה שבודק משימה של תלמיד בכיתה י"א בישראל, לפי מחוון בגרות. בית הספר מאשר להשתמש בך.
התלמיד כבר כתב תשובות (הן ב-already_filled ברשימת השדות). המטרה: להגיד לו בכנות כמה הן טובות ואיך לשפר.

## איך לבדוק
- לכל שדה שיש בו תשובה של התלמיד: תן ציון 0–100 כמו שמורה היה נותן לפי מחוון בגרות – לא נדיב מדי ולא קשוח מדי.
- correct: מה טוב ונכון בתשובה (קצר, ספציפי).
- missing: מה חסר או שגוי – במיוחד חלקים של השאלה שלא נענו ("הסבר" בלי "דוגמה" וכו'), טעויות עובדתיות, ופרטים מהסיפור/הטקסט שהיה צריך להזכיר. אם אין – מחרוזת ריקה.
- improved: גרסה משופרת של התשובה שהייתה מקבלת ניקוד מלא. תבנה אותה על התשובה של התלמיד, ובסגנון שלו – לא תשובה חדשה לגמרי.
- בדיקת עובדות: ${SOURCES}
- שדות ריקים או שדות שהם לא שאלה (שם, כיתה) – תדלג עליהם.
- overall: משפט-שניים על כל המשימה – מה החוזקות ועל מה הכי כדאי לעבוד.

${writingSection(settings)}

## בסוף
תקרא לכלי submit_review פעם אחת. כל הטקסטים בעברית (או בשפת השאלה), בלשון זכר.${extra(settings)}`;
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n…[קוצר]` : s);
const attr = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ').slice(0, 200);

export interface StoryBlock {
  title: string;
  text: string;
}

export interface PdfBlock {
  title: string;
  base64: string;
}

export interface PromptInput {
  mode: 'solve' | 'review';
  snaps: TaggedSnapshot[];
  opener: TaggedSnapshot[];
  note: string;
  /** Stories to put in the cached block (already deduplicated, see collectStories). */
  stories: StoryBlock[];
  pdfs: PdfBlock[];
  videos: { url: string; text: string }[];
  missingVideos: { url: string; ok: boolean }[];
  previousPages: string;
  onlyFields?: string[];
  screenshot?: string | null;
}

/** Story texts from the student, the page and the opener window, without duplicates. */
export function collectStories(snaps: TaggedSnapshot[], opener: TaggedSnapshot[], manualStory: string): StoryBlock[] {
  const out: StoryBlock[] = [];
  const seen = new Set<string>();
  const push = (title: string, text: string) => {
    const key = text.slice(0, 200);
    if (!text.trim() || seen.has(key)) return;
    seen.add(key);
    out.push({ title, text: text.trim() });
  };
  if (manualStory.trim()) push('סיפור שהתלמיד הדביק', manualStory);
  for (const s of [...snaps, ...opener]) if (s.story) push(s.story.title ?? s.title, s.story.text);
  return out;
}

function fieldList(snaps: TaggedSnapshot[], only?: string[]) {
  const set = only?.length ? new Set(only) : null;
  return snaps.flatMap((s) =>
    s.fields
      .map((f) => ({
        id: `${s.frameId}:${f.id}`,
        kind: f.kind,
        question_text: cut(f.context, 1500),
        ...(f.options ? { options: f.options } : {}),
        ...(f.value ? { already_filled: f.value } : {}),
      }))
      .filter((f) => !set || set.has(f.id)),
  );
}

/** The page itself: frames, videos, fields and instructions. Changes from page to page. */
export function buildPageText(input: PromptInput): string {
  const { snaps, opener } = input;
  const parts: string[] = [];
  const top = snaps.find((s) => s.isTop) ?? snaps[0];
  parts.push(`<page url="${attr(top?.url ?? '')}" title="${attr(top?.title ?? '')}" site="${top?.adapter ?? 'generic'}">`);

  for (const v of input.videos) {
    parts.push(`<video url="${v.url}" note="תיאור של הסרטון (מה רואים ומה שומעים) שכתב מודל שצפה בו">\n${cut(v.text, 40000)}\n</video>`);
  }
  const missingVideos = input.missingVideos.filter((v) => !v.ok);
  if (missingVideos.length) {
    parts.push(
      `<missing_videos note="בדף יש סרטונים שלא נצפו. אם שאלה תלויה בהם, תענה מה שאפשר ותכתוב ב-notes שצריך לצפות בסרטון">\n${missingVideos.map((v) => v.url).join('\n')}\n</missing_videos>`,
    );
  }

  for (const s of snaps) {
    if (!s.fullText.trim()) continue;
    parts.push(`<frame id="${s.frameId}" url="${attr(s.url)}"${s.isTop ? ' main="true"' : ''}>\n${cut(s.fullText, 60000)}\n</frame>`);
  }
  if (opener.length) {
    const text = opener.map((s) => s.fullText).join('\n\n');
    if (text.trim()) parts.push(`<opener_window note="החלון שממנו נפתחה המשימה – הקשר בלבד">\n${cut(text, 20000)}\n</opener_window>`);
  }
  if (input.previousPages.trim()) {
    parts.push(`<previous_pages note="תשובות שכבר ניתנו בעמודים קודמים של אותה משימה">\n${input.previousPages}\n</previous_pages>`);
  }

  const fields = fieldList(snaps, input.onlyFields);
  parts.push(`<fields>\n${fields.length ? JSON.stringify(fields, null, 1) : 'לא נמצאו שדות תשובה בדף – תענה על השאלות שבטקסט.'}\n</fields>`);
  parts.push('</page>');
  if (input.note.trim()) parts.push(`<student_note>\n${input.note.trim()}\n</student_note>`);

  if (input.mode === 'review') {
    parts.push('תבדוק את התשובות שהתלמיד כתב (already_filled), ואז תקרא ל-submit_review.');
  } else if (input.onlyFields?.length) {
    parts.push('בפעם הקודמת השדות שברשימה לא קיבלו תשובה. תענה **רק** עליהם (על כל אחד מהם), ואז תקרא ל-submit_answers.');
  } else {
    parts.push('תענה על כל השאלות והסעיפים שבמשימה, ואז תקרא ל-submit_answers.');
  }
  return parts.join('\n\n');
}

/**
 * The user message. The story and attached documents come first, in their own blocks, marked for
 * prompt caching: on page 2 of the same task they are byte-identical, so they cost ~10%.
 */
export function buildContent(input: PromptInput): BetaContentBlockParam[] {
  const content: BetaContentBlockParam[] = [];
  for (const pdf of input.pdfs) {
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdf.base64 },
      title: pdf.title.slice(0, 200),
      context: 'מסמך שמצורף למשימה (לרוב הסיפור או חומר הקריאה)',
    });
  }
  if (input.stories.length) {
    content.push({
      type: 'text',
      text: input.stories.map((s) => `<story title="${attr(s.title)}">\n${cut(s.text, 80000)}\n</story>`).join('\n\n'),
    });
  }
  if (content.length) {
    const last = content[content.length - 1] as { cache_control?: { type: 'ephemeral' } };
    last.cache_control = { type: 'ephemeral' };
  }
  if (input.screenshot?.startsWith('data:image/')) {
    const [meta, data] = input.screenshot.split(',');
    content.push({ type: 'image', source: { type: 'base64', media_type: meta.includes('png') ? 'image/png' : 'image/jpeg', data } });
    content.push({ type: 'text', text: 'למעלה: צילום מסך של המשימה כפי שהיא נראית עכשיו.' });
  }
  content.push({ type: 'text', text: buildPageText(input) });
  return content;
}
