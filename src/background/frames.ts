/** Runs one of the content script's global functions (see src/content/index.ts) in a tab's frames. */
export async function inAllFrames<T>(tabId: number, fn: string, args: unknown[] = [], frameIds?: number[]) {
  const results = await chrome.scripting.executeScript({
    target: frameIds ? { tabId, frameIds } : { tabId, allFrames: true },
    func: (name: string, a: unknown[]) => {
      const f = (globalThis as unknown as Record<string, (...x: unknown[]) => unknown>)[name];
      return typeof f === 'function' ? f(...a) : null;
    },
    args: [fn, args],
  });
  return results
    .filter((r) => r.result !== null && r.result !== undefined)
    .map((r) => ({ frameId: r.frameId, result: r.result as T }));
}

/**
 * A name for a frame that stays the same when the site rebuilds it (its frameId changes): "top", or
 * a short hash of the iframe's address without the query, plus which one it is among frames with
 * the same address.
 */
export function frameTokens(frames: { frameId: number; url: string; top: boolean }[]): Map<number, string> {
  const out = new Map<number, string>();
  const seen = new Map<string, number>();
  for (const f of [...frames].sort((a, b) => a.frameId - b.frameId)) {
    if (f.top) {
      out.set(f.frameId, 'top');
      continue;
    }
    const base = f.url.split(/[?#]/)[0];
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.set(f.frameId, `f${hash(base)}.${n}`);
  }
  return out;
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Where every frame of the tab is now: frameId → token. */
export async function currentFrames(tabId: number): Promise<Map<number, string>> {
  const res = await inAllFrames<{ url: string; top: boolean }>(tabId, '__sabWhere').catch(() => []);
  return frameTokens(res.map((r) => ({ frameId: r.frameId, ...r.result })));
}
