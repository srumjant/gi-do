// Imported from 'vitest/config', not 'vite' — that is the variant whose defineConfig
// knows about the `test` block, and it works for the build too.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Project page at https://srumjant.github.io/gi-do/, new game served under /next/.
  base: '/gi-do/next/',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
