/**
 * Static server for the design-artifacts mockups.
 *
 * The mockups are plain HTML under
 * `design-artifacts/D-Design-System/01-Visual-Design/`, and they load
 * `../tokens.css` relatively. Opening them from `file://` works in most
 * browsers but is blocked in some sandboxes, and the gallery's iframes
 * render more predictably over http.
 *
 * Usage:
 *   node scripts/mockup-server.mjs [port]
 *
 * Serves `design-artifacts/D-Design-System/01-Visual-Design/` at the root,
 * so:
 *   /gallery.html            -> the mockup gallery
 *   /mockups/08-login.html   -> a single mockup
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, resolve } from 'node:path';

const ROOT = resolve(
  'design-artifacts/D-Design-System/01-Visual-Design',
);
const PORT = Number(process.argv[2] || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') pathname = '/gallery.html';

    // Contain every request under ROOT — no traversal out of the design
    // artifacts directory.
    const target = normalize(join(ROOT, pathname));
    if (!target.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const info = await stat(target).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }

    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': MIME[extname(target)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end(String(error));
  }
});

server.listen(PORT, () => {
  console.log(`mockups → http://localhost:${PORT}/gallery.html`);
});
