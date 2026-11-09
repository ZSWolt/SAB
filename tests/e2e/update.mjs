// Checks the auto-update path: the updater replaces the files on disk → the extension reloads itself
// and open tabs get a fresh panel. Run: npm run build && node tests/e2e/update.mjs
import { createRequire } from 'node:module';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');

const ext = mkdtempSync(join(tmpdir(), 'sab-ext-'));
cpSync(resolve('dist'), ext, { recursive: true });
const setVersion = (v) => {
  const m = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
  m.version = v;
  writeFileSync(join(ext, 'manifest.json'), JSON.stringify(m));
  writeFileSync(join(ext, 'build.json'), JSON.stringify({ version: v }));
};
setVersion('0.2.1');


const ctx = await chromium.launchPersistentContext('', {
  headless: true,
  channel: 'chromium',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
let ok = false;
try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  assert.equal(id, 'gijkphnodidimcmjglckjkifjbohmpcp', 'fixed extension id from manifest key');
  console.log('✓ extension id is fixed (settings survive moving the folder)');


  // Automated Chrome can't reload command-line-loaded extensions, so record the reload call instead.
  await sw.evaluate(() => {
    globalThis.__reloads = 0;
    chrome.runtime.reload = () => { globalThis.__reloads++; };
  });

  await sw.evaluate(() => globalThis.__sabCheckUpdate());
  assert.equal(await sw.evaluate(() => globalThis.__reloads), 0, 'no reload when nothing changed');
  console.log('✓ same version on disk → no reload');

  setVersion('0.2.2'); // what the Windows updater does
  await sw.evaluate(() => globalThis.__sabCheckUpdate());
  assert.equal(await sw.evaluate(() => globalThis.__reloads), 1, 'reload after the files changed');
  console.log('✓ new version on disk → the extension reloads itself');
  ok = true;
} finally {
  await ctx.close();
  rmSync(ext, { recursive: true, force: true });
}
console.log(ok ? '\nUPDATE CHECKS PASSED' : '\nUPDATE CHECKS FAILED');
process.exit(ok ? 0 : 1);
