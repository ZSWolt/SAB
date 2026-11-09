// Bundles the extension into dist/ (load it in chrome://extensions → "Load unpacked").
import { build, context } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const watch = process.argv.includes('--watch');
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('static', 'dist', { recursive: true });

// Version: CI sets SAB_VERSION (e.g. 0.2.57). build.json lets the extension notice when the files on
// disk were replaced by the auto-updater, and reload itself.
const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
if (process.env.SAB_VERSION) manifest.version = process.env.SAB_VERSION;
writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));
writeFileSync(
  'dist/build.json',
  JSON.stringify({ version: manifest.version, commit: process.env.GITHUB_SHA ?? 'local', builtAt: new Date().toISOString() }, null, 2),
);

const options = {
  entryPoints: {
    background: 'src/background/index.ts',
    content: 'src/content/index.ts',
    options: 'src/options/options.ts',
  },
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  target: 'chrome116',
  sourcemap: 'linked',
  minify: !watch,
  logLevel: 'info',
  loader: { '.woff2': 'binary' },
};

// Content scripts can't be ES modules, so build it as an IIFE separately.
const bgOpts = { ...options, entryPoints: { background: options.entryPoints.background, options: options.entryPoints.options } };
const contentOpts = { ...options, entryPoints: { content: options.entryPoints.content }, format: 'iife' };

if (watch) {
  for (const o of [bgOpts, contentOpts]) await (await context(o)).watch();
} else {
  await Promise.all([build(bgOpts), build(contentOpts)]);
}
