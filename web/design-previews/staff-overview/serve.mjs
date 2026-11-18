import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
const files = new Map(['index.html', 'preview.css', 'base.css', 'tokens.css', 'preview.js'].map(name => [`/${name}`, new URL(name, import.meta.url)]));
files.set('/', new URL('index.html', import.meta.url));
files.set('/public/images/logo.png', new URL('../../public/images/logo.png', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  const file = files.get(new URL(request.url, 'http://127.0.0.1').pathname);
  if (!file) { response.writeHead(404).end(); return; }
  try {
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file.pathname)], 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(404).end(); }
}).listen(5186, '127.0.0.1', () => console.log('Staff overview preview: http://127.0.0.1:5186/'));
