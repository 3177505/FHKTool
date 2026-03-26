import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  root: '.',
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        filhramonie: 'filhramonie.html',
        testing: 'testing.html',
        forum: 'forum.html',
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
