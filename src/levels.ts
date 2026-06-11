import { Cell, DELTA, Direction, LevelConfig, dirBetween } from './types';
import { createGameState } from './gameState';
import { difficultyScore, solve } from './gridLogic';
import rules from './levelRules.json';
import cachedLevels from './levelData.json';

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
function serpentine(rows: number, cols: number, transpose: boolean): { pathR: Int32Array; pathC: Int32Array } {
  const n = rows * cols;
  const pathR = new Int32Array(n);
  const pathC = new Int32Array(n);
  let idx = 0;
  if (!transpose) {
    for (let r = 0; r < rows; r++) {
      if (r % 2 === 0) for (let c = 0; c < cols; c++) { pathR[idx] = r; pathC[idx] = c; idx++; }
      else for (let c = cols - 1; c >= 0; c--) { pathR[idx] = r; pathC[idx] = c; idx++; }
    }
  } else {
    for (let c = 0; c < cols; c++) {
      if (c % 2 === 0) for (let r = 0; r < rows; r++) { pathR[idx] = r; pathC[idx] = c; idx++; }
      else for (let r = rows - 1; r >= 0; r--) { pathR[idx] = r; pathC[idx] = c; idx++; }
    }
  }
  return { pathR, pathC };
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
  pathR: Int32Array,
  pathC: Int32Array,
  rows: number,
  cols: number,
  rng: () => number,
  factor: number
): void {
  const n = rows * cols;
  const len = pathR.length;
  const pos = new Int32Array(n);
  for (let i = 0; i < len; i++) pos[pathR[i] * cols + pathC[i]] = i;

  const moves = n * Math.max(1, factor);
  for (let m = 0; m < moves; m++) {
    const k = len - 1;
    const hr = pathR[k];
    const hc = pathC[k];

    // 内联邻居计算
    let nCount = 0;
    if (hr > 0) nCount++;
    if (hr < rows - 1) nCount++;
    if (hc > 0) nCount++;
    if (hc < cols - 1) nCount++;

    let pick = Math.floor(rng() * nCount);
    let ur = hr, uc = hc;
    if (hr > 0 && pick-- === 0) { ur = hr - 1; }
    else if (hr < rows - 1 && pick-- === 0) { ur = hr + 1; }
    else if (hc > 0 && pick-- === 0) { uc = hc - 1; }
    else { uc = hc + 1; }

    const j = pos[ur * cols + uc];
    if (j < k - 1) {
      // 反转 [j+1, k]，同时更新 pos
      let lo = j + 1;
      let hi = k;
      while (lo < hi) {
        let tr = pathR[lo]; pathR[lo] = pathR[hi]; pathR[hi] = tr;
        let tc = pathC[lo]; pathC[lo] = pathC[hi]; pathC[hi] = tc;
        pos[pathR[lo] * cols + pathC[lo]] = lo;
        pos[pathR[hi] * cols + pathC[hi]] = hi;
        lo++; hi--;
      }
      if (lo === hi) pos[pathR[lo] * cols + pathC[lo]] = lo;
    }
    if (rng() < 0.08) {
      let lo = 0;
      let hi = k;
      while (lo < hi) {
        let tr = pathR[lo]; pathR[lo] = pathR[hi]; pathR[hi] = tr;
        let tc = pathC[lo]; pathC[lo] = pathC[hi]; pathC[hi] = tc;
        pos[pathR[lo] * cols + pathC[lo]] = lo;
        pos[pathR[hi] * cols + pathC[hi]] = hi;
        lo++; hi--;
      }
      if (lo === hi) pos[pathR[lo] * cols + pathC[lo]] = lo;
    }
  }
}

/** 把哈密顿路径切成长度 [minLen,maxLen] 的连续段，全覆盖、无长度1碎片 */
function cutSegments(
  pathR: Int32Array,
  pathC: Int32Array,
  minLen: number,
  maxLen: number,
  rng: () => number
): Cell[][] {
  const segs: Cell[][] = [];
  const total = pathR.length;
  let i = 0;
  while (i < total) {
    let len = minLen + Math.floor(rng() * (maxLen - minLen + 1));
    if (i + len > total) len = total - i;
    if (total - (i + len) === 1) len++;
    const seg: Cell[] = [];
    for (let k = i; k < i + len; k++) seg.push({ row: pathR[k], col: pathC[k] });
    segs.push(seg);
    i += len;
  }
  if (segs.length >= 2 && segs[segs.length - 1].length === 1) {
    const last = segs.pop()!;
    segs[segs.length - 1].push(...last);
  }
  return segs;
}

/**
 * 反向消除定向（增量阻挡追踪）。
 * 接受已切好的蛇形段，返回定向后的棋子；死锁返回 null。
 */
function orientPieces(
  rows: number,
  cols: number,
  snakes: Cell[][],
  seed: number
): RawPiece[] | null {
  const rng = makeRng(seed);
  const idx = (r: number, c: number) => r * cols + c;

  const work = new Int32Array(rows * cols).fill(-1);
  for (let s = 0; s < snakes.length; s++) {
    for (const cell of snakes[s]) work[idx(cell.row, cell.col)] = s;
  }
  const remaining = new Set<number>();
  for (let s = 0; s < snakes.length; s++) remaining.add(s);

  // 预计算每条蛇的头/尾方向
  const headDirs: Direction[] = [];
  const tailDirs: Direction[] = [];
  for (let s = 0; s < snakes.length; s++) {
    const cells = snakes[s];
    const len = cells.length;
    headDirs[s] = dirBetween(cells[len - 2], cells[len - 1]);
    tailDirs[s] = dirBetween(cells[1], cells[0]);
  }

  // 检查射线是否被自身身体阻挡
  const hasSelfBlock = (head: Cell, dir: Direction, self: number): boolean => {
    const { dr, dc } = DELTA[dir];
    let r = head.row + dr;
    let c = head.col + dc;
    while (r >= 0 && r < rows && c >= 0 && c < cols) {
      if (work[idx(r, c)] === self) return true;
      r += dr;
      c += dc;
    }
    return false;
  };

  // 扫描一条射线，返回射线上所有不同阻挡棋子（包含自身，用于正确计数）
  const scanBlockers = (
    head: Cell,
    dir: Direction,
  ): number[] => {
    const { dr, dc } = DELTA[dir];
    let r = head.row + dr;
    let c = head.col + dc;
    const blockers: number[] = [];
    const seen = new Set<number>();
    while (r >= 0 && r < rows && c >= 0 && c < cols) {
      const o = work[idx(r, c)];
      if (o !== -1 && !seen.has(o)) {
        seen.add(o);
        blockers.push(o);
      }
      r += dr;
      c += dc;
    }
    return blockers;
  };

  // 分方向阻挡计数：头/尾射线各自独立追踪
  // headBlockers[p] / tailBlockers[p] = 外部棋子阻挡数（不含自身）
  // blockedByHead[b] / blockedByTail[b] = 被 b 阻挡的棋子列表
  const headBlockers = new Int32Array(snakes.length);
  const tailBlockers = new Int32Array(snakes.length);
  const blockedByHead: number[][] = Array.from({ length: snakes.length }, () => []);
  const blockedByTail: number[][] = Array.from({ length: snakes.length }, () => []);

  for (const s of remaining) {
    const cells = snakes[s];
    const len = cells.length;
    const hb = scanBlockers(cells[len - 1], headDirs[s]);
    const tb = scanBlockers(cells[0], tailDirs[s]);
    for (const b of hb) {
      if (b !== s) { headBlockers[s]++; blockedByHead[b].push(s); }
    }
    for (const b of tb) {
      if (b !== s) { tailBlockers[s]++; blockedByTail[b].push(s); }
    }
  }

  const oriented = new Map<number, RawPiece>();
  while (remaining.size > 0) {
    // 收集当前可消除候选（头或尾方向无外部阻挡且无自身阻挡）
    const candidates: { snake: number; headIsLast: boolean; dir: Direction }[] =
      [];
    for (const s of remaining) {
      const cells = snakes[s];
      const len = cells.length;
      if (headBlockers[s] === 0 && !hasSelfBlock(cells[len - 1], headDirs[s], s)) {
        candidates.push({ snake: s, headIsLast: true, dir: headDirs[s] });
      }
      if (tailBlockers[s] === 0 && !hasSelfBlock(cells[0], tailDirs[s], s)) {
        candidates.push({ snake: s, headIsLast: false, dir: tailDirs[s] });
      }
    }
    if (candidates.length === 0) return null; // 死锁

    // 智能选择：选移除后释放最少新可消除棋子的候选，加深依赖链
    let bestScore = Infinity;
    let bestCandidates: typeof candidates = [];
    for (const candidate of candidates) {
      const sn = candidate.snake;
      let clearCount = 0;
      // 统计移除该候选后有多少棋子变为可消除
      // 合并两个方向的 blockedBy 并去重
      const affected = new Set<number>();
      for (const b of blockedByHead[sn]) affected.add(b);
      for (const b of blockedByTail[sn]) affected.add(b);
      for (const b of affected) {
        if (remaining.has(b) && headBlockers[b] + tailBlockers[b] === 1) clearCount++;
      }
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

    // 移除棋子并增量更新阻挡关系
    for (const cell of cells) work[idx(cell.row, cell.col)] = -1;
    remaining.delete(pick.snake);

    // 重新扫描被移除棋子阻挡过的棋子（头+尾两个方向）
    const affected = new Set<number>();
    for (const b of blockedByHead[pick.snake]) affected.add(b);
    for (const b of blockedByTail[pick.snake]) affected.add(b);
    for (const p of affected) {
      if (!remaining.has(p)) continue;
      // 重新扫描以修正阻挡关系
      const pcells = snakes[p];
      const plen = pcells.length;
      const hb = scanBlockers(pcells[plen - 1], headDirs[p]);
      const tb = scanBlockers(pcells[0], tailDirs[p]);
      headBlockers[p] = 0;
      tailBlockers[p] = 0;
      for (const b of hb) {
        if (b !== p) { headBlockers[p]++; blockedByHead[b].push(p); }
      }
      for (const b of tb) {
        if (b !== p) { tailBlockers[p]++; blockedByTail[b].push(p); }
      }
    }
  }

  return [...oriented.values()];
}

/** 单次完整生成：蛇形 + backbite + 切段 + 定向 */
function tryGenerate(p: GenParams, seed: number): RawPiece[] | null {
  const { rows, cols, minLen, maxLen, axis, backbiteFactor } = p;
  const rng = makeRng(seed);
  const transpose = axis === 'cols' ? true : axis === 'rows' ? false : rng() < 0.5;
  const { pathR, pathC } = serpentine(rows, cols, transpose);
  backbite(pathR, pathC, rows, cols, rng, backbiteFactor);
  const snakes = cutSegments(pathR, pathC, minLen, maxLen, rng);
  return orientPieces(rows, cols, snakes, seed + 50000000);
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

  // 优化：每批共享蛇形结构，仅变化定向种子，避免重复 backbite
  const BATCH = 2;
  const numBatches = Math.ceil(maxAttempts / BATCH);

  for (let batch = 0; batch < numBatches; batch++) {
    // 每批生成一次蛇形结构（昂贵的 backbite 只在这里跑）
    const batchPathSeed = baseSeed + batch * 7919;
    const pathRng = makeRng(batchPathSeed);
    const transpose = params.axis === 'cols' ? true : params.axis === 'rows' ? false : pathRng() < 0.5;
    const { pathR, pathC } = serpentine(params.rows, params.cols, transpose);
    backbite(pathR, pathC, params.rows, params.cols, pathRng, params.backbiteFactor);
    const snakes = cutSegments(pathR, pathC, params.minLen, params.maxLen, pathRng);

    for (let j = 0; j < BATCH; j++) {
      const attempt = batch * BATCH + j;
      if (attempt >= maxAttempts) break;
      const orientSeed = baseSeed + attempt * 7919 + 50000000;
      const pieces = orientPieces(params.rows, params.cols, snakes, orientSeed);
      if (!pieces) continue;
      const config: LevelConfig = {
        id: rule.id,
        rows: rule.rows,
        cols: rule.cols,
        pieces,
        timeLimit: rule.timeLimit,
      };
      const state = createGameState(config, rule.id - 1);
      if (!solve(state)) continue;
      const score = difficultyScore(state);
      if (score >= target.min && score <= target.max) {
        return config;
      }
      const dist = Math.abs(score - mid);
      if (!best || dist < best.dist) best = { config, score, dist };
    }
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

/** 按需加载关卡：优先使用预计算缓存，无缓存则实时生成 */
const precomputed = cachedLevels as LevelConfig[];

export function getLevel(index: number): LevelConfig {
  const clamped = Math.max(0, Math.min(index, RULES.levels.length - 1));
  if (clamped < precomputed.length) {
    return precomputed[clamped];
  }
  // 预计算数据未覆盖的关卡，回退到实时生成
  const rule = RULES.levels[clamped];
  return buildLevel(rule, rule.id * 100003);
}

export function levelCount(): number {
  return RULES.levels.length;
}

/** 暴露默认生命/闪电配置，供其它模块读取 JSON 规则 */
export const RULE_DEFAULTS = RULES.defaults;

