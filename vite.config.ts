import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/; the Pages workflow sets BASE_PATH.
  base: process.env.BASE_PATH || '/',
  server: {
    port: 5173,
    strictPort: true,
    // Bind mounts from macOS don't always deliver fs events into the container.
    watch: process.env.VITE_POLL ? { usePolling: true, interval: 300 } : undefined,
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
