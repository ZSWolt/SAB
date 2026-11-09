// jsdom gaps
if (!(globalThis as any).CSS) (globalThis as any).CSS = {};
if (!(globalThis as any).CSS.escape) (globalThis as any).CSS.escape = (s: string) => s.replace(/["\\\]]/g, '\\$&');
