import { initForum } from './forum.js';

const container = document.getElementById('forum-v2-canvas');
if (container) {
  initForum('forum-v2-canvas', { preset: 'v2', prefix: 'forum-v2' });
}
