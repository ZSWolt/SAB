import { describe, expect, it } from 'vitest';
import { findVideos, youtubeUrl } from '../../src/content/extract/videos';
import { interactionText } from '../../src/ai/gemini';

describe('youtubeUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=x', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0', 'dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('%s', (raw, id) => expect(youtubeUrl(raw)).toBe(`https://www.youtube.com/watch?v=${id}`));
  it('rejects other links', () => {
    expect(youtubeUrl('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeUrl('https://www.youtube.com/channel/abc')).toBeNull();
  });
});

describe('findVideos', () => {
  it('finds embeds and links once each', () => {
    document.body.innerHTML = `
      <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="שיר"></iframe>
      <a href="https://youtu.be/dQw4w9WgXcQ">אותו סרטון</a>
      <a href="https://www.youtube.com/watch?v=9hE5-98ZeCg">הרצאה</a>`;
    const v = findVideos();
    expect(v.map((x) => x.url)).toEqual([
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=9hE5-98ZeCg',
    ]);
    expect(v[0].title).toBe('שיר');
  });
});

describe('interactionText', () => {
  it('reads model_output steps', () => {
    expect(
      interactionText({
        steps: [
          { type: 'thought', content: [{ type: 'text', text: 'x' }] },
          { type: 'model_output', content: [{ type: 'text', text: 'תיאור' }] },
        ],
      }),
    ).toBe('תיאור');
  });
  it('reads output_text', () => expect(interactionText({ output_text: 'a' })).toBe('a'));
});
