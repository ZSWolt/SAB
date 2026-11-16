import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { orderedRows } from '../shared/labels';
import { questionLine } from '../background/coverage';
import type { Settings } from '../shared/settings';
import type { ChatMessage, SolveResult, TaggedSnapshot } from '../shared/types';
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';

const LENGTH: Record<Settings['answerLength'], string> = {
  short: 'קצר מאוד: משפט אחד או שניים לכל סעיף פתוח, ובלי הקדמות. רק מה שהשאלה מבקשת.',
  normal: 'התשובה הקצרה ביותר שעדיין עונה על **כל** חלקי השאלה: בדרך כלל משפט עד שלושה לכל סעיף פתוח, בלי הקדמות, בלי לחזור על השאלה ובלי סיכום. אם השאלה מבקשת כמה דברים (למשל "הסבר והבא דוגמה"), כל אחד מהם מקבל משפט קצר. אם כתוב מספר שורות או ניקוד גבוה, אפשר קצת יותר.',
  long: 'תשובות מפורטות: הסבר מלא עם דוגמאות וציטוטים, כמו בתשובה לבגרות שמקבלת ניקוד מלא.',
};

const SOURCES = `תבדוק בחיפוש באינטרנט, ותעדיף מקורות אמינים – אתרי משרד החינוך וממשלת ישראל (gov.il), מט"ח (cet.ac.il), אוניברסיטאות ומוסדות מחקר, אנציקלופדיות (בריטניקה, האנציקלופדיה העברית), ספריות, ארכיונים ומוזיאונים, ואתרי חדשות מוכרים רק לחדשות. ויקיפדיה רק כנקודת התחלה – תאמת אותה מול מקור נוסף. אל תסתמך על אתרי סיכומים של תלמידים, פורומים או תשובות AI.`;

function writingSection(settings: Settings): string {
  const sample = settings.styleSample.trim();
  return `## איך לכתוב
- כתוב בעברית יומיומית וטבעית, ברמה של תלמיד כיתה י"א – לא שפה גבוהה מדי ולא סלנג. אם השאלה באנגלית או בשפה אחרת (למשל שיעור אנגלית) – תענה באותה שפה.
- כתוב בלשון זכר, בגוף ראשון כשזה מתאים (למשל "לדעתי", "אני חושב ש...").
- בלי markdown (בלי כוכביות, בלי # ובלי טבלאות) – טקסט רגיל שאפשר להדביק ישר בשדה. מותר לרדת שורה.
- שאלה עם כמה חלקים: כל חלק בשורה משלו, עם ירידת שורה אחת, **בלי שורה ריקה** ביניהם.
- רק אותיות ותווים רגילים: בלי ניקוד, בלי סימני כיוון ובלי תווים מיוחדים.
- שיישמע כמו תלמיד ולא כמו AI: בלי ביטויים כמו "חשוב לציין", "יש לציין", "לסיכום", "ראשית", "שנית", "בנוסף לכך", "יתרה מזאת", "כמו כן", "ניתן לומר", "לאור זאת", "באופן כללי". משפטים באורכים שונים, לא כולם באותו אורך.
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

/** The student's fixed instructions (settings), up front and binding: in the chat they apply to every reply too. */
function fixedRules(settings: Settings): string {
  const t = settings.extraInstructions.trim();
  return t
    ? `## הוראות קבועות של התלמיד (מההגדרות) – חובה\nתפעל לפיהן בכל הודעה שאתה כותב בשיחה, וגם בכל תשובה שאתה מעדכן ב-update_answers. הן קודמות לכללי הסגנון שלמטה.\n${t}\n\n`
    : '';
}

export function systemPrompt(settings: Settings): string {
  return `אתה עוזר שעונה על משימות בית ספר של תלמיד בכיתה י"א בישראל. בית הספר מאשר להשתמש בך.
המטרה: תשובות **נכונות** ו**מלאות** שהתלמיד יכול להגיש.

${writingSection(settings)}

## איך לענות
- **ההנחיה של התלמיד (student_note) קודמת לכל כלל אחר.** אם היא מצמצמת (רק שאלה 3, רק עמוד 2, רק מה שלא עניתי, בלי סעיף ב), תענה **רק** על מה שהיא מבקשת, ואל תוסיף תשובות לשאלות אחרות. שדה עם already_filled הוא שאלה שהתלמיד כבר ענה עליה.
- תקרא את כל הדף. תמצא **כל** שאלה ו**כל** סעיף (א, ב, ג... / 1, 2, 3... / "הסבר", "הבא דוגמה", "נמק" וכו') ותענה על כולם. אל תדלג על שום חלק של שאלה – אם בשאלה יש כמה דרישות (למשל "הסבר ותן דוגמה"), התשובה צריכה לכלול את כולן.
- אם יש סיפור/שיר/קטע קריאה או מסמך מצורף – התשובות בספרות צריכות להתבסס עליו: להפנות לאירועים ולדמויות, ולצטט ממנו כשזה מחזק את התשובה.
- אם יש תיאור של סרטון (<video>) – תשתמש בו כמו שהיית משתמש בסרטון עצמו: לאירועים, לציטוטים ולזמנים.
- question: המספר של השאלה **כמו שהוא כתוב במשימה** ("שאלה 4"), גם אם אתה עונה רק על חלק מהשאלות. אם לשאלה אין מספר במשימה, תכתוב את הכותרת שלה. page: מספר העמוד שבו השאלה נמצאת (לפי הכותרות === עמוד N ===), או null אם למשימה אין עמודים.
- פעילות התאמה (שתי רשימות של תיבות ו"התאימו בין..."): ב-matches זוג לכל תיבה, עם הטקסט **המדויק** של כל תיבה כמו בדף (from מהרשימה של הבעיות/המושגים, to מהרשימה השנייה). how = "לחץ על תיבה מימין ואז על התיבה שמתאימה לה". answer = הזוגות בשורות "<from> ← <to>".
- סימון בטקסט עם מקרא צבעים (כפתורי קטגוריה כמו "למה הציגו?", ומשימה "סמנו בתוך הטקסט"): ב-highlights לכל קטגוריה את המשפטים שמתאימים לה. label = הנוסח המדויק של הכפתור, text = משפט או חלק משפט מועתק **אות באות** מהטקסט (בלי לשנות מילה). how = "לחץ על הצבע ואז סמן את המשפט". answer = הקטגוריות והמשפטים.
- שאלה בטבלה (שדה עם table: רשימת שורות, ובכל שורה הטקסט של כל תא, "" = תא ריק): תמלא את התאים הריקים. ב-cells תחזיר תא לכל תא ריק שצריך למלא: row ו-col לפי המיקום ב-table (מ-0, כולל שורת הכותרת), ו-text קצר שמתאים לכותרת העמודה ולשורה. ב-answer תכתוב את אותן תשובות בשורות "<השורה>: <התשובה>". בכל תשובה אחרת cells = null.
- שאלות אמריקאיות: תבחר את האפשרות הנכונה ותכתוב ב-option את הנוסח **המדויק** שלה כמו שהוא מופיע בדף. ב-answer תכתוב נימוק של משפט אחד קצר בלבד.
- שאלות עובדתיות (היסטוריה, תנ"ך, אזרחות, מדעים, תאריכים, מספרים, ציטוטים, פרטים על יצירות ויוצרים): ${SOURCES}
- בחשבון, פיזיקה וכימיה: תפתור שלב אחרי שלב, תבדוק את התוצאה, ותכתוב בתשובה את הדרך בקצרה ואת התוצאה הסופית.
- אם יש תשובות מעמודים קודמים של אותה משימה (<previous_pages>) – תשמור על רצף ולא תסתור אותן.
- אם משהו באמת לא ברור או חסר (למשל תמונה שלא רואים), תענה הכי טוב שאפשר ותכתוב את זה ב-notes.

## תשובות שאפשר לעבוד איתן
- תשובה אחת לכל שאלה **אמיתית** שהתלמיד צריך לענות עליה. כותרת של עמוד, הוראות קריאה ("קראו את המקורות"), "שימו לב" ושם של פעילות הם לא שאלות, ואל תכתוב להם תשובה.
- how הוא "מה לעשות": 1–3 צעדים קצרים ומדויקים, רק כשיש מה לעשות בדף חוץ מלכתוב בשדה:
  - פעילות בלי שדה טקסט (גרירה, התאמה, אגודל למעלה/למטה, בחירת כרטיס, לחיצה על דמויות): how = הפעולות עצמן, למשל "גרור 👍 לכרטיס של ישראל גלילי; גרור 👎 לכרטיס של משה שרתוק". answer = נימוק קצר של משפט או שניים.
  - חיבור או תשובה ארוכה שכותבים בעורך (שולחן כתיבה): how = איפה להדביק. answer = הטקסט עצמו, מסודר: עמדה במשפט, טיעונים עם הפניה למקורות לפי השם שלהם במשימה, ומשפט סיכום. רק מה שהשאלה דורשת.
  - בשאלה רגילה עם שדה: how = null.

## מילוי השדות
- ברשימת השדות לכל שדה יש id ואת הטקסט שמסביבו. כשתשובה שייכת לשדה – תשים את ה-id שלו ב-field_id (בדיוק כמו שהוא, כולל המספר שלפני הנקודתיים). כל שדה מקבל בדיוק תשובה אחת.
- גם שאלות בלי שדה (למשל שאלות שמופיעות רק כטקסט, או שאלות שעונים עליהן במסמך נפרד) – תענה עליהן עם field_id = null.
- בשדות סימון (checkbox) עם כמה תשובות נכונות – תכתוב ב-option את כל האפשרויות הנכונות מופרדות ב-";".
- **כל** שדה ברשימה מקבל תשובה, **או** נכנס ל-skipped עם סיבה קצרה, אבל רק אם הוא באמת לא שאלה (שם, כיתה, ת"ז, תיבת "רעיון חדש", חיפוש). על שאלה אמיתית אסור לדלג.
- **כל** שאלה שמופיעה בטקסט ("שאלה 5", או שאלה בלי מספר) מקבלת תשובה, גם אם אין לה שדה. אבל כותרת, הוראת קריאה, שם של מקור או "שימו לב" הם לא שאלות, ואין להם תשובה.
- אם המשימה מחולקת לעמודים (=== עמוד 2 מתוך 3 === בטקסט, ו-page בשדות) – תענה על השאלות של **כל** העמודים.
- אם המשימה מחולקת ללשוניות (=== לשונית "מפת מקורות" === בטקסט, ו-section בשדות) – כל הלשוניות הן חלק מאותה משימה: תשתמש במקורות ובחומר מכל הלשוניות כדי לענות על השאלות שבכל אחת מהן.
- באתר של מט"ח (site="cet"): "המשימה" היא השאלה, "מפת מקורות" היא החומר (מקורות, היסטוריונים, פרוטוקולים), ו"שולחן כתיבה" הוא העורך שבו כותבים את התשובה. העורך שבשולחן הכתיבה מקבל את התשובה לשאלת המשימה. אל תמציא שאלות מכותרות של מקורות.

## בסוף
ב-topic תכתוב את הנושא של היחידה או המשימה בשורה אחת, ובשורה הבאה משפט או שניים על מה היא עוסקת.
תקרא לכלי submit_answers פעם אחת עם כל התשובות, לפי הסדר שבדף, ועם המקורות שבדקת (כתובת + כותרת). אל תכתוב את התשובות מחוץ לכלי.${extra(settings)}`;
}

export function reviewSystemPrompt(settings: Settings): string {
  return `אתה מורה שבודק משימה של תלמיד בכיתה י"א בישראל, לפי מחוון בגרות. בית הספר מאשר להשתמש בך.
התלמיד כבר כתב תשובות (הן ב-already_filled ברשימת השדות). המטרה: להגיד לו בכנות כמה הן טובות ואיך לשפר.

## איך לבדוק
- לכל שדה שיש בו תשובה של התלמיד תחזיר פריט אחד, עם ה-id של השדה ב-field_id (חובה, בדיוק כמו ברשימה), ותן ציון 0–100 כמו שמורה היה נותן לפי מחוון בגרות – לא נדיב מדי ולא קשוח מדי.
- correct: מה טוב ונכון בתשובה (קצר, ספציפי).
- missing: מה חסר או שגוי – במיוחד חלקים של השאלה שלא נענו ("הסבר" בלי "דוגמה" וכו'), טעויות עובדתיות, ופרטים מהסיפור/הטקסט שהיה צריך להזכיר. אם אין – מחרוזת ריקה.
- improved: גרסה משופרת וקצרה של התשובה שהייתה מקבלת ניקוד מלא. תבנה אותה על התשובה של התלמיד, ובסגנון שלו – לא תשובה חדשה לגמרי.
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
  /** Why only some fields: "missing" (complete the missing ones) or "empty" (the student answered the rest). */
  onlyReason?: 'missing' | 'empty';
  /** "שאלה N" headings in the text that got no answer last time. */
  missingText?: number[];
  screenshot?: string | null;
  /** Pictures of activities taken while walking the task's pages/tabs (CET). */
  images?: { label: string; dataUrl: string }[];
  /** Pictures the student added as the story (a photo of a page from the book). */
  storyImages?: { label: string; dataUrl: string }[];
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
        ...(f.page ? { page: f.page } : {}),
        ...(f.section ? { section: f.section } : {}),
        question_text: cut(f.context, 1500),
        ...(f.options ? { options: f.options } : {}),
        ...(f.table ? { table: f.table.rows } : {}),
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
  } else if (input.onlyFields?.length && input.onlyReason === 'empty') {
    parts.push('התלמיד כבר ענה בעצמו על שאר השאלות. תענה **רק** על השדות שברשימה (על כל אחד מהם), בלי שאלות אחרות, ואז תקרא ל-submit_answers.');
  } else if (input.onlyFields?.length || input.missingText?.length) {
    const textQs = input.missingText?.length ? ` וגם השאלות שבטקסט: ${input.missingText.map((n) => `שאלה ${n}`).join(', ')} (בלי שדה, field_id = null)` : '';
    parts.push(
      `בפעם הקודמת ${input.onlyFields?.length ? 'השדות שברשימה' : 'חלק מהשאלות'}${textQs} לא קיבלו תשובה. תענה **רק** עליהם, על כל אחד מהם. אם שדה באמת לא שאלה (שם, כיתה, תיבת רעיון), תכניס אותו ל-skipped עם סיבה. ואז תקרא ל-submit_answers.`,
    );
  } else if (input.note.trim()) {
    parts.push('תעשה בדיוק מה שכתוב ב-student_note. אם היא מגבילה לאילו שאלות לענות, תענה רק עליהן. רק אם היא לא מגבילה, תענה על כל השאלות והסעיפים שבמשימה. ואז תקרא ל-submit_answers.');
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
  for (const img of (input.storyImages ?? []).slice(0, 10)) {
    const [meta, data] = img.dataUrl.split(',');
    if (!data) continue;
    const mt = /png/.test(meta) ? 'image/png' : /webp/.test(meta) ? 'image/webp' : /gif/.test(meta) ? 'image/gif' : 'image/jpeg';
    content.push({ type: 'image', source: { type: 'base64', media_type: mt, data } });
    content.push({ type: 'text', text: `למעלה: "${img.label}", תמונה של הסיפור (או חלק ממנו) שהתלמיד הוסיף. תקרא אותה ותתייחס אליה כמו לסיפור.` });
  }
  for (const img of (input.images ?? []).slice(0, 6)) {
    const [meta, data] = img.dataUrl.split(',');
    if (!data) continue;
    content.push({ type: 'image', source: { type: 'base64', media_type: meta.includes('png') ? 'image/png' : 'image/jpeg', data } });
    content.push({ type: 'text', text: `למעלה: צילום של ${img.label}. כך הפעילות נראית לתלמיד (כרטיסים, דמויות, אגודלים): תשתמש בזה כדי לכתוב ב-how מה בדיוק לעשות.` });
  }
  content.push({ type: 'text', text: buildPageText(input) });
  return content;
}

// ---------- chat ----------

export function chatSystemPrompt(settings: Settings): string {
  return `אתה עוזר בשיחה עם תלמיד כיתה י"א בישראל, על משימת בית ספר שפתוחה אצלו בדפדפן. בית הספר מאשר להשתמש בך.
בהודעה הראשונה יש את ההקשר: הדף, השדות (עם id), הסיפור והתשובות שכבר נכתבו.

${fixedRules(settings)}${writingSection(settings)}

## איך לענות בשיחה
- אתה צ'אט רגיל עם AI: עונים על מה שהתלמיד שואל. תענה קצר וענייני, כמו חבר טוב שמבין בחומר. בלי הקדמות.
- **שאלה מקבלת תשובה במילים, בלי לשנות שום תשובה.** למשל: "התשובה שלי כוללת ציטוטים?", "זה נכון?", "מה חסר בתשובה 2?", "למה בחרת באפשרות הזאת?", "על מה הסיפור?", "מה זה אומר...?". תבדוק בעצמך (בתשובות שב-current_answers, במה שהתלמיד כתב ב-student_wrote ובטקסט) ותענה ישירות: כן/לא, ומה בדיוק. אם יש מה לשפר, תציע במשפט ("רוצה שאוסיף ציטוט?") ואל תשנה לבד.
- update_answers **רק** כשהתלמיד מבקש במפורש לשנות או לכתוב תשובה: "תקצר", "תאריך", "תוסיף ציטוט", "תנסח מחדש", "תתקן", "תתרגם", "תענה על שאלה 5", "כן, תוסיף".
- "תסביר", "למה", "על מה הסיפור": תסביר בפשטות, עם דוגמה מהטקסט כשזה עוזר. אל תשנה תשובות.
- התשובות שכבר נפתרו נמצאות ב-current_answers, כל אחת עם label כמו שהתלמיד רואה אותה בלשונית התשובות ("שאלה 3"). כשהוא כותב "תשובה 3", "שאלה 3", "הראשונה" או "האחרונה", הוא מתכוון לפריט עם ה-label הזה או למיקום הזה ברשימה. אל תפתור מחדש ואל תשאל איזו תשובה: תתבסס על התשובה שכבר כתובה שם.
- בקשה לשנות תשובה (לקצר, להאריך, לנסח אחרת, לתרגם, לתקן, להשלים שאלה חסרה): תקרא לכלי update_answers עם התשובות החדשות בלבד. כל אחת עם אותו field_id, אותו question ואותו part של התשובה המקורית מ-current_answers (או מרשימת השדות כשאין עדיין תשובה, או null אם אין שדה). בטקסט תכתוב משפט אחד על מה שינית, ותזכיר את מספר השאלה.
- "כל התשובות": תעדכן את כולן בקריאה אחת.
- שאלות עובדתיות: ${SOURCES}
- אם התלמיד מבקש משהו שלא קשור למשימה, תעזור בקצרה.`;
}

export interface ChatContext {
  snaps: TaggedSnapshot[];
  stories: StoryBlock[];
  result: SolveResult | null;
  previousPages: string;
}

function chatContextText(c: ChatContext): string {
  const parts: string[] = [];
  for (const st of c.stories) parts.push(`<story title="${attr(st.title)}">\n${cut(st.text, 60000)}\n</story>`);
  for (const s of c.snaps) {
    if (s.fullText.trim()) parts.push(`<frame id="${s.frameId}" url="${attr(s.url)}">\n${cut(s.fullText, 30000)}\n</frame>`);
  }
  // what the student typed in the fields, so questions like "does my answer quote the text?" can be answered
  const wrote = c.snaps.flatMap((s) => s.fields.filter((f) => f.value?.trim()).map((f) => `${questionLine(f.context)}\n${cut(f.value!, 3000)}`));
  if (wrote.length) parts.push(`<student_wrote note="מה שהתלמיד כתב בעצמו בשדות של הדף">\n${wrote.join('\n\n')}\n</student_wrote>`);
  // once solved, the answers carry the field ids to use (page-walk ids); before that, list the fields
  if (!c.result?.answers.length) {
    const fields = fieldList(c.snaps);
    parts.push(`<fields>\n${fields.length ? JSON.stringify(fields, null, 1) : 'אין שדות בדף'}\n</fields>`);
  }
  if (c.result?.answers.length) {
    // same order and numbers as the student's answers tab
    const order = orderedRows(c.result.answers, c.result.missing ?? []);
    const missing = c.result.missing ?? [];
    const answers = order.filter((row) => row.kind === 'answer').map(({ index, label }) => ({ label, a: c.result!.answers[index] })).map(({ label, a }) => ({
      label,
      field_id: a.field_id,
      question: a.question,
      part: a.part,
      question_text: a.questionText || undefined,
      ...(a.page ? { page: a.page } : {}),
      ...(a.option ? { option: a.option } : {}),
      ...(a.how ? { how: a.how } : {}),
      answer: a.answer,
    }));
    parts.push(`<current_answers note="התשובות שכבר נכתבו למשימה, לפי הסדר בלשונית התשובות של התלמיד">\n${JSON.stringify(answers, null, 1)}\n</current_answers>`);
    const gaps = order.filter((row) => row.kind === 'missing');
    if (gaps.length) parts.push(`<missing note="שדות בלי תשובה">\n${gaps.map(({ index, label }) => `${label} (field_id ${missing[index].field_id}): ${missing[index].context}`).join('\n')}\n</missing>`);
  } else {
    parts.push('<current_answers>עוד לא נפתרה המשימה</current_answers>');
  }
  if (c.previousPages.trim()) parts.push(`<previous_pages>\n${c.previousPages}\n</previous_pages>`);
  return parts.join('\n\n');
}

/**
 * The chat as Messages API turns. The page context goes first in its own cached block, so every
 * follow-up in the same chat costs little; then the conversation as plain text turns.
 */
export function buildChatContent(context: ChatContext, history: ChatMessage[]): BetaMessageParam[] {
  const turns = history.filter((m) => m.text.trim());
  // must start with the student and alternate
  const clean: ChatMessage[] = [];
  for (const m of turns) {
    if (!clean.length && m.role !== 'user') continue;
    if (clean.length && clean[clean.length - 1].role === m.role) clean[clean.length - 1] = { ...m, text: `${clean[clean.length - 1].text}\n${m.text}` };
    else clean.push(m);
  }
  const out: BetaMessageParam[] = clean.map((m, i) => {
    if (i === 0) {
      return {
        role: 'user',
        content: [
          { type: 'text', text: `<context>\n${chatContextText(context)}\n</context>`, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: m.text },
        ],
      };
    }
    return { role: m.role, content: m.text };
  });
  return out;
}
