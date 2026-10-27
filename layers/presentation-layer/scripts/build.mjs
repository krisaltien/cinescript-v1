import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createHtml } from './html.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));

export async function buildAssets() {
  await build({
    absWorkingDir: root,
    entryPoints: ['src/main.js'], outfile: 'dist/graph.js',
    bundle: true, format: 'iife', target: ['es2022'], minify: true,
    legalComments: 'eof',
  });
  const [script, css] = await Promise.all([
    readFile(path.join(root, 'dist/graph.js'), 'utf8'),
    readFile(path.join(root, 'dist/graph.css'), 'utf8'),
  ]);
  return { script, css };
}

export async function buildFrontend() {
  const assets = await buildAssets();
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist/index.html'), createHtml(assets));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await buildFrontend();
  console.log('Built layers/presentation-layer/dist/index.html');
}
