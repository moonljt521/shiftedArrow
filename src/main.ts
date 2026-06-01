import './style.css';
import { GameController } from './gameController';
import { Renderer } from './renderer';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('#app not found');
}

const renderer = new Renderer(app);
const controller = new GameController(renderer);
controller.start();

// 视口尺寸变化时重建网格（保持当前关卡状态较复杂，这里仅在尺寸大变时刷新）
let resizeTimer: number | null = null;
window.addEventListener('resize', () => {
  if (resizeTimer !== null) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    // 简单处理：不打断游戏，仅作占位。完整实现可在此重排网格。
  }, 200);
});
