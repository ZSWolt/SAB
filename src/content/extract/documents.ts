import type { DocumentRef } from '../../shared/types';
import { getText } from '../text';

/** Recognizes a PDF / Google Doc / Drive file URL and where to download it from. */
export function documentRef(raw: string | null | undefined, title: string, embedded: boolean): DocumentRef | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw, location.href);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const clean = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, 120);

  if (u.hostname === 'docs.google.com') {
    const m = u.pathname.match(/^\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})/);
    if (m) {
      return {
        url: `https://docs.google.com/document/d/${m[1]}`,
        fetchUrl: `https://docs.google.com/document/d/${m[1]}/export?format=txt`,
        kind: 'gdoc',
        title: clean(title) || 'מסמך Google Docs',
        embedded,
      };
    }
    return null;
  }
  if (u.hostname === 'drive.google.com') {
    const m = u.pathname.match(/\/file\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})/) ?? (u.pathname === '/open' ? [null, u.searchParams.get('id')] : null);
    const id = m?.[1];
    if (id && /^[A-Za-z0-9_-]{20,}$/.test(id)) {
      return {
        url: `https://drive.google.com/file/d/${id}`,
        fetchUrl: `https://drive.google.com/uc?export=download&id=${id}`,
        kind: 'drive',
        title: clean(title) || 'קובץ מ-Google Drive',
        embedded,
      };
    }
    return null;
  }
  if (/\.pdf$/i.test(u.pathname)) {
    u.hash = '';
    const file = decodeURIComponent(u.pathname.split('/').pop() ?? '');
    return { url: u.href, fetchUrl: u.href, kind: 'pdf', title: clean(title) || file || 'PDF', embedded };
  }
  return null;
}

/** Documents embedded or linked in this frame. Embedded ones first (they're usually the story). */
export function findDocuments(doc: Document = document): DocumentRef[] {
  const found = new Map<string, DocumentRef>();
  const add = (ref: DocumentRef | null) => {
    if (ref && !found.has(ref.url)) found.set(ref.url, ref);
  };
  doc.querySelectorAll('iframe, embed, object').forEach((el) => {
    const src = el.getAttribute('src') ?? el.getAttribute('data') ?? el.getAttribute('data-src');
    add(documentRef(src, el.getAttribute('title') ?? '', true));
  });
  doc.querySelectorAll('a[href]').forEach((a) => {
    if (a.closest('nav, header[role="banner"], #sab-helper-host')) return;
    add(documentRef(a.getAttribute('href'), getText(a), false));
  });
  return Array.from(found.values())
    .sort((a, b) => Number(b.embedded) - Number(a.embedded))
    .slice(0, 6);
}
