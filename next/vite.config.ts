// Imported from 'vitest/config', not 'vite' — that is the variant whose defineConfig
// knows about the `test` block, and it works for the build too.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * The voice recorder's endpoint, on the dev server only (record.html, src/tools/recorder.ts).
 * GET /__voice lists the clips already recorded; PUT /__voice/<key> saves the body as
 * src/assets/voice/<key>.wav. A key is lower-case letters, digits and hyphens and nothing
 * else, so it cannot name a file anywhere but there. (The clip list itself is not imported
 * here: a Vite config should not import app code.)
 */
function voiceRecorder(): Plugin {
  const dir = fileURLToPath(new URL('./src/assets/voice/', import.meta.url));
  return {
    name: 'voice-recorder',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/\/__voice(?:\/([a-z0-9-]+))?$/);
        if (!match) {
          next();
          return;
        }
        const key = match[1];
        if (req.method === 'GET' && !key) {
          const recorded = fs.existsSync(dir)
            ? fs.readdirSync(dir).filter((f) => f.endsWith('.wav')).map((f) => f.slice(0, -'.wav'.length))
            : [];
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(recorded));
          return;
        }
        if (req.method === 'PUT' && key) {
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(`${dir}${key}.wav`, Buffer.concat(chunks));
            res.statusCode = 204;
            res.end();
          });
          return;
        }
        res.statusCode = 400;
        res.end();
      });
    },
  };
}

export default defineConfig({
  // Project page at https://srumjant.github.io/gi-do/, new game served under /next/.
  base: '/gi-do/next/',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  plugins: [voiceRecorder()],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
