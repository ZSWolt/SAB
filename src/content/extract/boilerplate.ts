/**
 * Parts of a page that are never the task: privacy policy, terms of use, support, cookie notices,
 * accessibility statements, copyright footers, chat widgets. Reading them only costs time and money.
 * A block with answer fields in it is never dropped.
 */

const LEGAL_RE =
  /מדיניות\s*(ה)?פרטיות|תנאי\s*(ה)?שימוש|תנאי\s*(ה)?תמיכה|תקנון|הצהרת\s*נגישות|זכויות\s*יוצרים|כל\s*הזכויות\s*שמורות|עוגיות|תמיכה\s*טכנית|privacy\s*policy|terms\s*(of\s*(use|service))?|cookie|copyright|all\s*rights\s*reserved|accessibility\s*statement/i;
const AREA_RE = /cookie|consent|gdpr|privacy|terms|legal|copyright|footer|disclaimer|accessib.*statement|support-?(widget|chat)|chat-?widget|intercom|zendesk|helpdesk/i;
const WIDGET_HOST = /intercom|zendesk|zdassets|tawk\.to|crisp\.chat|livechat|hotjar|doubleclick|googletagmanager|recaptcha|facebook\.com\/plugins|freshchat|drift\.com|hubspot/i;

const hasFields = (el: Element) => !!el.querySelector('input, textarea, select, [contenteditable="true"], [data-sab-id], [data-sab-group]');

/** True for an element whose whole content can be skipped. */
/** Feedback and solutions shown after checking (Moodle / H5P): not what the student wrote. */
const FEEDBACK = /(^|\s)(rightanswer|specificfeedback|generalfeedback|numpartscorrect|h5p-correct-answer|h5p-drag-show-solution-container|h5p-feedback-dialog|validationerror)(\s|$)/;

export function isBoilerplate(el: Element): boolean {
  const tag = el.tagName;
  if (FEEDBACK.test(el.getAttribute('class') ?? '')) return true;
  const sig = `${el.id} ${el.getAttribute('class') ?? ''} ${el.getAttribute('aria-label') ?? ''}`;
  // footers and cookie banners: always (their sign-up boxes are not questions either)
  if (tag === 'FOOTER' || el.getAttribute('role') === 'contentinfo' || /cookie|consent/i.test(sig)) return true;
  if (AREA_RE.test(sig)) return !hasFields(el);
  // a section or dialog that is about privacy / terms / support, by its heading
  if (tag === 'SECTION' || tag === 'ASIDE' || tag === 'ARTICLE' || tag === 'DIALOG' || el.getAttribute('role') === 'dialog') {
    const head = el.querySelector('h1, h2, h3, h4, [role="heading"]');
    if (head && LEGAL_RE.test(head.textContent ?? '') && !hasFields(el)) return true;
  }
  return false;
}

/** A frame that is a chat / support / tracking widget, not part of the task. */
export function isWidgetFrame(loc: Location = location): boolean {
  return window !== window.top && WIDGET_HOST.test(loc.href);
}

/** A linked document that is a policy, terms or support page. */
export function isLegalDoc(title: string, url: string): boolean {
  return LEGAL_RE.test(title) || /privacy|terms|policy|cookie|legal|takanon|support/i.test(url);
}
