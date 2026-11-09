// IBM Plex Sans Hebrew + IBM Plex Mono (SIL Open Font License), bundled into the script so no file
// is exposed to web pages (sites can't probe for the extension through it).
import hebrew400 from './fonts/plex-hebrew-400.woff2';
import hebrew500 from './fonts/plex-hebrew-500.woff2';
import latin400 from './fonts/plex-latin-400.woff2';
import latin500 from './fonts/plex-latin-500.woff2';
import mono400 from './fonts/mono-400.woff2';

const HEBREW = 'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F';
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

let loaded = false;

/** Adds the fonts to the page's font set (fonts added there also work inside our shadow DOM). */
export function loadFonts(): void {
  if (loaded || typeof FontFace === 'undefined' || !document.fonts) return;
  loaded = true;
  const faces: [string, Uint8Array, string, string][] = [
    ['SAB Plex Hebrew', hebrew400, '400', HEBREW],
    ['SAB Plex Hebrew', hebrew500, '500', HEBREW],
    ['SAB Plex Hebrew', latin400, '400', LATIN],
    ['SAB Plex Hebrew', latin500, '500', LATIN],
    ['SAB Plex Mono', mono400, '400', LATIN],
  ];
  for (const [family, data, weight, unicodeRange] of faces) {
    try {
      const face = new FontFace(family, data.slice().buffer as ArrayBuffer, { weight, unicodeRange, display: 'swap' });
      document.fonts.add(face);
      face.load().catch(() => {});
    } catch {
      /* the system font stack takes over */
    }
  }
}
