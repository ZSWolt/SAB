import { describe, expect, it } from 'vitest';
import { documentRef, findDocuments } from '../../src/content/extract/documents';

describe('documentRef', () => {
  it('recognizes Google Docs, Drive files and PDFs', () => {
    expect(documentRef('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit', 'הסיפור', false)).toMatchObject({
      kind: 'gdoc',
      fetchUrl: 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/export?format=txt',
      title: 'הסיפור',
    });
    expect(documentRef('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view', '', true)).toMatchObject({
      kind: 'drive',
      fetchUrl: 'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQrStUvWxYz012345',
    });
    expect(documentRef('/files/story.pdf#page=2', '', false)).toMatchObject({ kind: 'pdf', title: 'story.pdf' });
    expect(documentRef('https://example.com/page.html', '', false)).toBeNull();
    expect(documentRef('https://docs.google.com/forms/d/abc/viewform', '', false)).toBeNull();
  });
});

describe('findDocuments', () => {
  it('lists embedded documents first and skips navigation links', () => {
    document.body.innerHTML = `
      <nav><a href="/guide.pdf">מדריך</a></nav>
      <a href="/a.pdf">קישור</a>
      <iframe src="https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/preview" title="הסיפור"></iframe>`;
    const d = findDocuments();
    expect(d.map((x) => x.kind)).toEqual(['gdoc', 'pdf']);
    expect(d[0].embedded).toBe(true);
  });
});
