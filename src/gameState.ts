import { GameState, LevelConfig, Piece } from './types';
import { solve } from './gridLogic';
import rules from './levelRules.json';

const defaults = (rules as { defaults: { lives: number; lightning: number } })
  .defaults;
export const INITIAL_LIVES = defaults.lives;
export const INITIAL_LIGHTNING = defaults.lightning;

/** 根据关卡配置创建初始游戏状态 */
export function createGameState(level: LevelConfig, levelIndex: number): GameState {
  const grid: (number | null)[][] = Array.from({ length: level.rows }, () =>
    Array<number | null>(level.cols).fill(null)
  );
  const pieces = new Map<number, Piece>();

  let id = 0;
  for (const def of level.pieces) {
    // 校验：所有格子在界内且不与已放置棋子重叠
    let valid = def.cells.length > 0;
    for (const cell of def.cells) {
      if (
        cell.row < 0 ||
        cell.row >= level.rows ||
        cell.col < 0 ||
        cell.col >= level.cols ||
        grid[cell.row][cell.col] !== null
      ) {
        valid = false;
        break;
      }
    }
    if (!valid) {
      console.error('非法棋子，已跳过:', def);
      continue;
    }

    const piece: Piece = {
      id,
      cells: def.cells.map((c) => ({ ...c })),
      dir: def.dir,
      removed: false,
      hinted: false,
    };
    for (const cell of piece.cells) grid[cell.row][cell.col] = id;
    pieces.set(id, piece);
    id++;
  }

  return {
    level: level.id,
    levelIndex,
    rows: level.rows,
    cols: level.cols,
    grid,
    pieces,
    lives: INITIAL_LIVES,
    lightning: INITIAL_LIGHTNING,
    timeRemaining: level.timeLimit,
    timerStarted: false,
    status: 'ready',
    isAnimating: false,
  };
}

/** 消除棋子：清空其占据的所有格子 */
export function eliminatePiece(state: GameState, id: number): void {
  const piece = state.pieces.get(id);
  if (!piece || piece.removed) return;
  piece.removed = true;
  piece.hinted = false;
  for (const cell of piece.cells) {
    if (state.grid[cell.row][cell.col] === id) {
      state.grid[cell.row][cell.col] = null;
    }
  }
}

export function loseLife(state: GameState): void {
  if (state.lives > 0) state.lives -= 1;
}

/** 使用提示：返回下一个应消除的 pieceId；资源不足或死局返回 null */
export function useHint(state: GameState): number | null {
  if (state.lightning <= 0) return null;
  const order = solve(state);
  if (!order || order.length === 0) return null;
  state.lightning -= 1;
  const id = order[0];
  const piece = state.pieces.get(id);
  if (piece) piece.hinted = true;
  return id;
}

/** 关卡是否完成：所有棋子已消除 */
export function isLevelComplete(state: GameState): boolean {
  for (const piece of state.pieces.values()) {
    if (!piece.removed) return false;
  }
  return true;
}
