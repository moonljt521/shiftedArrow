import { Cell, DELTA, Direction, LevelConfig, dirBetween } from './types';
import { createGameState } from './gameState';
import { difficultyScore, solve } from './gridLogic';
import rules from './levelRules.json';

const DIRS: Direction[] = ['up', 'down', 'left', 'right'];

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface RawPiece {
  cells: Cell[];
  dir: Direction;
}

interface GenParams {
  rows: number;
  cols: number;
  minLen: number;
  maxLen: number;
  axis: 'rows' | 'cols' | 'random';
  backbiteFactor: number;
}

/**
 * 构建蛇形（serpentine）哈密顿路径：逐行蛇行遍历，覆盖每个格子恰好一次。
 * transpose=true 时按列蛇行。保证全覆盖。
 */
function serpentine(rows: number, cols: number, transpose: boolean): Cell[] {
  const path: Cell[] = [];
  if (!transpose) {
    for (let r = 0; r < rows; r++) {
      if (r % 2 === 0) for (let c = 0; c < cols; c++) path.push({ row: r, col: c });
      else for (let c = cols - 1; c >= 0; c--) path.push({ row: r, col: c });
    }
  } else {
    for (let c = 0; c < cols; c++) {
      if (c % 2 === 0) for (let r = 0; r < rows; r++) path.push({ row: r, col: c });
      else for (let r = rows - 1; r >= 0; r--) path.push({ row: r, col: c });
    }
  }
  return path;
}

/**
 * Backbite 随机化：在保持「哈密顿路径（覆盖全部格子）」不变的前提下，
 * 反复对路径头部做随机折回操作，制造大量拐弯，使布局呈迷宫感。
 *
 * 操作：设头部为 path[k]，随机取其网格邻居 u=path[j]。
 *      若 j<k-1，则反转 path[j+1..k]，u 与原头部相连，新头部为原 path[j+1]。
 *      该操作不改变所覆盖的格子集合，仍是哈密顿路径。
 */
function backbite(
  path: Cell[],
  rows: number,
  cols: number,
  rng: () => number,
  factor: number
): void {
  const n = rows * cols;
  const idx = (r: number, c: number) => r * cols + c;
  const pos = new Int32Array(n);
  const rebuild = () => {
    for (let i = 0; i < path.length; i++) pos[idx(path[i].row, path[i].col)] = i;
  };
  rebuild();

  const moves = n * Math.max(1, factor);
  for (let m = 0; m < moves; m++) {
    const k = path.length - 1;
    const head = path[k];
    const nbrs: Cell[] = [];
    for (const d of DIRS) {
      const nr = head.row + DELTA[d].dr;
      const nc = head.col + DELTA[d].dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) nbrs.push({ row: nr, col: nc });
    }
    const u = nbrs[Math.floor(rng() * nbrs.length)];
    const j = pos[idx(u.row, u.col)];
    if (j < k - 1) {
      // 反转 [j+1, k]
      let lo = j + 1;
      let hi = k;
      while (lo < hi) {
        const tmp = path[lo];
        path[lo] = path[hi];
        path[hi] = tmp;
        lo++;
        hi--;
      }
      for (let i = j + 1; i <= k; i++) pos[idx(path[i].row, path[i].col)] = i;
    }
    // 偶尔整体翻转，让尾端也被混洗
    if (rng() < 0.08) {
      path.reverse();
      rebuild();
    }
  }
}

/** 把哈密顿路径切成长度 [minLen,maxLen] 的连续段，全覆盖、无长度1碎片 */
function cutSegments(
  path: Cell[],
  minLen: number,
  maxLen: number,
  rng: () => number
): Cell[][] {
  const segs: Cell[][] = [];
  const total = path.length;
  let i = 0;
  while (i < total) {
    let len = minLen + Math.floor(rng() * (maxLen - minLen + 1));
    if (i + len > total) len = total - i;
    // 避免在末尾留下单格
    if (total - (i + len) === 1) len++;
    segs.push(path.slice(i, i + len));
    i += len;
  }
  // 兜底：若末段为单格，并入前一段
  if (segs.length >= 2 && segs[segs.length - 1].length === 1) {
    const last = segs.pop()!;
    segs[segs.length - 1].push(...last);
  }
  return segs;
}

/**
 * 单次尝试：全覆盖切段 + 反向消除定向。
 * 定向约束：飞出方向 = 头部段方向（箭头贴线、沿自身路径滑出）。
 * 反向消除的「定向顺序」即为合法消除顺序，保证可解；死锁返回 null 以便换种子重试。
 */
function tryGenerate(p: GenParams, seed: number): RawPiece[] | null {
  const { rows, cols, minLen, maxLen, axis, backbiteFactor } = p;
  const rng = makeRng(seed);
  const idx = (r: number, c: number) => r * cols + c;
  const inBounds = (r: number, c: number) =>
    r >= 0 && r < rows && c >= 0 && c < cols;

  // 1) 全覆盖蛇形棋子
  const transpose = axis === 'cols' ? true : axis === 'rows' ? false : rng() < 0.5;
  const path = serpentine(rows, cols, transpose);
  backbite(path, rows, cols, rng, backbiteFactor);
  const snakes = cutSegments(path, minLen, maxLen, rng);

  // 2) 反向消除定向
  const work = new Int32Array(rows * cols).fill(-1);
  for (let s = 0; s < snakes.length; s++) {
    for (const cell of snakes[s]) work[idx(cell.row, cell.col)] = s;
  }
  const remaining = new Set<number>();
  for (let s = 0; s < snakes.length; s++) remaining.add(s);

  const rayClear = (head: Cell, dir: Direction): boolean => {
    const { dr, dc } = DELTA[dir];
    let r = head.row + dr;
    let c = head.col + dc;
    while (inBounds(r, c)) {
      const o = work[idx(r, c)];
      if (o !== -1) return false;
      r += dr;
      c += dc;
    }
    return true;
  };

  const oriented = new Map<number, RawPiece>();
  while (remaining.size > 0) {
    const candidates: { snake: number; headIsLast: boolean; dir: Direction }[] =
      [];
    for (const s of remaining) {
      const cells = snakes[s];
      const len = cells.length;
      const lastDir = dirBetween(cells[len - 2], cells[len - 1]);
      if (rayClear(cells[len - 1], lastDir)) {
        candidates.push({ snake: s, headIsLast: true, dir: lastDir });
      }
      const tailDir = dirBetween(cells[1], cells[0]);
      if (rayClear(cells[0], tailDir)) {
        candidates.push({ snake: s, headIsLast: false, dir: tailDir });
      }
    }
    if (candidates.length === 0) return null; // 死锁

    // 智能选择：选移除后释放最少新可消除棋子的候选，加深依赖链
    let bestScore = Infinity;
    let bestCandidates: typeof candidates = [];
    for (const candidate of candidates) {
      const cells = snakes[candidate.snake];
      // 临时清除该棋子的格子
      for (const cell of cells) work[idx(cell.row, cell.col)] = -1;
      // 统计剩余棋子中此时有多少可消除
      let clearCount = 0;
      for (const s of remaining) {
        if (s === candidate.snake) continue;
        const scells = snakes[s];
        const slen = scells.length;
        const sLastDir = dirBetween(scells[slen - 2], scells[slen - 1]);
        if (rayClear(scells[slen - 1], sLastDir)) {
          clearCount++;
        } else {
          const sTailDir = dirBetween(scells[1], scells[0]);
          if (rayClear(scells[0], sTailDir)) clearCount++;
        }
      }
      // 恢复 work 数组
      for (const cell of cells) work[idx(cell.row, cell.col)] = candidate.snake;
      if (clearCount < bestScore) {
        bestScore = clearCount;
        bestCandidates = [candidate];
      } else if (clearCount === bestScore) {
        bestCandidates.push(candidate);
      }
    }
    const pick = bestCandidates[Math.floor(rng() * bestCandidates.length)];
    const cells = snakes[pick.snake];
    const ordered = pick.headIsLast ? cells.slice() : cells.slice().reverse();
    oriented.set(pick.snake, { cells: ordered, dir: pick.dir });
    for (const cell of cells) work[idx(cell.row, cell.col)] = -1;
    remaining.delete(pick.snake);
  }

  return [...oriented.values()];
}

// ---- JSON 规则驱动 ----

interface DifficultyRange {
  min: number;
  max: number;
}

interface RuleDefaults {
  lives: number;
  lightning: number;
  minPieceLen: number;
  maxPieceLen: number;
  serpentineAxis: 'rows' | 'cols' | 'random';
  backbiteFactor: number;
  maxAttempts: number;
  difficulty: DifficultyRange;
}

interface LevelRule {
  id: number;
  rows: number;
  cols: number;
  timeLimit: number;
  minPieceLen?: number;
  maxPieceLen?: number;
  serpentineAxis?: 'rows' | 'cols' | 'random';
  backbiteFactor?: number;
  maxAttempts?: number;
  difficulty?: Partial<DifficultyRange>;
}

interface RulesFile {
  defaults: RuleDefaults;
  levels: LevelRule[];
}

const RULES = rules as unknown as RulesFile;

/**
 * 按规则生成一个关卡：
 * 1. 合并 defaults 与该关卡规则得到生成参数与难度目标区间。
 * 2. 多次换种子生成候选；对每个可解候选用 difficultyScore 评分。
 * 3. 优先返回落在 [difficulty.min, difficulty.max] 的候选；
 *    若多次未命中，返回评分最接近区间中点的候选（保底，绝不失败）。
 */
function buildLevel(rule: LevelRule, baseSeed: number): LevelConfig {
  const d = RULES.defaults;
  const minLen = rule.minPieceLen ?? d.minPieceLen;
  const maxLen = rule.maxPieceLen ?? d.maxPieceLen;
  const params: GenParams = {
    rows: rule.rows,
    cols: rule.cols,
    minLen,
    maxLen,
    axis: rule.serpentineAxis ?? d.serpentineAxis,
    backbiteFactor: rule.backbiteFactor ?? d.backbiteFactor,
  };
  const target: DifficultyRange = {
    min: rule.difficulty?.min ?? d.difficulty.min,
    max: rule.difficulty?.max ?? d.difficulty.max,
  };
  const mid = (target.min + target.max) / 2;
  const maxAttempts = rule.maxAttempts ?? d.maxAttempts;

  let best: { config: LevelConfig; score: number; dist: number } | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const pieces = tryGenerate(params, baseSeed + attempt * 7919);
    if (!pieces) continue;
    const config: LevelConfig = {
      id: rule.id,
      rows: rule.rows,
      cols: rule.cols,
      pieces,
      timeLimit: rule.timeLimit,
    };
    const state = createGameState(config, rule.id - 1);
    if (!solve(state)) continue; // 只接受可解
    const score = difficultyScore(state);
    if (score >= target.min && score <= target.max) {
      return config; // 命中目标难度
    }
    const dist = Math.abs(score - mid);
    if (!best || dist < best.dist) best = { config, score, dist };
  }

  // 未命中目标区间：返回最接近的可解候选
  if (best) return best.config;
  // 极端兜底（理论上不会发生）
  const fallback = tryGenerate(params, baseSeed) ?? [];
  return {
    id: rule.id,
    rows: rule.rows,
    cols: rule.cols,
    pieces: fallback,
    timeLimit: rule.timeLimit,
  };
}

/** 由 JSON 规则生成的全部内置关卡 */
export const LEVELS: LevelConfig[] = RULES.levels.map((rule) =>
  buildLevel(rule, rule.id * 100003)
);

export function getLevel(index: number): LevelConfig {
  const clamped = Math.max(0, Math.min(index, LEVELS.length - 1));
  return LEVELS[clamped];
}

export function levelCount(): number {
  return LEVELS.length;
}

/** 暴露默认生命/闪电配置，供其它模块读取 JSON 规则 */
export const RULE_DEFAULTS = RULES.defaults;
