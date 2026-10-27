import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildFrontend, root } from './build.mjs';

await buildFrontend();
const port = Number(process.env.PORT || 4173);
const server = createServer(async (request, response) => {
  if (request.url !== '/' && request.url !== '/index.html') {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const html = await readFile(path.join(root, 'dist/index.html'));
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
  } catch {
    response.writeHead(500).end('Build unavailable. Run pnpm build and restart.');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`人物关系图谱：http://127.0.0.1:${port}`));
