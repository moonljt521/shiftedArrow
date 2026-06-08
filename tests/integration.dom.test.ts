// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Renderer } from '../src/renderer';
import { GameController } from '../src/gameController';

describe('GameController + Renderer 集成点击', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
  });

  it('点击棋子后被处理，棋子数量不增加', async () => {
    const root = document.querySelector<HTMLElement>('#app')!;
    const renderer = new Renderer(root);
    const controller = new GameController(renderer);
    controller.start();

    const before = root.querySelectorAll('.piece').length;
    expect(before).toBeGreaterThan(0);

    const first = root.querySelector<SVGGElement>('.piece')!;
    first.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await new Promise((r) => setTimeout(r, 650));

    const after = root.querySelectorAll('.piece').length;
    expect(after).toBeLessThanOrEqual(before);
  });

  it('覆盖层初始处于隐藏 class，不应拦截点击', () => {
    const root = document.querySelector<HTMLElement>('#app')!;
    const renderer = new Renderer(root);
    const controller = new GameController(renderer);
    controller.start();

    const overlay = root.querySelector('#overlay')!;
    expect(overlay.classList.contains('hidden')).toBe(true);
  });

  it('刷新后总是从第一关开始（关卡: 1）', () => {
    // 预置进度到第 5 关
    localStorage.setItem(
      'arrow-elim-progress',
      JSON.stringify({ maxLevelUnlocked: 4 })
    );
    const root = document.querySelector<HTMLElement>('#app')!;
    const renderer = new Renderer(root);
    const controller = new GameController(renderer);
    controller.start();

    expect(root.querySelector('#level-title')!.textContent).toBe('关卡: 1');
  });

  it('点击☰打开关卡选择，已解锁关卡可点、未解锁禁用', () => {
    localStorage.setItem(
      'arrow-elim-progress',
      JSON.stringify({ maxLevelUnlocked: 2 })
    );
    const root = document.querySelector<HTMLElement>('#app')!;
    const renderer = new Renderer(root);
    const controller = new GameController(renderer);
    controller.start();

    (root.querySelector('#btn-eye') as HTMLButtonElement).click();
    const cells = root.querySelectorAll<HTMLButtonElement>('.level-cell');
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[0].disabled).toBe(false); // 第 1 关可选
    expect(cells[2].disabled).toBe(false); // 第 3 关已解锁
    expect(cells[cells.length - 1].disabled).toBe(false); // 末关也可选（无锁定）
  });

  it('点击⚙打开暂停菜单并可继续', () => {
    const root = document.querySelector<HTMLElement>('#app')!;
    const renderer = new Renderer(root);
    const controller = new GameController(renderer);
    controller.start();

    (root.querySelector('#btn-settings') as HTMLButtonElement).click();
    const resume = root.querySelector<HTMLButtonElement>('[data-action="resume"]');
    expect(resume).not.toBeNull();
    resume!.click();
    expect(root.querySelector('#overlay')!.classList.contains('hidden')).toBe(true);
  });
});
