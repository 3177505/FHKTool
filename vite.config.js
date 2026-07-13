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
        forumV1: 'forum-v1.html',
        forumV2: 'forum-v2.html',
        forumV3: 'forum-v3.html',
        soundWaves: 'sound-waves.html',
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
