import {
  createGameState,
  eliminatePiece,
  isLevelComplete,
  loseLife,
  useHint,
} from './gameState';
import { canEliminate } from './gridLogic';
import { getLevel, levelCount } from './levels';
import { Renderer } from './renderer';
import { GameState } from './types';

const STORAGE_KEY = 'arrow-elim-progress';

export class GameController {
  private state!: GameState;
  private renderer: Renderer;
  private timerId: number | null = null;
  private paused = false;
  private activeAnimations = 0;
  private lockedPieces = new Set<number>();

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.renderer.onCellClick((id) => this.handlePieceClick(id));
    this.renderer.onHint(() => this.handleHint());
    this.renderer.onSettings(() => this.openPauseMenu());
    this.renderer.onLevelSelect(() => this.openLevelSelect());
    this.renderer.onOverlayAction((action) => this.handleOverlayAction(action));
  }

  start(): void {
    // 每次刷新都从第一关开始；已解锁进度仍保留，可在关卡选择中跳转
    this.startLevel(0);
  }

  startLevel(levelIndex: number): void {
    this.stopTimer();
    const config = getLevel(levelIndex);
    this.state = createGameState(config, levelIndex);
    this.state.status = 'playing';
    this.paused = false;
    this.activeAnimations = 0;
    this.lockedPieces.clear();
    this.state.isAnimating = false;
    this.renderer.mountGrid(this.state);
  }

  /** 核心交互：点击棋子 */
  handlePieceClick(id: number): void {
    const state = this.state;
    if (state.status !== 'playing' || this.paused || this.lockedPieces.has(id)) return;

    const piece = state.pieces.get(id);
    if (!piece || piece.removed) return;

    if (canEliminate(state, piece)) {
      this.lockedPieces.add(id);
      this.beginAnimation();
      eliminatePiece(state, id);
      this.renderer.updateHUD(state);
      this.renderer.drawGuideLines(state);
      this.renderer.playEliminate(piece, () => {
        this.lockedPieces.delete(id);
        this.endAnimation();
        this.renderer.clearAllHints();
        if (isLevelComplete(state) && this.activeAnimations === 0) this.onLevelWon();
      });
    } else {
      this.lockedPieces.add(id);
      this.beginAnimation();
      this.renderer.playFail(piece, state, () => {
        this.lockedPieces.delete(id);
        loseLife(state);
        this.renderer.clearAllHints();
        this.renderer.updateHUD(state);
        this.endAnimation();
        if (state.lives <= 0) this.onLevelLost();
      });
    }
  }

  handleHint(): void {
    const state = this.state;
    if (state.status !== 'playing' || state.isAnimating || this.paused) return;
    const id = useHint(state);
    if (id === null) return;

    if (!state.timerStarted) {
      state.timerStarted = true;
      this.startTimer();
    }
    this.renderer.clearAllHints();
    this.renderer.markHint(id);
    this.renderer.updateHUD(state);
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerId = window.setInterval(() => this.tickTimer(), 1000);
  }

  private beginAnimation(): void {
    this.activeAnimations += 1;
    this.state.isAnimating = true;
  }

  private endAnimation(): void {
    this.activeAnimations = Math.max(0, this.activeAnimations - 1);
    this.state.isAnimating = this.activeAnimations > 0;
  }

  private stopTimer(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private tickTimer(): void {
    const state = this.state;
    if (this.paused || state.status !== 'playing') return;
    state.timeRemaining -= 1;
    if (state.timeRemaining <= 0) {
      state.timeRemaining = 0;
      this.renderer.updateHUD(state);
      this.onLevelLost();
      return;
    }
    this.renderer.updateHUD(state);
  }

  /** 打开暂停菜单（暂停计时） */
  openPauseMenu(): void {
    if (this.state.status !== 'playing') return;
    this.paused = true;
    this.renderer.showPauseMenu(this.state);
  }

  /** 打开关卡选择 */
  openLevelSelect(): void {
    if (this.state.status === 'playing') this.paused = true;
    this.renderer.showLevelSelect(levelCount(), this.loadProgress());
  }

  private onLevelWon(): void {
    this.stopTimer();
    this.state.status = 'won';
    const isLast = this.state.levelIndex >= levelCount() - 1;
    this.saveProgress(Math.min(this.state.levelIndex + 1, levelCount() - 1));
    this.renderer.showOverlay(isLast ? 'gamecomplete' : 'won', this.state);
  }

  private onLevelLost(): void {
    this.stopTimer();
    this.state.status = 'lost';
    this.renderer.showOverlay('lost', this.state);
  }

  private handleOverlayAction(action: string): void {
    if (action.startsWith('goto:')) {
      const idx = Number(action.slice(5));
      this.renderer.showLoading(`加载关卡 ${idx + 1}...`);
      setTimeout(() => {
        this.renderer.hideOverlay();
        this.startLevel(idx);
      }, 50);
      return;
    }
    switch (action) {
      case 'next':
        this.startLevel(this.state.levelIndex + 1);
        break;
      case 'retry':
        this.startLevel(this.state.levelIndex);
        break;
      case 'restart':
        this.startLevel(0);
        break;
      case 'resume':
        this.renderer.hideOverlay();
        this.paused = false;
        break;
      case 'close':
        // 关闭关卡选择：若游戏进行中则恢复
        this.renderer.hideOverlay();
        if (this.state.status === 'playing') this.paused = false;
        break;
    }
  }

  private loadProgress(): number {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as { maxLevelUnlocked: number };
        return Math.max(0, Math.min(data.maxLevelUnlocked ?? 0, levelCount() - 1));
      }
    } catch {
      // localStorage 不可用，降级为从头开始
    }
    return 0;
  }

  private saveProgress(maxLevelUnlocked: number): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ maxLevelUnlocked }));
    } catch {
      // 忽略持久化失败
    }
  }
}
