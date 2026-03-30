# DSPLab Electron Desktop App

## Goal

Package DSPLab as a standalone Electron desktop app for macOS, Windows, and Linux with distributable installers. Phase A is a straight port; Phase B adds desktop-specific enhancements.

## Phase A: Straight Port

### Architecture

Two Electron processes:

- **Main process** (`electron/main.ts`) — creates BrowserWindow, runs local API server, manages app lifecycle
- **Renderer process** — the existing React app, loaded from Vite dev server (dev) or built files (production)

### API Server Extraction

The Vult compilation API and repo cache endpoints currently live as Vite dev middleware in `vite.config.ts`. These must be extracted into a standalone module that runs in the Electron main process:

- `electron/api-server.ts` — Express or raw `http` server on a random local port
- Endpoints: `/api/compile`, `/api/repo/status`, `/api/repo/tree`, `/api/repo/file`, `/api/repo/refresh`
- The renderer connects to `http://localhost:<port>` — port communicated via `preload.ts` context bridge

### Vult Compiler Bundling

- `vultc` binary and `vult-compiler-bridge.cjs` ship inside Electron's `extraResources`
- Paths resolved at runtime via `app.getPath('exe')` / `process.resourcesPath`
- Sandbox directory uses `app.getPath('temp')` instead of `VULT_SANDBOX_DIR`

### Electron Configuration

**Main process** (`electron/main.ts`):
- Create BrowserWindow with:
  - `nodeIntegration: false`
  - `contextIsolation: true`
  - `webSecurity: true`
  - `width: 1400, height: 900`
- In dev: load `http://localhost:5173` (Vite dev server)
- In production: load `file://<dist>/index.html` via a custom protocol or the local API server
- Request microphone permission on macOS (`systemPreferences.askForMediaAccess('microphone')`)

**Preload** (`electron/preload.ts`):
- Expose API server port to renderer via `contextBridge`
- No other Node.js APIs exposed (security)

**electron-builder.yml**:
- macOS: `.dmg` + code signing entitlements (microphone, network)
- Windows: NSIS installer (`.exe`)
- Linux: `.AppImage` + `.deb`
- `extraResources`: `vultc` binary, `vult-compiler-bridge.cjs`, `vultweb.cjs`, `v1-vultweb.cjs`

### Permissions

- **Microphone** — required for live audio input (`getUserMedia`). macOS needs entitlement `com.apple.security.device.audio-input`. Electron main process calls `systemPreferences.askForMediaAccess('microphone')` on app ready.
- **MIDI** — WebMIDI works in Electron's Chromium with no extra permissions.
- **Network** — local loopback only (API server). AI providers use HTTPS fetch. macOS entitlement `com.apple.security.network.client`.
- **File system** — sandboxed to temp directory for compilation. No broad FS access in Phase A.

### Build & Dev Scripts

- `npm run electron:dev` — starts Vite dev server + Electron concurrently (using `concurrently` or `electron-vite`)
- `npm run electron:build` — runs `vite build`, then `electron-builder`
- `npm run electron:preview` — builds and launches locally without packaging

### What Does NOT Change

- All React components, hooks, styles, contexts
- Web Audio API / AudioWorklet / WebMIDI usage
- Monaco editor configuration
- AI provider integrations
- localStorage persistence
- `public/` assets (vult-processor.js, compiler bundles served by API server or loaded from file)

### New Files

```
electron/
  main.ts           — Electron main process entry
  preload.ts         — Context bridge (exposes API port)
  api-server.ts      — Extracted API endpoints (compile, repo)
electron-builder.yml — Packaging config for all platforms
build/
  entitlements.mac.plist — macOS entitlements (microphone, network)
```

### Dependencies to Add

- `electron` (dev dependency)
- `electron-builder` (dev dependency)
- `concurrently` (dev dependency, for parallel dev mode)
- `express` (dependency, for API server in main process — or use Node `http` to avoid extra dep)

## Phase B: Desktop Enhancements (Future)

Deferred to a follow-up spec. Potential features:
- Native file open/save dialogs for `.vult` files
- System menu bar with standard Edit/View/Help menus
- Window state persistence (size, position)
- Auto-update via `electron-updater`
- Dock/taskbar icon with badge
- Recent files list
- Crash reporting

## Risks

- **AudioWorklet in Electron** — works reliably in recent Electron versions (Chromium-based). Pin Electron to a version with known AudioWorklet stability.
- **Cross-platform `vultc` binary** — need platform-specific binaries in extraResources. May need conditional bundling per platform.
- **Production file serving** — loading `file://` URLs can cause CORS issues with AudioWorklet. Mitigate by serving all content through the local API server or using a custom Electron protocol.
