export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Cell {
  row: number;
  col: number;
}

/**
 * 箭头棋子：一条由多个相邻单元格组成的折线（蛇形），
 * cells[0] 为尾部，cells[length-1] 为头部，头部带箭头。
 * dir 为头部指向（最后一段的方向），即点击后飞出的方向。
 */
export interface Piece {
  id: number;
  cells: Cell[]; // 有序，头部在末尾
  dir: Direction; // 头部朝向 = 飞出方向
  removed: boolean;
  hinted: boolean;
}

export interface LevelConfig {
  id: number;
  rows: number;
  cols: number;
  pieces: { cells: Cell[]; dir: Direction }[];
  timeLimit: number; // 倒计时秒数
}

export type GameStatus = 'ready' | 'playing' | 'won' | 'lost';

export interface GameState {
  level: number;
  levelIndex: number;
  rows: number;
  cols: number;
  /** rows x cols：每格存放占据它的 pieceId，空格为 null */
  grid: (number | null)[][];
  pieces: Map<number, Piece>;
  lives: number;
  lightning: number;
  timeRemaining: number;
  timerStarted: boolean;
  status: GameStatus;
  isAnimating: boolean;
}

/** 方向对应的行列增量 */
export const DELTA: Record<Direction, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
};

/** 由两个相邻单元格求方向（from -> to） */
export function dirBetween(from: Cell, to: Cell): Direction {
  if (to.row < from.row) return 'up';
  if (to.row > from.row) return 'down';
  if (to.col < from.col) return 'left';
  return 'right';
}
