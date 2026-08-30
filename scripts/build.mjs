// Bundles the frontend into site/. No framework: the ElevenLabs React wrapper
// has an open iOS Safari bug that stops client tools firing entirely, and client
// tools are how the lesson advances and answers get marked. The vanilla client
// is the documented way round it.

import * as esbuild from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

await mkdir('site', { recursive: true });

await esbuild.build({
  entryPoints: ['web/app.js'],
  bundle: true,
  format: 'esm',
  target: ['es2022', 'safari16'],
  minify: true,
  sourcemap: true,
  outfile: 'site/app.js',
  define: { 'process.env.NODE_ENV': '"production"' },
});

for (const file of ['index.html', 'styles.css', 'manifest.webmanifest']) {
  if (existsSync(`web/${file}`)) await cp(`web/${file}`, `site/${file}`);
}
if (existsSync('web/parent.html')) await cp('web/parent.html', 'site/parent.html');

// The curriculum is content: one copy in the repo, copied into the site at
// build time so the browser can read a lesson without a round trip to the API.
await cp('api/curriculum', 'site/curriculum', { recursive: true });

console.log('built → site/');
