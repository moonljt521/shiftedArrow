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
 * 贪心求解（队列优化）。
 * 可消除性单调（消除只清空格子、不新增障碍），故贪心即完备。
 * 使用增量阻挡追踪：初始扫描一次，移除棋子时仅重新检查受影响的棋子，
 * 避免每轮全量扫描 O(P²)，总体复杂度 O(P * rayLen)。
 * 返回消除顺序的 pieceId 数组；若卡死返回 null。
 */
export function solve(state: GameState): number[] | null {
  const rows = state.rows;
  const cols = state.cols;
  const flat = new Int32Array(rows * cols).fill(-1);
  const remaining = new Set<number>();
  const pieces = new Map<number, Piece>();
  let maxId = -1;
  for (const p of state.pieces.values()) {
    if (p.id > maxId) maxId = p.id;
    if (!p.removed) {
      remaining.add(p.id);
      pieces.set(p.id, p);
      for (const cell of p.cells) {
        flat[cell.row * cols + cell.col] = p.id;
      }
    }
  }

  // 初始扫描：为每个棋子建立阻挡关系
  const blockerCount = new Int32Array(maxId + 1);
  const blockedBy: number[][] = Array.from({ length: maxId + 1 }, () => []);

  for (const id of remaining) {
    const piece = pieces.get(id)!;
    const head = piece.cells[piece.cells.length - 1];
    const { dr, dc } = DELTA[piece.dir];
    let r = head.row + dr;
    let c = head.col + dc;
    const seen = new Set<number>();
    while (r >= 0 && r < rows && c >= 0 && c < cols) {
      const o = flat[r * cols + c];
      if (o !== -1 && !seen.has(o)) {
        seen.add(o);
        blockerCount[id]++;
        if (o !== id) blockedBy[o].push(id);
      }
      r += dr;
      c += dc;
    }
  }

  // 将初始可消除棋子加入队列
  const queue: number[] = [];
  for (const id of remaining) {
    if (blockerCount[id] === 0) queue.push(id);
  }

  const order: number[] = [];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (!remaining.has(id)) continue;
    const piece = pieces.get(id)!;
    order.push(id);
    remaining.delete(id);
    // 清除棋子的所有格子
    for (const cell of piece.cells) flat[cell.row * cols + cell.col] = -1;

    // 增量更新：仅重新检查被该棋子阻挡的棋子
    for (const blocked of blockedBy[id]) {
      if (!remaining.has(blocked)) continue;
      blockerCount[blocked]--;
      if (blockerCount[blocked] === 0) {
        queue.push(blocked);
      } else {
        // 仍有阻挡，重新扫描以修正阻挡关系
        const bp = pieces.get(blocked)!;
        const bh = bp.cells[bp.cells.length - 1];
        const { dr, dc } = DELTA[bp.dir];
        let r = bh.row + dr;
        let c = bh.col + dc;
        blockerCount[blocked] = 0;
        const seen2 = new Set<number>();
        while (r >= 0 && r < rows && c >= 0 && c < cols) {
          const o = flat[r * cols + c];
          if (o !== -1 && !seen2.has(o)) {
            seen2.add(o);
            blockerCount[blocked]++;
            if (o !== blocked) blockedBy[o].push(blocked);
          }
          r += dr;
          c += dc;
        }
      }
    }
  }

  return remaining.size === 0 ? order : null;
}

/**
 * 难度评分（0~1，越大越难）。
 *
 * - layers：贪心剥离层数（依赖深度）。用对数缩放，避免被大网格稀释。
 * - freeRatio：起手可消除占比。用 sqrt 变换，低自由度惩罚更明显。
 * - bendDensity：弯折密度（棋子内部方向变化频率）。
 *
 * 返回 0~1；若局面无解返回 1。
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

  // 对数缩放深度分：不被大网格稀释
  const depthScore = Math.log(1 + layers) / Math.log(1 + n);
  const freeRatio = firstLayerFree / n;
  // sqrt 变换：低自由度惩罚更强；弯折密度权重提高
  const score = 0.40 * depthScore + 0.30 * (1 - Math.sqrt(freeRatio)) + 0.30 * bendDensity;
  return Math.max(0, Math.min(1, score));
}
