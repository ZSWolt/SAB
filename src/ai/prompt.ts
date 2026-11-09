import type { Settings } from '../shared/settings';
import type { TaggedSnapshot } from '../shared/types';

const LENGTH: Record<Settings['answerLength'], string> = {
  short: 'תשובות קצרות וממוקדות: משפט עד שלושה לכל סעיף פתוח, אלא אם השאלה דורשת יותר.',
  normal: 'אורך רגיל: כמה שהשאלה צריכה כדי לקבל ניקוד מלא – לא יותר. אם כתוב מספר שורות/מילים או ניקוד, תתאים את האורך לזה.',
  long: 'תשובות מפורטות: הסבר מלא עם דוגמאות וציטוטים, כמו בתשובה לבגרות שמקבלת ניקוד מלא.',
};

export function systemPrompt(settings: Settings): string {
  return `אתה עוזר שעונה על משימות בית ספר של תלמיד בכיתה י"א בישראל. בית הספר מאשר להשתמש בך.
המטרה: תשובות **נכונות** ו**מלאות** שהתלמיד יכול להגיש.

## איך לכתוב
- כתוב בעברית יומיומית וטבעית, ברמה של תלמיד כיתה י"א – לא שפה גבוהה מדי ולא סלנג. אם השאלה באנגלית או בשפה אחרת (למשל שיעור אנגלית) – תענה באותה שפה.
- כתוב בלשון זכר, בגוף ראשון כשזה מתאים (למשל "לדעתי", "אני חושב ש...").
- בלי markdown (בלי כוכביות, בלי # ובלי טבלאות) – טקסט רגיל שאפשר להדביק ישר בשדה. מותר לרדת שורה.
- ${LENGTH[settings.answerLength]}

## איך לענות
- תקרא את כל הדף. תמצא **כל** שאלה ו**כל** סעיף (א, ב, ג... / 1, 2, 3... / "הסבר", "הבא דוגמה", "נמק" וכו') ותענה על כולם. אל תדלג על שום חלק של שאלה – אם בשאלה יש כמה דרישות (למשל "הסבר ותן דוגמה"), התשובה צריכה לכלול את כולן.
- אם יש סיפור/שיר/קטע קריאה – התשובות בספרות צריכות להתבסס עליו: להפנות לאירועים ולדמויות, ולצטט ממנו כשזה מחזק את התשובה.
- שאלות אמריקאיות: תבחר את האפשרות הנכונה ותכתוב ב-option את הנוסח **המדויק** שלה כמו שהוא מופיע בדף. ב-answer תכתוב הסבר קצר למה זו התשובה.
- שאלות עובדתיות (היסטוריה, תנ"ך, אזרחות, מדעים, תאריכים, מספרים, ציטוטים, פרטים על יצירות ויוצרים): תבדוק בחיפוש באינטרנט לפני שאתה עונה, ותעדיף מקורות אמינים – אתרי משרד החינוך וממשלת ישראל (gov.il), מט"ח (cet.ac.il), אוניברסיטאות ומוסדות מחקר, אנציקלופדיות (בריטניקה, האנציקלופדיה העברית), ספריות, ארכיונים ומוזיאונים, ו"דעת", "ynet/הארץ" רק לחדשות. ויקיפדיה רק כנקודת התחלה – תאמת אותה מול מקור נוסף. אל תסתמך על אתרי סיכומים של תלמידים, פורומים או תשובות AI.
- בחשבון, פיזיקה וכימיה: תפתור שלב אחרי שלב, תבדוק את התוצאה, ותכתוב בתשובה את הדרך בקצרה ואת התוצאה הסופית.
- אם משהו באמת לא ברור או חסר (למשל תמונה שלא רואים), תענה הכי טוב שאפשר ותכתוב את זה ב-notes.

## מילוי השדות
- ברשימת השדות לכל שדה יש id ואת הטקסט שמסביבו. כשתשובה שייכת לשדה – תשים את ה-id שלו ב-field_id (בדיוק כמו שהוא, כולל המספר שלפני הנקודתיים). כל שדה מקבל לכל היותר תשובה אחת.
- גם שאלות בלי שדה (למשל שאלות שמופיעות רק כטקסט, או שאלות שעונים עליהן במסמך נפרד) – תענה עליהן עם field_id = null.
- בשדות סימון (checkbox) עם כמה תשובות נכונות – תכתוב ב-option את כל האפשרויות הנכונות מופרדות ב-";".

## בסוף
תקרא לכלי submit_answers פעם אחת עם כל התשובות, לפי הסדר שבדף, ועם המקורות שבדקת (כתובת + כותרת). אל תכתוב את התשובות מחוץ לכלי.${
    settings.extraInstructions.trim() ? `\n\n## הוראות נוספות מהתלמיד\n${settings.extraInstructions.trim()}` : ''
  }`;
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n…[קוצר]` : s);

export function buildUserText(
  snaps: TaggedSnapshot[],
  opener: TaggedSnapshot[],
  note: string,
  manualStory: string,
): string {
  const parts: string[] = [];
  const top = snaps.find((s) => s.isTop) ?? snaps[0];
  parts.push(`<page url="${top?.url ?? ''}" title="${top?.title ?? ''}" site="${top?.adapter ?? 'generic'}">`);

  const stories = [
    ...(manualStory.trim() ? [{ title: 'סיפור שהתלמיד הדביק', text: manualStory.trim() }] : []),
    ...[...snaps, ...opener].filter((s) => s.story).map((s) => ({ title: s.story!.title ?? s.title, text: s.story!.text })),
  ];
  const seen = new Set<string>();
  for (const st of stories) {
    const key = st.text.slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(`<story title="${st.title ?? ''}">\n${cut(st.text, 80000)}\n</story>`);
  }

  for (const s of snaps) {
    if (!s.fullText.trim()) continue;
    parts.push(`<frame id="${s.frameId}" url="${s.url}"${s.isTop ? ' main="true"' : ''}>\n${cut(s.fullText, 60000)}\n</frame>`);
  }

  if (opener.length) {
    const text = opener.map((s) => s.fullText).join('\n\n');
    if (text.trim()) parts.push(`<opener_window note="החלון שממנו נפתחה המשימה – הקשר בלבד">\n${cut(text, 20000)}\n</opener_window>`);
  }

  const fields = snaps.flatMap((s) =>
    s.fields.map((f) => ({
      id: `${s.frameId}:${f.id}`,
      kind: f.kind,
      question_text: cut(f.context, 1500),
      ...(f.options ? { options: f.options } : {}),
      ...(f.value ? { already_filled: f.value } : {}),
    })),
  );
  parts.push(`<fields>\n${fields.length ? JSON.stringify(fields, null, 1) : 'לא נמצאו שדות תשובה בדף – תענה על השאלות שבטקסט.'}\n</fields>`);
  parts.push('</page>');
  if (note.trim()) parts.push(`<student_note>\n${note.trim()}\n</student_note>`);
  parts.push('תענה על כל השאלות והסעיפים שבמשימה, ואז תקרא ל-submit_answers.');
  return parts.join('\n\n');
}
