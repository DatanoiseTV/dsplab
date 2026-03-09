import { defineConfig }  from 'vite'
import react             from '@vitejs/plugin-react'
import { spawn }         from 'child_process'
import https             from 'https'
import http              from 'http'
import { Readable }      from 'stream'
import path              from 'path'
import os                from 'os'
import fs                from 'fs'
import zlib              from 'zlib'
import * as tar          from 'tar'

// ── constants ─────────────────────────────────────────────────────────────────

const SANDBOX_WORKDIR  = process.env.VULT_SANDBOX_DIR || path.join(os.tmpdir(), 'vult-sandbox');
const REPO_OWNER       = 'DatanoiseTV';
const REPO_NAME        = 'dsplab-projects';
const REPO_BRANCH      = 'main';
const REPO_CACHE_DIR   = path.join(os.tmpdir(), `dsplab-repo-cache-${REPO_NAME}`);
// Re-check for new commits at most once every 5 minutes
const REPO_POLL_MS     = 5 * 60 * 1000;

// ── helpers ───────────────────────────────────────────────────────────────────

function ensureSandboxDir() {
  if (!fs.existsSync(SANDBOX_WORKDIR)) fs.mkdirSync(SANDBOX_WORKDIR, { recursive: true });
}

function ensureRepoCache() {
  if (!fs.existsSync(REPO_CACHE_DIR)) fs.mkdirSync(REPO_CACHE_DIR, { recursive: true });
}

// Simple https GET → Buffer
function httpsGet(url: string, extraHeaders: Record<string, string> = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'DSPLab/1.0',
        'Accept': '*/*',
        ...extraHeaders,
      },
    }, (res) => {
      // Follow up to 3 redirects
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
// State stored in memory — survives the vite session but resets on restart.

interface RepoState {
  etag:        string;
  lastChecked: number;     // Date.now() when we last polled
  lastUpdated: number;     // Date.now() when files were last written
  fileCount:   number;
}

let repoState: RepoState | null = null;
let repoRefreshInflight: Promise<void> | null = null;

const TARBALL_URL = `https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/tar.gz/${REPO_BRANCH}`;
const ETAG_FILE   = path.join(REPO_CACHE_DIR, '.etag');
const META_FILE   = path.join(REPO_CACHE_DIR, '.meta.json');

function loadPersistedState(): RepoState | null {
  try {
    if (fs.existsSync(META_FILE)) {
      return JSON.parse(fs.readFileSync(META_FILE, 'utf8')) as RepoState;
    }
  } catch { /* ignore */ }
  return null;
}

function savePersistedState(s: RepoState) {
  fs.writeFileSync(META_FILE, JSON.stringify(s));
}

async function refreshRepo(token?: string): Promise<void> {
  if (repoRefreshInflight) return repoRefreshInflight;

  repoRefreshInflight = (async () => {
    ensureRepoCache();
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
      // Not modified — just update poll timestamp
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

    // Extract tarball into REPO_CACHE_DIR, stripping the top-level folder
    // (GitHub tarballs contain a single root dir like "dsplab-projects-main/")
    try {
      await new Promise<void>((resolve, reject) => {
        const gunzip = zlib.createGunzip();
        const extract = tar.extract({
          cwd: REPO_CACHE_DIR,
          strip: 1,           // strip the root "reponame-branch/" prefix
          strict: false,
        });
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

    // Count extracted files
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

// Trigger a refresh if the poll interval has elapsed (non-blocking)
function maybeRefresh(token?: string) {
  const now = Date.now();
  if (!repoState || now - repoState.lastChecked > REPO_POLL_MS) {
    refreshRepo(token).catch(e => console.warn('[dsplab] bg refresh error:', e));
  }
}

// ── vite config ───────────────────────────────────────────────────────────────

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'dsplab-api',
      configureServer(server) {
        ensureSandboxDir();
        ensureRepoCache();

        // Load persisted state and kick off initial fetch
        repoState = loadPersistedState();
        refreshRepo().catch(e => console.warn('[dsplab] initial repo fetch:', e));

        // ── /api/repo/status — poll state ──────────────────────────────────
        server.middlewares.use('/api/repo/status', (_req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            ready:       fs.existsSync(REPO_CACHE_DIR) && (repoState?.fileCount ?? 0) > 0,
            lastUpdated: repoState?.lastUpdated ?? null,
            fileCount:   repoState?.fileCount   ?? 0,
            etag:        repoState?.etag        ?? '',
          }));
        });

        // ── /api/repo/tree — list all .vult and .vult.meta files ───────────
        server.middlewares.use('/api/repo/tree', (_req, res) => {
          maybeRefresh();
          const tree: { path: string; type: 'blob' }[] = [];

          const walk = (dir: string, rel: string) => {
            if (!fs.existsSync(dir)) return;
            for (const name of fs.readdirSync(dir)) {
              if (name.startsWith('.')) continue;
              const abs  = path.join(dir, name);
              const relp = rel ? `${rel}/${name}` : name;
              if (fs.statSync(abs).isDirectory()) {
                walk(abs, relp);
              } else if (name.endsWith('.vult') || name.endsWith('.vult.meta')) {
                tree.push({ path: relp, type: 'blob' });
              }
            }
          };

          walk(REPO_CACHE_DIR, '');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ tree, cached: true, lastUpdated: repoState?.lastUpdated ?? null }));
        });

        // ── /api/repo/file?path=... — serve a cached file ──────────────────
        server.middlewares.use('/api/repo/file', (req, res) => {
          maybeRefresh();
          const qs    = new URLSearchParams((req.url ?? '').replace(/^[^?]*\??/, ''));
          const fpath = qs.get('path') ?? '';

          // Security: prevent path traversal
          if (!fpath || fpath.includes('..') || fpath.startsWith('/')) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid path' }));
            return;
          }

          const abs = path.join(REPO_CACHE_DIR, fpath);
          // Ensure resolved path is inside cache dir
          if (!abs.startsWith(REPO_CACHE_DIR + path.sep) && abs !== REPO_CACHE_DIR) {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: 'Forbidden' }));
            return;
          }

          if (!fs.existsSync(abs)) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
          }

          const content = fs.readFileSync(abs, 'utf8');
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(content);
        });

        // ── /api/repo/refresh — manual refresh trigger ─────────────────────
        server.middlewares.use('/api/repo/refresh', (req, res) => {
          const qs    = new URLSearchParams((req.url ?? '').replace(/^[^?]*\??/, ''));
          const token = qs.get('token') ?? undefined;
          // Bust the poll timer and force a re-check
          if (repoState) repoState.lastChecked = 0;
          refreshRepo(token)
            .then(() => {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, fileCount: repoState?.fileCount ?? 0 }));
            })
            .catch(e => {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: String(e) }));
            });
        });

        // ── /api/compile ───────────────────────────────────────────────────
        server.middlewares.use('/api/compile', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }

          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const requestData = JSON.parse(body);
              const child = spawn('node', [
                '--stack-size=1000000',
                path.join(process.cwd(), 'vult-compiler-bridge.cjs'),
              ], {
                env: {
                  ...process.env,
                  VULT_SANDBOX:        'true',
                  VULT_SANDBOX_DIR:    SANDBOX_WORKDIR,
                  VULT_ALLOW_EXTERNAL: 'false',
                },
              });

              let output = '';
              let error  = '';
              child.stdout.on('data', d => { output += d; });
              child.stderr.on('data', d => { error  += d; });
              child.on('close', (code) => {
                res.setHeader('Content-Type', 'application/json');
                if (code === 0) res.end(output);
                else { res.statusCode = 500; res.end(error || JSON.stringify({ error: 'Compilation failed' })); }
              });

              child.stdin.write(JSON.stringify(requestData));
              child.stdin.end();
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid request body' }));
            }
          });
        });
      },
    },
  ],

})
