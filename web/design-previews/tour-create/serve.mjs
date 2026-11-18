import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
const files = new Map(['index.html', 'preview.css', 'base.css', 'tokens.css', 'preview.js'].map(name => [`/${name}`, new URL(name, import.meta.url)]));
files.set('/', new URL('index.html', import.meta.url));
files.set('/public/images/logo.png', new URL('../../public/images/logo.png', import.meta.url));
createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  const file = files.get(new URL(request.url, 'http://localhost').pathname);
  if (!file) { response.writeHead(404).end(); return; }
  try {
    const data = await readFile(file);
    const extension = fileURLToPath(file).slice(fileURLToPath(file).lastIndexOf('.'));
    response.writeHead(200, { 'Content-Type': types[extension], 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch { response.writeHead(404).end(); }
}).listen(5185, '127.0.0.1', () => console.log('Tour layout preview: http://127.0.0.1:5185/?sample=1'));
