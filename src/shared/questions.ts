/**
 * Does this text look like something the student is asked to answer? Used to tell real questions
 * from other inputs (a "+ idea" box in a sources map, an editor toolbar) on sites like CET, and to
 * decide what counts as a missing answer.
 */
// whole words only (with an optional ו / ו+ה before): "ענו" must not match inside "טענות"
const VERB_RE =
  /(?:^|[^א-תa-z])(?:ו)?(כתבו|כתוב|הסבירו|הסבר|נמקו|נמק|השוו|השווה|ציינו|ציין|תארו|תאר|הביאו|הבא|בחרו|בחר|סמנו|סמן|קבעו|קבע|גררו|גרור|התאימו|התאם|הציגו|הצג|פרטו|פרט|מיינו|דרגו|ענו|ענה|השלימו|השלם|הוכיחו|הראו|התייחסו|חוו דעתכם|נסחו|explain|describe|compare|choose|write|answer)(?![א-תa-z])/i;

export function looksLikeQuestion(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (/[?؟]/.test(t)) return true;
  if (/שאלה\s*(\d{1,2}|[א-ת]['׳]?)(?![א-ת])/.test(t) || /^\d{1,2}[.)]\s/.test(t)) return true;
  return VERB_RE.test(t);
}

/** The first question sentence in a text ("האם התקיימה הצבעה על הכרזת המדינה?"), or ''. */
export function firstQuestion(text: string): string {
  const m = text.replace(/\s+/g, ' ').match(/[^.?!\n]{6,240}\?/);
  return m ? m[0].trim() : '';
}
