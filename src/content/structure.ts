/**
 * "Export page structure": a short JSON outline of the DOM (tags, ids, classes, roles and the first
 * few words of text) so the site adapters can be tuned without logging in. Field values are not
 * included, and text is cut to 40 characters per node.
 */
interface Node_ {
  t: string;
  id?: string;
  c?: string;
  r?: string;
  a?: string;
  txt?: string;
  hidden?: true;
  sab?: string;
  k?: Node_[];
}

const MAX_NODES = 6000;

export function pageStructure(doc: Document = document): object {
  let count = 0;
  const walk = (el: Element, depth: number): Node_ | null => {
    if (count++ > MAX_NODES || depth > 40) return null;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'META', 'LINK'].includes(el.tagName)) return null;
    if (el.id === 'sab-helper-host') return null;
    const n: Node_ = { t: el.tagName.toLowerCase() };
    if (el.id) n.id = el.id;
    const cls = el.getAttribute('class');
    if (cls) n.c = cls.slice(0, 120);
    const role = el.getAttribute('role');
    if (role) n.r = role;
    const aria = el.getAttribute('aria-label');
    if (aria) n.a = aria.slice(0, 40);
    if ((el as HTMLElement).hidden) n.hidden = true;
    const sab = el.getAttribute('data-sab-id') ?? el.getAttribute('data-sab-group');
    if (sab) n.sab = sab;
    const own = Array.from(el.childNodes)
      .filter((c) => c.nodeType === Node.TEXT_NODE)
      .map((c) => c.nodeValue ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (own) n.txt = own.slice(0, 40);
    const kids = Array.from(el.children)
      .map((c) => walk(c, depth + 1))
      .filter((c): c is Node_ => !!c);
    if (kids.length) n.k = kids;
    return n;
  };
  return {
    url: location.origin + location.pathname,
    title: doc.title,
    frame: window === window.top ? 'top' : 'iframe',
    iframes: Array.from(doc.querySelectorAll('iframe')).map((f) => f.src.split('?')[0]),
    tree: doc.body ? walk(doc.body, 0) : null,
  };
}
