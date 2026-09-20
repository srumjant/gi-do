import { defineConfig } from 'vite';

export default defineConfig({
  // Project page at https://srumjant.github.io/gi-do/, new game served under /next/.
  base: '/gi-do/next/',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
