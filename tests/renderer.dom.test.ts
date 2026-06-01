// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Renderer } from '../src/renderer';
import { createGameState } from '../src/gameState';
import { getLevel } from '../src/levels';

describe('Renderer 点击交互', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.querySelector('#app')!;
  });

  it('点击棋子应触发 onCellClick 并带正确 id', () => {
    const renderer = new Renderer(root);
    const state = createGameState(getLevel(0), 0);
    state.status = 'playing';

    const clicked: number[] = [];
    renderer.onCellClick((id) => clicked.push(id));
    renderer.mountGrid(state);

    const pieces = root.querySelectorAll<SVGGElement>('.piece');
    expect(pieces.length).toBeGreaterThan(0);

    const first = pieces[0];
    const expectedId = Number(first.dataset.id);
    first.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(clicked).toContain(expectedId);
  });

  it('点击棋子内部子元素事件应冒泡到 .piece', () => {
    const renderer = new Renderer(root);
    const state = createGameState(getLevel(0), 0);
    renderer.mountGrid(state);

    const clicked: number[] = [];
    renderer.onCellClick((id) => clicked.push(id));

    const piece = root.querySelector<SVGGElement>('.piece')!;
    const hit = piece.querySelector('.piece-hit')!;
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(clicked.length).toBe(1);
    expect(clicked[0]).toBe(Number(piece.dataset.id));
  });

  it('每个棋子应包含折线、箭头头部和命中区', () => {
    const renderer = new Renderer(root);
    const state = createGameState(getLevel(0), 0);
    renderer.mountGrid(state);

    const piece = root.querySelector<SVGGElement>('.piece')!;
    expect(piece.querySelector('.piece-line')).not.toBeNull();
    expect(piece.querySelector('.piece-head')).not.toBeNull();
    expect(piece.querySelector('.piece-hit')).not.toBeNull();
  });
});
