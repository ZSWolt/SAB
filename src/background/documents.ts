import type { DocumentRef } from '../shared/types';

const MAX_BYTES = 20 * 1024 * 1024;

export class DocError extends Error {}

export type FetchedDocument =
  | { ref: DocumentRef; kind: 'pdf'; base64: string }
  | { ref: DocumentRef; kind: 'text'; text: string };

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

const isPdf = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

/**
 * Downloads a document from the service worker. `credentials: 'include'` sends the user's cookies,
 * so files that need the school / Google login usually work too.
 */
export async function fetchDocument(ref: DocumentRef, signal?: AbortSignal): Promise<FetchedDocument> {
  let res: Response;
  try {
    res = await fetch(ref.fetchUrl, { credentials: 'include', redirect: 'follow', signal });
  } catch {
    throw new DocError('לא הצלחתי להוריד את הקובץ');
  }
  if (res.status === 401 || res.status === 403 || res.status === 404) throw new DocError('אין גישה לקובץ (צריך הרשאה או שהוא נמחק)');
  if (!res.ok) throw new DocError(`שגיאה בהורדה (${res.status})`);
  const size = Number(res.headers.get('content-length') ?? 0);
  if (size > MAX_BYTES) throw new DocError('הקובץ גדול מדי (מעל 20MB)');

  const type = (res.headers.get('content-type') ?? '').toLowerCase();
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new DocError('הקובץ גדול מדי (מעל 20MB)');

  if (isPdf(bytes)) return { ref, kind: 'pdf', base64: toBase64(bytes) };
  if (type.includes('text/html')) throw new DocError('הקובץ דורש התחברות או שהוא לא PDF / מסמך');
  if (type.startsWith('text/') || ref.kind === 'gdoc') {
    const text = new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '').trim();
    if (!text) throw new DocError('הקובץ ריק');
    return { ref, kind: 'text', text };
  }
  throw new DocError('סוג קובץ לא נתמך (רק PDF ו-Google Docs)');
}
