import { defineConfig } from 'vite';

export default defineConfig({
  base: '/FHKTool/',
  root: '.',
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
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
