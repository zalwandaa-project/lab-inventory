/**
 * Server lokal untuk uji coba tanpa Netlify:  node dev-server.mjs  → http://localhost:8888
 * Data disimpan di file .local-db.json (bukan Netlify Blobs).
 * Berjalan di Windows, macOS, dan Linux.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
process.env.LOCAL_DB_FILE ||= here('./.local-db.json');
const { handle } = await import(pathToFileURL(here('./netlify/lib/app.mjs')).href);
const PORT = Number(process.env.PORT || 8888);
const ROOT = resolve(here('./public/'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        if (url.pathname.startsWith('/api/')) {
            const chunks = [];
            for await (const c of req) chunks.push(c);
            const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
            const response = await handle(request);
            res.writeHead(response.status, Object.fromEntries(response.headers));
            res.end(Buffer.from(await response.arrayBuffer()));
            return;
        }
        const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
        const file = resolve(ROOT, '.' + rel);
        if (file !== ROOT && !file.startsWith(ROOT + sep)) {
            res.writeHead(403); res.end('Forbidden'); return;
        }
        const data = await readFile(file).catch(() => null);
        if (!data) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
    } catch (e) {
        res.writeHead(500); res.end(String(e));
    }
}).listen(PORT, () => console.log(`Lab Inventory berjalan di http://localhost:${PORT}`));
