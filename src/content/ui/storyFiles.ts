import type { StoryFile } from '../../shared/types';

/**
 * Files the student adds as the story: Word (.docx), PDF, plain text and pictures (a photo of a page
 * from the book). Word and text become text; PDFs and pictures go to Claude as they are.
 */

const MB = 1024 * 1024;
export const STORY_ACCEPT = '.docx,.pdf,.txt,.md,.rtf,.html,.htm,image/png,image/jpeg,image/webp,image/gif';

export async function readStoryFile(file: File): Promise<StoryFile> {
  const name = file.name;
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'docx') return { name, kind: 'text', text: await docxText(await file.arrayBuffer()), size: file.size };
  if (ext === 'doc') throw new Error(`${name}: קובץ Word ישן (.doc). תשמור אותו כ-.docx או כ-PDF ותוסיף שוב`);
  if (ext === 'pdf' || file.type === 'application/pdf') {
    if (file.size > 30 * MB) throw new Error(`${name}: ה-PDF גדול מדי (עד 30MB)`);
    return { name, kind: 'pdf', base64: await toBase64(file), size: file.size };
  }
  if (file.type.startsWith('image/')) {
    if (file.size > 5 * MB) throw new Error(`${name}: התמונה גדולה מדי (עד 5MB)`);
    return { name, kind: 'image', base64: await toBase64(file), mime: file.type, size: file.size };
  }
  if (['txt', 'md', 'rtf', 'html', 'htm'].includes(ext) || file.type.startsWith('text/')) {
    let text = await file.text();
    if (ext === 'html' || ext === 'htm') text = new DOMParser().parseFromString(text, 'text/html').body.innerText || '';
    if (ext === 'rtf') text = text.replace(/\\[a-z]+-?\d* ?|[{}]/g, '');
    return { name, kind: 'text', text: text.trim(), size: file.size };
  }
  throw new Error(`${name}: סוג קובץ שלא נתמך. אפשר Word (.docx), PDF, טקסט או תמונה`);
}

async function toBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** The text of a .docx: it is a zip; the text is in word/document.xml. */
export async function docxText(buf: ArrayBuffer): Promise<string> {
  const xml = await unzipEntry(buf, 'word/document.xml');
  if (!xml) throw new Error('לא הצלחתי לקרוא את קובץ ה-Word');
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Reads one file out of a zip (stored or deflated), using the browser's DecompressionStream. */
export async function unzipEntry(buf: ArrayBuffer, wanted: string): Promise<string | null> {
  const v = new DataView(buf);
  // end of central directory record: scan back from the end
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= buf.byteLength; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) return null;
    const method = v.getUint16(p + 10, true);
    const compSize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    if (name === wanted) {
      const lNameLen = v.getUint16(local + 26, true);
      const lExtraLen = v.getUint16(local + 28, true);
      const data = new Uint8Array(buf, local + 30 + lNameLen + lExtraLen, compSize);
      if (method === 0) return dec.decode(data);
      if (method !== 8) return null;
      const stream = new Response(data).body!.pipeThrough(new DecompressionStream('deflate-raw'));
      return dec.decode(await new Response(stream).arrayBuffer());
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}
