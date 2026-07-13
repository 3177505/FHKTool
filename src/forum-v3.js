import { initForum } from './forum.js';

const container = document.getElementById('forum-v3-canvas');
if (container) {
  initForum('forum-v3-canvas', { preset: 'v3', prefix: 'forum-v3' });
}
