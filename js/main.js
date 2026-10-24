/* 九州弈阵 · 单机版 —— 启动 */
(function () {
  'use strict';
  function boot() {
    if (!window.GF || !window.GF.UI) {
      console.error('游戏模块加载失败');
      return;
    }
    window.GF.UI.init();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
