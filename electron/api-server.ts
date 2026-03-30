import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import * as tar from 'tar';

// ── constants ─────────────────────────────────────────────────────────────────

const REPO_OWNER     = 'DatanoiseTV';
const REPO_NAME      = 'dsplab-projects';
const REPO_BRANCH    = 'main';
const REPO_CACHE_DIR = path.join(os.tmpdir(), `dsplab-repo-cache-${REPO_NAME}`);
const REPO_POLL_MS   = 5 * 60 * 1000;

let sandboxWorkdir: string;
let appResourcesPath: string;
let staticDir: string | null = null;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.cjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':  'font/ttf',
  '.wasm': 'application/wasm',
  '.map':  'application/json',
};

// ── helpers ───────────────────────────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function httpsGet(url: string, extraHeaders: Record<string, string> = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'DSPLab/1.0', Accept: '*/*', ...extraHeaders },
    }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && res.headers.location) {
        httpsGet(res.headers.location, extraHeaders).then(resolve, reject);
        res.resume();
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

// ── repo mirror ───────────────────────────────────────────────────────────────

interface RepoState {
  etag:        string;
  lastChecked: number;
  lastUpdated: number;
  fileCount:   number;
}

let repoState: RepoState | null = null;
let repoRefreshInflight: Promise<void> | null = null;

const TARBALL_URL = `https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/tar.gz/${REPO_BRANCH}`;
const ETAG_FILE   = path.join(REPO_CACHE_DIR, '.etag');
const META_FILE   = path.join(REPO_CACHE_DIR, '.meta.json');

function loadPersistedState(): RepoState | null {
  try {
    if (fs.existsSync(META_FILE)) return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  } catch { /* ignore */ }
  return null;
}

function savePersistedState(s: RepoState) {
  fs.writeFileSync(META_FILE, JSON.stringify(s));
}

async function refreshRepo(token?: string): Promise<void> {
  if (repoRefreshInflight) return repoRefreshInflight;

  repoRefreshInflight = (async () => {
    ensureDir(REPO_CACHE_DIR);
    const currentEtag = repoState?.etag ?? (fs.existsSync(ETAG_FILE) ? fs.readFileSync(ETAG_FILE, 'utf8').trim() : '');

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `token ${token}`;
    if (currentEtag) headers['If-None-Match'] = currentEtag;

    let res: Awaited<ReturnType<typeof httpsGet>>;
    try {
      res = await httpsGet(TARBALL_URL, headers);
    } catch (e) {
      console.warn('[dsplab] repo fetch error:', e);
      repoRefreshInflight = null;
      return;
    }

    const now = Date.now();

    if (res.status === 304) {
      if (repoState) repoState.lastChecked = now;
      repoRefreshInflight = null;
      return;
    }

    if (res.status !== 200) {
      console.warn('[dsplab] tarball fetch returned', res.status);
      repoRefreshInflight = null;
      return;
    }

    const newEtag = (res.headers['etag'] as string) ?? '';

    try {
      await new Promise<void>((resolve, reject) => {
        const gunzip = zlib.createGunzip();
        const extract = tar.extract({ cwd: REPO_CACHE_DIR, strip: 1, strict: false });
        extract.on('finish', resolve);
        extract.on('error', reject);
        gunzip.on('error', reject);
        Readable.from(res.body).pipe(gunzip).pipe(extract);
      });
    } catch (e) {
      console.error('[dsplab] tar extraction failed:', e);
      repoRefreshInflight = null;
      return;
    }

    let fileCount = 0;
    const countFiles = (dir: string) => {
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        if (f.startsWith('.')) continue;
        if (fs.statSync(full).isDirectory()) countFiles(full);
        else fileCount++;
      }
    };
    try { countFiles(REPO_CACHE_DIR); } catch { /* ignore */ }

    if (newEtag) fs.writeFileSync(ETAG_FILE, newEtag);

    repoState = { etag: newEtag, lastChecked: now, lastUpdated: now, fileCount };
    savePersistedState(repoState);
    console.log(`[dsplab] repo cache updated — ${fileCount} files`);

    repoRefreshInflight = null;
  })();

  return repoRefreshInflight;
}

function maybeRefresh(token?: string) {
  const now = Date.now();
  if (!repoState || now - repoState.lastChecked > REPO_POLL_MS) {
    refreshRepo(token).catch(e => console.warn('[dsplab] bg refresh error:', e));
  }
}

// ── request helpers ───────────────────────────────────────────────────────────

function parseQuery(url: string): URLSearchParams {
  return new URLSearchParams((url ?? '').replace(/^[^?]*\??/, ''));
}

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
  });
}

// ── route handler ─────────────────────────────────────────────────────────────

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = req.url ?? '';
  const pathname = url.split('?')[0];

  // CORS for local renderer
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (pathname === '/api/repo/status') {
    json(res, {
      ready:       fs.existsSync(REPO_CACHE_DIR) && (repoState?.fileCount ?? 0) > 0,
      lastUpdated: repoState?.lastUpdated ?? null,
      fileCount:   repoState?.fileCount   ?? 0,
      etag:        repoState?.etag        ?? '',
    });
    return;
  }

  if (pathname === '/api/repo/tree') {
    maybeRefresh();
    const tree: { path: string; type: 'blob' }[] = [];
    const walk = (dir: string, rel: string) => {
      if (!fs.existsSync(dir)) return;
      for (const name of fs.readdirSync(dir)) {
        if (name.startsWith('.')) continue;
        const abs  = path.join(dir, name);
        const relp = rel ? `${rel}/${name}` : name;
        if (fs.statSync(abs).isDirectory()) walk(abs, relp);
        else if (name.endsWith('.vult') || name.endsWith('.vult.meta')) tree.push({ path: relp, type: 'blob' });
      }
    };
    walk(REPO_CACHE_DIR, '');
    json(res, { tree, cached: true, lastUpdated: repoState?.lastUpdated ?? null });
    return;
  }

  if (pathname === '/api/repo/file') {
    maybeRefresh();
    const qs    = parseQuery(url);
    const fpath = qs.get('path') ?? '';
    if (!fpath || fpath.includes('..') || fpath.startsWith('/')) { json(res, { error: 'Invalid path' }, 400); return; }
    const abs = path.join(REPO_CACHE_DIR, fpath);
    if (!abs.startsWith(REPO_CACHE_DIR + path.sep) && abs !== REPO_CACHE_DIR) { json(res, { error: 'Forbidden' }, 403); return; }
    if (!fs.existsSync(abs)) { json(res, { error: 'Not found' }, 404); return; }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(fs.readFileSync(abs, 'utf8'));
    return;
  }

  if (pathname === '/api/repo/refresh') {
    const qs    = parseQuery(url);
    const token = qs.get('token') ?? undefined;
    if (repoState) repoState.lastChecked = 0;
    refreshRepo(token)
      .then(() => json(res, { ok: true, fileCount: repoState?.fileCount ?? 0 }))
      .catch(e => json(res, { error: String(e) }, 500));
    return;
  }

  if (pathname === '/api/compile') {
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    readBody(req).then(body => {
      try {
        const requestData = JSON.parse(body);
        const bridgePath = path.join(appResourcesPath, 'compiler', 'vult-compiler-bridge.cjs');
        // In packaged Electron, 'node' isn't on PATH. Use Electron's own
        // binary with ELECTRON_RUN_AS_NODE=1 to act as a plain Node process.
        const nodeBin = process.execPath;
        const child = spawn(nodeBin, ['--stack-size=1000000', bridgePath], {
          env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
            VULT_SANDBOX:        'true',
            VULT_SANDBOX_DIR:    sandboxWorkdir,
            VULT_ALLOW_EXTERNAL: 'false',
          },
        });

        let output = '';
        let error  = '';
        child.stdout.on('data', d => { output += d; });
        child.stderr.on('data', d => { error  += d; });
        child.on('close', (code) => {
          res.setHeader('Content-Type', 'application/json');
          if (code === 0) { res.end(output); }
          else { res.writeHead(500); res.end(error || JSON.stringify({ error: 'Compilation failed' })); }
        });

        child.stdin.write(JSON.stringify(requestData));
        child.stdin.end();
      } catch {
        json(res, { error: 'Invalid request body' }, 400);
      }
    });
    return;
  }

  // Static file serving (production mode)
  if (staticDir) {
    let filePath = pathname === '/' ? '/index.html' : pathname;
    const absPath = path.join(staticDir, filePath);

    // Security: ensure path is inside staticDir
    if (!absPath.startsWith(staticDir + path.sep) && absPath !== staticDir) {
      json(res, { error: 'Forbidden' }, 403);
      return;
    }

    if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
      const ext = path.extname(absPath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      fs.createReadStream(absPath).pipe(res);
      return;
    }

    // SPA fallback: serve index.html for unmatched routes
    const indexPath = path.join(staticDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.createReadStream(indexPath).pipe(res);
      return;
    }
  }

  // Not found
  json(res, { error: 'Not found' }, 404);
}

// ── public API ────────────────────────────────────────────────────────────────

export function startApiServer(resourcesPath: string, distDir?: string): Promise<number> {
  appResourcesPath = resourcesPath;
  staticDir = distDir ?? null;
  sandboxWorkdir = path.join(os.tmpdir(), 'vult-sandbox');
  ensureDir(sandboxWorkdir);
  ensureDir(REPO_CACHE_DIR);

  repoState = loadPersistedState();
  refreshRepo().catch(e => console.warn('[dsplab] initial repo fetch:', e));

  return new Promise((resolve, reject) => {
    const server = http.createServer(handleRequest);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        console.log(`[dsplab] API server listening on port ${addr.port}`);
        resolve(addr.port);
      } else {
        reject(new Error('Failed to get server address'));
      }
    });
    server.on('error', reject);
  });
}
