import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        testing: 'testing.html',
        filharmonie: 'filharmonie.html',
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
