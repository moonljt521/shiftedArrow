import { DELTA, GameState, Piece, dirBetween } from './types';

/** 获取棋子头部单元格（cells 末尾） */
export function headCell(piece: Piece) {
  return piece.cells[piece.cells.length - 1];
}

/**
 * 判定棋子是否可消除。
 *
 * 棋子是一条折线（蛇形），点击后沿头部方向 dir 飞出，身体沿头部轨迹跟随滑出。
 * 因此只需检查头部正前方的射线：沿 dir 直到网格边界，
 * 若存在任何未消除棋子占据的格子则受阻；包括自身格子。
 */
export function canEliminate(state: GameState, piece: Piece): boolean;
export function canEliminate(
  grid: (number | null)[][],
  rows: number,
  cols: number,
  piece: Piece
): boolean;
export function canEliminate(
  a: GameState | (number | null)[][],
  b: Piece | number,
  c?: number,
  d?: Piece
): boolean {
  let grid: (number | null)[][];
  let rows: number;
  let cols: number;
  let piece: Piece;
  if (Array.isArray(a)) {
    grid = a;
    rows = b as number;
    cols = c as number;
    piece = d as Piece;
  } else {
    grid = a.grid;
    rows = a.rows;
    cols = a.cols;
    piece = b as Piece;
  }

  if (piece.removed) return false;
  const head = piece.cells[piece.cells.length - 1];
  const { dr, dc } = DELTA[piece.dir];
  let r = head.row + dr;
  let cc = head.col + dc;
  while (r >= 0 && r < rows && cc >= 0 && cc < cols) {
    const occupant = grid[r][cc];
    if (occupant !== null) {
      return false; // 被棋子（包括自身）阻挡
    }
    r += dr;
    cc += dc;
  }
  return true;
}

/** 是否还存在任意可消除的棋子（死局检测） */
export function hasAnyMove(state: GameState): boolean {
  for (const piece of state.pieces.values()) {
    if (!piece.removed && canEliminate(state, piece)) return true;
  }
  return false;
}

/**
 * 贪心求解。可消除性单调（消除只清空格子、不新增障碍），故贪心即完备：
 * 反复消除任意当前可消除的棋子，能全清即可解。
 * 返回消除顺序的 pieceId 数组；若卡死返回 null。
 */
export function solve(state: GameState): number[] | null {
  const rows = state.rows;
  const cols = state.cols;
  const grid: (number | null)[][] = state.grid.map((row) => [...row]);
  const remaining = new Set<number>();
  const pieces = new Map<number, Piece>();
  for (const p of state.pieces.values()) {
    if (!p.removed) {
      remaining.add(p.id);
      pieces.set(p.id, p);
    }
  }

  const order: number[] = [];
  let progress = true;
  while (remaining.size > 0 && progress) {
    progress = false;
    for (const id of [...remaining]) {
      const piece = pieces.get(id)!;
      if (canEliminate(grid, rows, cols, piece)) {
        for (const cell of piece.cells) grid[cell.row][cell.col] = null;
        remaining.delete(id);
        order.push(id);
        progress = true;
      }
    }
  }

  return remaining.size === 0 ? order : null;
}

/**
 * 难度评分（0~1，越大越难）。基于「消除自由度」与「依赖层级」两个客观指标：
 *
 * - layers：按贪心一层层剥离——每一轮把当前所有可消除的棋子同时移除，记为一层。
 *           层数越多 = 强制的先后依赖越深 = 越难。
 * - freeRatio：初始局面可立即消除的棋子占比。占比越低 = 起手选择越少 = 越难。
 *
 * 难度 = 0.6 * 依赖深度分 + 0.4 * (1 - 起手自由度)
 *   依赖深度分 = (层数 - 1) / (棋子数 - 1)，归一化到 0~1。
 *
 * 返回 0~1；若局面无解返回 1（视为最难/不可用，生成器会据此筛掉）。
 */
export function difficultyScore(state: GameState): number {
  const rows = state.rows;
  const cols = state.cols;
  const grid: (number | null)[][] = state.grid.map((row) => [...row]);
  const remaining = new Set<number>();
  const pieces = new Map<number, Piece>();
  for (const p of state.pieces.values()) {
    if (!p.removed) {
      remaining.add(p.id);
      pieces.set(p.id, p);
    }
  }
  const n = remaining.size;
  if (n <= 1) return 0;

  // 弯折密度：所有棋子内部方向变化次数 / 相邻格子对数
  let totalBends = 0;
  let totalSegments = 0;
  for (const piece of pieces.values()) {
    const cells = piece.cells;
    if (cells.length < 3) continue;
    for (let i = 2; i < cells.length; i++) {
      const d1 = dirBetween(cells[i - 2], cells[i - 1]);
      const d2 = dirBetween(cells[i - 1], cells[i]);
      if (d1 !== d2) totalBends++;
      totalSegments++;
    }
  }
  const bendDensity = totalSegments === 0 ? 0 : totalBends / totalSegments;

  let firstLayerFree = 0;
  let layers = 0;
  let progress = true;
  while (remaining.size > 0 && progress) {
    progress = false;
    const removable: number[] = [];
    for (const id of remaining) {
      if (canEliminate(grid, rows, cols, pieces.get(id)!)) removable.push(id);
    }
    if (removable.length === 0) break;
    if (layers === 0) firstLayerFree = removable.length;
    for (const id of removable) {
      const piece = pieces.get(id)!;
      for (const cell of piece.cells) grid[cell.row][cell.col] = null;
      remaining.delete(id);
      progress = true;
    }
    layers++;
  }

  if (remaining.size > 0) return 1; // 无解

  const depthScore = (layers - 1) / (n - 1); // 0~1
  const freeRatio = firstLayerFree / n; // 0~1
  const score = 0.5 * depthScore + 0.35 * (1 - freeRatio) + 0.15 * bendDensity;
  return Math.max(0, Math.min(1, score));
}
