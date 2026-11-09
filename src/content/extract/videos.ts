import type { VideoInfo } from '../../shared/types';

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Turns any YouTube link/embed into https://www.youtube.com/watch?v=ID, or null. */
export function youtubeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw, 'https://www.youtube.com');
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  }
  return id && ID_RE.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}

/** YouTube videos in this frame: embeds, links, and the frame itself if it is a YouTube player. */
export function findVideos(doc: Document = document): VideoInfo[] {
  const found = new Map<string, VideoInfo>();
  const add = (raw: string | null, title?: string | null) => {
    const url = youtubeUrl(raw);
    if (url && !found.has(url)) found.set(url, { url, ...(title?.trim() ? { title: title.trim().slice(0, 150) } : {}) });
  };
  add(location.href, doc.title);
  doc.querySelectorAll('iframe').forEach((f) => add(f.getAttribute('src') ?? f.getAttribute('data-src'), f.getAttribute('title')));
  doc.querySelectorAll('a[href]').forEach((a) => add(a.getAttribute('href'), a.textContent));
  doc.querySelectorAll('[data-video-id]').forEach((el) => add(`https://youtu.be/${el.getAttribute('data-video-id')}`));
  return Array.from(found.values()).slice(0, 10);
}
