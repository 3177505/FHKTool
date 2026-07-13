import { initForum } from './forum.js';

const container = document.getElementById('forum-v1-canvas');
if (container) {
  initForum('forum-v1-canvas', { preset: 'v1', prefix: 'forum-v1' });
}
