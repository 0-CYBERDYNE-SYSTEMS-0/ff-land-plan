#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { createServer } from 'node:http';

const ROOT = resolve('dist');
const BASE = '/ff-land-plan';
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 4173);
const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

if (!existsSync(resolve(ROOT, 'index.html'))) {
  throw new Error('dist/index.html is missing; run npm run build:pages first.');
}

const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', `http://${HOST}:${PORT}`).pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  if (pathname !== BASE && !pathname.startsWith(`${BASE}/`)) {
    response.writeHead(404).end('Not found');
    return;
  }

  const relative = pathname === BASE || pathname === `${BASE}/`
    ? 'index.html'
    : pathname.slice(BASE.length + 1);
  const candidate = resolve(ROOT, relative);
  if (candidate !== ROOT && !candidate.startsWith(`${ROOT}${sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  const file = existsSync(candidate) && statSync(candidate).isFile()
    ? candidate
    : request.headers.accept?.includes('text/html')
      ? resolve(ROOT, 'index.html')
      : null;
  if (!file) {
    response.writeHead(404).end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  if (request.method === 'HEAD') response.end();
  else createReadStream(file).pipe(response);
});

server.listen(PORT, HOST, () => {
  console.log(`Pages preview: http://${HOST}:${PORT}${BASE}/`);
});
