/**
 * Build the three bundles the manifest references.
 *
 * Three entry points, not one: the service worker, the side panel, and the
 * script injected into pages being saved. The injected one is bundled as an
 * IIFE so its final expression is what chrome.scripting.executeScript resolves
 * to, and so nothing from the worker's scope is serialised into a page.
 */
import { build } from 'esbuild';
import fs from 'node:fs';

fs.rmSync('dist', { recursive: true, force: true });

const common = { bundle: true, minify: true, target: 'chrome120', logLevel: 'warning' };

await Promise.all([
  build({
    ...common,
    entryPoints: ['background.ts'],
    outfile: 'dist/background.js',
    format: 'esm',
  }),
  build({ ...common, entryPoints: ['sidepanel.ts'], outfile: 'dist/sidepanel.js', format: 'esm' }),
  build({
    ...common,
    entryPoints: ['extract-entry.ts'],
    outfile: 'dist/extract.js',
    format: 'iife',
  }),
]);

for (const file of fs.readdirSync('dist')) {
  const { size } = fs.statSync(`dist/${file}`);
  console.log(`dist/${file}  ${(size / 1024).toFixed(1)} KB`);
}
