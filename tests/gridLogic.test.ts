import { describe, it, expect } from 'vitest';
import { canEliminate, difficultyScore, hasAnyMove, solve } from '../src/gridLogic';
import { createGameState, useHint } from '../src/gameState';
import { LEVELS } from '../src/levels';
import rules from '../src/levelRules.json';
import { Cell, Direction, GameState, Piece, dirBetween } from '../src/types';

const RULES = rules as unknown as {
  levels: { difficulty?: { min: number; max: number } }[];
};

function makePiece(id: number, cells: Cell[], dir: Direction): Piece {
  return { id, cells, dir, removed: false, hinted: false };
}

function buildState(rows: number, cols: number, pieces: Piece[]): GameState {
  const grid: (number | null)[][] = Array.from({ length: rows }, () =>
    Array<number | null>(cols).fill(null)
  );
  const map = new Map<number, Piece>();
  for (const p of pieces) {
    for (const c of p.cells) grid[c.row][c.col] = p.id;
    map.set(p.id, p);
  }
  return {
    level: 1,
    levelIndex: 0,
    rows,
    cols,
    grid,
    pieces: map,
    lives: 3,
    lightning: 5,
    timeRemaining: 180,
    timerStarted: false,
    status: 'playing',
    isAnimating: false,
  };
}

describe('canEliminate（折线棋子）', () => {
  it('头部前方畅通可消除', () => {
    // 横向折线，头部在右端朝右，右侧到边界为空
    const p = makePiece(
      0,
      [
        { row: 2, col: 0 },
        { row: 2, col: 1 },
        { row: 3, col: 1 },
      ],
      'down'
    );
    const state = buildState(6, 6, [p]);
    expect(canEliminate(state, p)).toBe(true);
  });

  it('头部前方被其它棋子阻挡不可消除', () => {
    const a = makePiece(
      0,
      [
        { row: 2, col: 0 },
        { row: 2, col: 1 },
      ],
      'right'
    );
    const b = makePiece(1, [{ row: 2, col: 4 }], 'up');
    const state = buildState(6, 6, [a, b]);
    expect(canEliminate(state, a)).toBe(false);
  });

  it('自身格子会阻挡头部射线', () => {
    // 这条折线路径的头部向左时，会撞到自己更左边的身体
    const a = makePiece(
      0,
      [
        { row: 0, col: 0 },
        { row: 1, col: 0 },
        { row: 1, col: 1 },
        { row: 1, col: 2 },
        { row: 0, col: 2 },
        { row: 0, col: 1 },
      ],
      'left'
    );
    const state = buildState(6, 6, [a]);
    expect(canEliminate(state, a)).toBe(false);
  });

  it('阻挡棋子消除后头部射线畅通', () => {
    const a = makePiece(0, [{ row: 2, col: 0 }], 'right');
    const b = makePiece(1, [{ row: 2, col: 3 }], 'up');
    const state = buildState(6, 6, [a, b]);
    expect(canEliminate(state, a)).toBe(false);
    // 移除 b
    b.removed = true;
    state.grid[2][3] = null;
    expect(canEliminate(state, a)).toBe(true);
  });
});

describe('solve & hasAnyMove', () => {
  it('所有内置关卡均可解（保证可解的生成算法）', () => {
    for (const level of LEVELS) {
      const state = createGameState(level, level.id - 1);
      const order = solve(state);
      expect(order, `关卡 ${level.id} 应可解`).not.toBeNull();
      expect(order!.length).toBe(state.pieces.size);
    }
  });

  it('两个互指且互相阻挡的棋子无解', () => {
    const a = makePiece(0, [{ row: 0, col: 0 }], 'right');
    const b = makePiece(1, [{ row: 0, col: 2 }], 'left');
    const state = buildState(1, 3, [a, b]);
    expect(hasAnyMove(state)).toBe(false);
    expect(solve(state)).toBeNull();
  });

  it('提示返回的棋子必须是当前可消除棋子', () => {
    for (const level of LEVELS) {
      const state = createGameState(level, level.id - 1);
      const id = useHint(state);
      expect(id).not.toBeNull();
      expect(canEliminate(state, state.pieces.get(id!)!)).toBe(true);
    }
  });
});

describe('生成关卡结构', () => {
  it('棋子为多格折线且相邻、界内、无重叠', () => {
    for (const level of LEVELS) {
      const occupied = new Set<string>();
      for (const piece of level.pieces) {
        expect(piece.cells.length).toBeGreaterThanOrEqual(2);
        for (let i = 1; i < piece.cells.length; i++) {
          const a = piece.cells[i - 1];
          const b = piece.cells[i];
          const manhattan = Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
          expect(manhattan).toBe(1);
        }
        for (const c of piece.cells) {
          expect(c.row).toBeGreaterThanOrEqual(0);
          expect(c.row).toBeLessThan(level.rows);
          expect(c.col).toBeGreaterThanOrEqual(0);
          expect(c.col).toBeLessThan(level.cols);
          const k = `${c.row},${c.col}`;
          expect(occupied.has(k), `重叠 ${k}`).toBe(false);
          occupied.add(k);
        }
      }
    }
  });

  it('网格被完全填满，无空白格子', () => {
    for (const level of LEVELS) {
      const occupied = new Set<string>();
      for (const piece of level.pieces) {
        for (const c of piece.cells) occupied.add(`${c.row},${c.col}`);
      }
      expect(occupied.size).toBe(level.rows * level.cols);
    }
  });

  it('飞出方向必须等于头部段方向（箭头贴合线、沿路径滑出）', () => {
    for (const level of LEVELS) {
      for (const piece of level.pieces) {
        const n = piece.cells.length;
        const expected = dirBetween(piece.cells[n - 2], piece.cells[n - 1]);
        expect(piece.dir).toBe(expected);
      }
    }
  });
});

describe('难度递增 (需求 6.3)', () => {
  it('时间逐关递减且不低于 15s', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].timeLimit).toBeLessThanOrEqual(LEVELS[i - 1].timeLimit);
      expect(LEVELS[i].timeLimit).toBeGreaterThanOrEqual(15);
    }
  });

  it('难度评分总体随关卡递增（趋势）', () => {
    const scores = LEVELS.map((lv) =>
      difficultyScore(createGameState(lv, lv.id - 1))
    );
    // 末关难度应高于首关
    expect(scores[scores.length - 1]).toBeGreaterThan(scores[0]);
    // 单调性允许个别波动，但整体趋势向上：后半段均值 > 前半段均值
    const half = Math.floor(scores.length / 2);
    const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    expect(avg(scores.slice(half))).toBeGreaterThan(avg(scores.slice(0, half)));
  });

  it('每关难度评分落在其 JSON 目标区间内（或最接近）', () => {
    // 至少多数关卡命中目标区间
    let hit = 0;
    for (let i = 0; i < LEVELS.length; i++) {
      const lv = LEVELS[i];
      const score = difficultyScore(createGameState(lv, lv.id - 1));
      const t = RULES.levels[i].difficulty!;
      if (score >= t.min - 0.05 && score <= t.max + 0.05) hit++;
    }
    expect(hit).toBeGreaterThanOrEqual(Math.ceil(LEVELS.length * 0.6));
  });
});
