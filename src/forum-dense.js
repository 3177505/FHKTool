import { initForum } from './forum.js';

const container = document.getElementById('forum-dense-canvas');
if (container) {
  initForum('forum-dense-canvas', { preset: 'dense', prefix: 'forum-dense' });
}
