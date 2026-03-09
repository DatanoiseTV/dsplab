import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'child_process'
import path from 'path'
import os from 'os'

const SANDBOX_WORKDIR = process.env.VULT_SANDBOX_DIR || path.join(os.tmpdir(), 'vult-sandbox');

function ensureSandboxDir() {
  const fs = require('fs');
  if (!fs.existsSync(SANDBOX_WORKDIR)) {
    fs.mkdirSync(SANDBOX_WORKDIR, { recursive: true });
  }
  return SANDBOX_WORKDIR;
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'vult-compiler-api',
      configureServer(server) {
        ensureSandboxDir();
        
        server.middlewares.use('/api/compile', (req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const requestData = JSON.parse(body);
                
                // Spawn node with sandbox enabled
                // VULT_SANDBOX=true enforces sandbox mode (uses internal compiler only)
                // VULT_SANDBOX_DIR sets the work directory for temp files
                const child = spawn('node', [
                  '--stack-size=1000000', 
                  path.join(process.cwd(), 'vult-compiler-bridge.cjs')
                ], {
                  env: {
                    ...process.env,
                    VULT_SANDBOX: 'true',
                    VULT_SANDBOX_DIR: SANDBOX_WORKDIR,
                    VULT_ALLOW_EXTERNAL: 'false'
                  }
                });

                let output = '';
                let error = '';

                child.stdout.on('data', data => { output += data; });
                child.stderr.on('data', data => { error += data; });

                child.on('close', (exitCode) => {
                  res.setHeader('Content-Type', 'application/json');
                  if (exitCode === 0) {
                    res.end(output);
                  } else {
                    res.statusCode = 500;
                    res.end(error || JSON.stringify({ error: 'Compilation process failed' }));
                  }
                });

                child.stdin.write(JSON.stringify(requestData));
                child.stdin.end();

              } catch (e) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid request body' }));
              }
            });
          } else {
            res.statusCode = 405;
            res.end();
          }
        });
      }
    }
  ],
  optimizeDeps: {
    include: ['react-piano']
  },
  resolve: {
    alias: {
      'react-piano': './node_modules/react-piano/dist/react-piano.esm.js'
    }
  }
})
