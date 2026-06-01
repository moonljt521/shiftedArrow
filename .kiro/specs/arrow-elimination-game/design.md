# Design Document

## Overview

箭头消除迷宫游戏的 Web 版本采用 TypeScript + Vite 构建，使用纯 DOM/CSS 渲染（不依赖游戏引擎），便于实现箭头飞出动画、网格布局和响应式移动端竖屏界面。

核心玩法：玩家点击网格中的箭头，若箭头朝向的直线路径（同行或同列）上没有其他未消除的箭头，则箭头沿方向飞出网格并消除；否则箭头变红表示失败并扣除一点生命值。目标是消除关卡内所有箭头。

技术选型理由：
- **TypeScript**：类型安全，便于建模网格、箭头、游戏状态。
- **Vite**：零配置、快速热更新的现代前端构建工具。
- **DOM + CSS Transform/Transition**：箭头数量有限（数十个），DOM 渲染足够流畅，CSS transition 实现飞出动画简单可靠，且天然支持点击事件命中。
- **无后端**：关卡数据以静态 JSON/TS 配置内置，进度存于 localStorage。

## Architecture

采用 MVC 风格的分层架构，状态集中管理，渲染与逻辑解耦：

```
┌─────────────────────────────────────────────┐
│                  main.ts                      │
│            (应用入口 / 启动)                   │
└───────────────────┬───────────────────────────┘
                    │
        ┌───────────▼───────────┐
        │      GameController    │  协调输入、逻辑、渲染、关卡流转
        └───┬────────┬───────┬──┘
            │        │       │
   ┌────────▼──┐ ┌───▼─────┐ ┌▼──────────┐
   │ GameState │ │ GridLogic│ │  Renderer │
   │ (状态模型) │ │ (规则判定)│ │ (DOM渲染) │
   └───────────┘ └─────────┘ └───────────┘
            │                      │
   ┌────────▼──────┐      ┌────────▼────────┐
   │ LevelLoader    │      │  HUD / Overlay   │
   │ (关卡数据加载)  │      │  (顶部栏/弹层)    │
   └────────────────┘      └──────────────────┘
```

数据流：用户点击 → Renderer 派发 cell 坐标 → GameController → GridLogic 判定可否消除 → 更新 GameState → 通知 Renderer 播放动画/更新 HUD。

## Components and Interfaces

### 类型定义 (types.ts)

```typescript
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Arrow {
  id: number;
  row: number;
  col: number;
  dir: Direction;
  removed: boolean;      // 是否已消除
  hinted: boolean;       // 是否被提示标记
}

export interface LevelConfig {
  id: number;
  rows: number;
  cols: number;
  // 稀疏布局：仅记录有箭头的格子
  arrows: { row: number; col: number; dir: Direction }[];
  timeLimit: number;     // 秒，默认 180
}

export type GameStatus = 'ready' | 'playing' | 'won' | 'lost';

export interface GameState {
  level: number;
  grid: (Arrow | null)[][];   // rows x cols，null 表示空位
  arrows: Map<number, Arrow>; // id -> Arrow，便于快速访问
  lives: number;              // 初始 3
  lightning: number;          // 提示资源
  timeRemaining: number;      // 秒
  timerStarted: boolean;      // 首次提示后启动
  status: GameStatus;
  isAnimating: boolean;       // 动画锁
}
```

### GridLogic (gridLogic.ts) — 纯函数规则引擎

```typescript
// 计算飞行路径上的单元格（不含自身），到边界为止
function getFlightPath(grid, arrow): {row,col}[]

// 判定箭头是否可消除：路径上无未消除箭头
function canEliminate(grid: (Arrow|null)[][], arrow: Arrow): boolean

// 求解一条可行的消除顺序（用于提示与可解性校验）
// 贪心 + 回溯：每步选一个可消除箭头消除，直到全消或卡死
function solve(state: GameState): number[] | null  // 返回 arrow id 顺序

// 是否还存在任何可消除的箭头（死局检测）
function hasAnyMove(state: GameState): boolean
```

设计决策：`canEliminate` 只需扫描同行/同列直到第一个未消除箭头即可，O(行或列长度)。`solve` 用于「提示」和「关卡可解性校验」，对数十个箭头规模，DFS 回溯可接受。

### GameState 管理 (gameState.ts)

```typescript
function createGameState(level: LevelConfig): GameState
function eliminateArrow(state, id): void       // 标记消除、更新 grid
function loseLife(state): void
function useHint(state): number | null         // 返回应消除的 arrow id
function isLevelComplete(state): boolean       // 所有箭头 removed
```

### Renderer (renderer.ts) — DOM 渲染层

```typescript
class Renderer {
  mountGrid(state: GameState): void            // 构建网格 DOM
  playEliminate(arrow, onDone): void           // 飞出动画 (CSS transform)
  playFail(arrow, onDone): void                // 变红闪烁动画
  markHint(arrowId): void                      // 灰点标记
  updateHUD(state): void                       // 生命/时间/关卡/闪电
  showOverlay(type: 'won'|'lost'|'levelup'): void
  onCellClick(handler: (id:number)=>void): void
}
```

飞出动画实现：箭头元素 `position:absolute`，点击后计算到边界的平移距离，应用 `transform: translate(...)` + `opacity:0`，`transitionend` 后从 DOM 移除。

### GameController (gameController.ts)

```typescript
class GameController {
  startLevel(levelIndex: number): void
  handleArrowClick(id: number): void   // 核心交互入口
  handleHint(): void
  tickTimer(): void                    // 每秒调用
  pause(): void / resume(): void
  retryLevel(): void
  nextLevel(): void
}
```

`handleArrowClick` 流程：
1. 若 `isAnimating` 或非 playing 状态，忽略。
2. `canEliminate?` → 是：设 `isAnimating`，播放飞出动画，动画结束消除箭头、清除提示标记、检查胜利。
3. 否：播放失败动画，`loseLife`，检查 lives==0 → 失败。

### LevelLoader (levels.ts)

内置关卡配置数组。提供按难度生成器（可选）：随机生成 + `solve` 校验确保可解。

```typescript
export const LEVELS: LevelConfig[]
export function getLevel(index: number): LevelConfig
```

## Data Models

**网格表示**：二维数组 `grid[row][col]`，元素为 `Arrow | null`。消除时置为 `null` 并设 `arrow.removed = true`。这样飞行路径判定只需读 `grid`。

**关卡数据**：采用稀疏布局，只存有箭头的格子，减少配置体积；非箭头格子初始即为空位（可通行）。

**进度持久化**：`localStorage` 存储 `{ maxLevelUnlocked: number }`。

## Error Handling

| 场景 | 处理 |
|------|------|
| 关卡配置非法（箭头越界/重叠） | 加载时校验，控制台报错并跳过非法箭头 |
| 死局（无任何可消除箭头但仍有箭头） | `hasAnyMove` 检测，提示按钮禁用；可提供「重开本关」 |
| 动画进行中重复点击 | `isAnimating` 锁屏蔽 |
| 提示资源为 0 | 按钮置灰禁用 |
| localStorage 不可用 | try/catch 降级为内存态，不阻断游戏 |

## Testing Strategy

单元测试（Vitest）聚焦纯逻辑：
- `getFlightPath` / `canEliminate`：边界、同行同列、被阻挡、自身排除等用例。
- `solve`：可解关卡返回有效顺序，死局返回 null。
- `eliminateArrow` / `loseLife` / `isLevelComplete` 状态转移。
- 难度递增校验（需求 6.3）。

手动/集成测试：
- 飞出与失败动画视觉验证。
- 计时器暂停/恢复、生命归零、关卡流转。

## 项目结构

```
shiftedArrow/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.ts
│   ├── types.ts
│   ├── levels.ts
│   ├── gridLogic.ts
│   ├── gameState.ts
│   ├── renderer.ts
│   ├── gameController.ts
│   └── style.css
└── tests/
    └── gridLogic.test.ts
```
