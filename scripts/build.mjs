// Bundles the extension into dist/ (load it in chrome://extensions → "Load unpacked").
import { build, context } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('static', 'dist', { recursive: true });

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
};

// Content scripts can't be ES modules, so build it as an IIFE separately.
const bgOpts = { ...options, entryPoints: { background: options.entryPoints.background, options: options.entryPoints.options } };
const contentOpts = { ...options, entryPoints: { content: options.entryPoints.content }, format: 'iife' };

if (watch) {
  for (const o of [bgOpts, contentOpts]) await (await context(o)).watch();
} else {
  await Promise.all([build(bgOpts), build(contentOpts)]);
}
