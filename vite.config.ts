/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function apiDevPlugin() {
  return {
    name: 'api-dev-plugin',
    config(_config: any, { mode }: { mode: string }) {
      const env = loadEnv(mode, process.cwd(), '');
      for (const key in env) {
        if (process.env[key] === undefined) {
          process.env[key] = env[key];
        }
      }
    },
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url?.startsWith('/api/')) {
          return next();
        }

        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;

        try {
          let handler: ((req: Request) => Promise<Response>) | undefined;

          if (pathname === '/api/generate-query') {
            const mod = await server.ssrLoadModule('/api/generate-query.ts');
            handler = mod.default;
          } else if (pathname === '/api/generate-insights') {
            const mod = await server.ssrLoadModule('/api/generate-insights.ts');
            handler = mod.default;
          } else if (pathname === '/api/generate-answer-summary') {
            const mod = await server.ssrLoadModule('/api/generate-answer-summary.ts');
            handler = mod.default;
          }

          if (!handler) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: `API route ${pathname} not found.` }));
            return;
          }

          let bodyBuffer: Buffer | null = null;
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            const chunks: Uint8Array[] = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            bodyBuffer = Buffer.concat(chunks);
          }

          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (Array.isArray(v)) {
              v.forEach((val) => headers.append(k, val));
            } else if (v) {
              headers.set(k, v as string);
            }
          }

          const webReq = new Request(url.toString(), {
            method: req.method,
            headers,
            body: bodyBuffer && bodyBuffer.length > 0 ? bodyBuffer : undefined,
          });

          const webRes = await handler(webReq);

          res.statusCode = webRes.status;
          webRes.headers.forEach((val, key) => {
            res.setHeader(key, val);
          });

          const resText = await webRes.text();
          res.end(resText);
        } catch (err) {
          console.error(`Error handling API request ${pathname}:`, err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'Internal API Server Error',
            })
          );
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), apiDevPlugin()],
  test: {
    // jsdom (not node) — csv.test.ts exercises real File/FileReader parsing
    // via papaparse, which needs a proper browser-like environment to detect
    // it's not running inside a Worker.
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
  },
})
