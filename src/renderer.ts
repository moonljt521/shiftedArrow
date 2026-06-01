import { DELTA, GameState, Piece } from './types';
import { headCell } from './gridLogic';

type ClickHandler = (id: number) => void;
type ButtonHandler = () => void;

const SVG_NS = 'http://www.w3.org/2000/svg';

export class Renderer {
  private root: HTMLElement;
  private svg!: SVGSVGElement;
  private levelEl!: HTMLElement;
  private heartsEl!: HTMLElement;
  private timerEl!: HTMLElement;
  private lightningEl!: HTMLElement;
  private hintBtn!: HTMLButtonElement;
  private overlayEl!: HTMLElement;

  /** pieceId -> 该棋子的 SVG 分组 <g> */
  private pieceEls = new Map<number, SVGGElement>();

  private clickHandler: ClickHandler = () => {};
  private hintHandler: ButtonHandler = () => {};
  private settingsHandler: ButtonHandler = () => {};
  private levelSelectHandler: ButtonHandler = () => {};

  private cellSize = 40;
  private rows = 0;
  private cols = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.buildShell();
  }

  onCellClick(handler: ClickHandler): void {
    this.clickHandler = handler;
  }
  onHint(handler: ButtonHandler): void {
    this.hintHandler = handler;
  }
  onSettings(handler: ButtonHandler): void {
    this.settingsHandler = handler;
  }
  onLevelSelect(handler: ButtonHandler): void {
    this.levelSelectHandler = handler;
  }

  private buildShell(): void {
    this.root.innerHTML = `
      <div class="game">
        <header class="hud">
          <div class="hud-left">
            <button class="icon-btn" id="btn-settings" aria-label="设置">⚙</button>
            <button class="icon-btn" id="btn-eye" aria-label="选择关卡">☰</button>
          </div>
          <div class="hud-center">
            <div class="level-title" id="level-title">关卡: 1</div>
            <div class="hearts" id="hearts"></div>
            <div class="timer" id="timer"></div>
          </div>
          <div class="hud-right"></div>
        </header>

        <main class="board" id="board">
          <svg class="grid-svg" id="grid-svg" xmlns="${SVG_NS}"></svg>
          <div class="overlay hidden" id="overlay"></div>
        </main>

        <footer class="foot">
          <button class="hint-btn" id="btn-hint" aria-label="提示">
            <span class="bulb">💡</span>
            <span class="lightning" id="lightning">∞</span>
          </button>
        </footer>
      </div>
    `;

    this.svg = this.byId('grid-svg') as unknown as SVGSVGElement;
    this.levelEl = this.byId('level-title');
    this.heartsEl = this.byId('hearts');
    this.timerEl = this.byId('timer');
    this.lightningEl = this.byId('lightning');
    this.hintBtn = this.byId('btn-hint') as HTMLButtonElement;
    this.overlayEl = this.byId('overlay');

    this.hintBtn.addEventListener('click', () => this.hintHandler());
    this.byId('btn-settings').addEventListener('click', () => this.settingsHandler());
    this.byId('btn-eye').addEventListener('click', () => this.levelSelectHandler());
  }

  private byId(id: string): HTMLElement {
    const el = this.root.querySelector(`#${id}`);
    if (!el) throw new Error(`Element not found: ${id}`);
    return el as HTMLElement;
  }

  /** 单元格中心坐标 */
  private center(row: number, col: number): { x: number; y: number } {
    return { x: col * this.cellSize + this.cellSize / 2, y: row * this.cellSize + this.cellSize / 2 };
  }

  /** 构建棋盘 SVG */
  mountGrid(state: GameState): void {
    this.rows = state.rows;
    this.cols = state.cols;
    this.pieceEls.clear();
    this.hideOverlay();

    // 计算单元格尺寸以适配视口
    const maxBoardWidth = Math.min(window.innerWidth - 24, 460);
    const maxBoardHeight = window.innerHeight - 220;
    const sizeByW = Math.floor(maxBoardWidth / state.cols);
    const sizeByH = Math.floor(maxBoardHeight / state.rows);
    this.cellSize = Math.max(22, Math.min(sizeByW, sizeByH, 52));

    const w = this.cellSize * state.cols;
    const h = this.cellSize * state.rows;
    this.svg.setAttribute('width', String(w));
    this.svg.setAttribute('height', String(h));
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.svg.innerHTML = '';

    for (const piece of state.pieces.values()) {
      const g = this.buildPieceEl(piece);
      this.svg.appendChild(g);
      this.pieceEls.set(piece.id, g);
    }

    this.updateHUD(state);
  }

  /** 为一条折线棋子构建 <g>：粗线条 path + 头部箭头 + 透明命中区 */
  private buildPieceEl(piece: Piece): SVGGElement {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'piece');
    g.dataset.id = String(piece.id);

    // 参考图是更细的线条，主视觉收一档，但命中区保持更宽，避免影响操作手感
    const stroke = Math.max(2.4, this.cellSize * 0.14);

    // 1) 折线主体：画到头部格中心（不回缩），让箭头三角覆盖在末端之上，二者始终相连
    const d = this.fullPath(piece);
    const line = document.createElementNS(SVG_NS, 'path');
    line.setAttribute('d', d);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', 'currentColor');
    line.setAttribute('stroke-width', String(stroke));
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('class', 'piece-line');
    g.appendChild(line);

    // 2) 头部箭头：基座位于线末端之后、与线重叠，尖端朝 dir
    const tri = document.createElementNS(SVG_NS, 'path');
    tri.setAttribute('d', this.triTemplate(stroke));
    tri.setAttribute('fill', 'currentColor');
    tri.setAttribute('class', 'piece-head');
    const head = headCell(piece);
    const hc = this.center(head.row, head.col);
    const ang = this.dirAngle(piece.dir);
    tri.setAttribute('transform', `translate(${hc.x} ${hc.y}) rotate(${ang})`);
    g.appendChild(tri);

    // 3) 透明加粗命中区
    const hit = document.createElementNS(SVG_NS, 'path');
    hit.setAttribute('d', this.fullPath(piece));
    hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', String(stroke + this.cellSize * 0.5));
    hit.setAttribute('stroke-linecap', 'round');
    hit.setAttribute('stroke-linejoin', 'round');
    hit.setAttribute('class', 'piece-hit');
    g.appendChild(hit);

    g.addEventListener('click', () => this.clickHandler(piece.id));
    return g;
  }

  /** 各单元格中心点 */
  private points(piece: Piece): { x: number; y: number }[] {
    return piece.cells.map((c) => this.center(c.row, c.col));
  }

  /** 完整折线（不回缩），用于命中区与动画基准 */
  private fullPath(piece: Piece): string {
    const pts = this.points(piece);
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
    return d;
  }

  /** 单位三角模板（指向 +x，原点为头部中心）。
   * 基座向后延伸盖住线末端，使箭头与线无缝相连；尖端伸到格中心前方。 */
  private triTemplate(stroke: number): string {
    const half = stroke * 1.05; // 三角半宽（略宽于线，形成箭头视感）
    const tip = stroke * 1.5; // 尖端前伸
    const base = -stroke * 0.6; // 基座后移，与线重叠
    return `M ${tip} 0 L ${base} ${half} L ${base} ${-half} Z`;
  }

  /** 方向 -> 旋转角度（度，+x 为 0，y 向下） */
  private dirAngle(dir: Piece['dir']): number {
    switch (dir) {
      case 'right':
        return 0;
      case 'down':
        return 90;
      case 'left':
        return 180;
      case 'up':
        return 270;
    }
  }

  /**
   * 成功飞出动画：整条蛇沿自身折线向前滑出（头部领路、身体跟随过弯），
   * 在网格边界被裁剪。用 stroke-dash 窗口沿路径前移实现，箭头用 getPointAtLength 跟随。
   */
  playEliminate(piece: Piece, onDone: () => void): void {
    const g = this.pieceEls.get(piece.id);
    if (!g) {
      onDone();
      return;
    }
    const line = g.querySelector<SVGPathElement>('.piece-line')!;
    const tri = g.querySelector<SVGPathElement>('.piece-head')!;
    const hit = g.querySelector<SVGPathElement>('.piece-hit');
    if (hit) hit.remove();
    g.classList.add('flying');

    // 构建"完整折线 + 头部向前延伸出界"的动画路径
    const pts = this.points(piece);
    const head = pts[pts.length - 1];
    const { dr, dc } = DELTA[piece.dir];
    const headCellPos = headCell(piece);
    const edgeSteps =
      piece.dir === 'up'
        ? headCellPos.row + 1
        : piece.dir === 'down'
          ? this.rows - headCellPos.row
          : piece.dir === 'left'
            ? headCellPos.col + 1
            : this.cols - headCellPos.col;
    const extLen = (edgeSteps + 1) * this.cellSize;
    const extHead = { x: head.x + dc * extLen, y: head.y + dr * extLen };

    let dPath = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) dPath += ` L ${pts[i].x} ${pts[i].y}`;
    dPath += ` L ${extHead.x} ${extHead.y}`;
    line.setAttribute('d', dPath);

    // 环境不支持 SVG 路径测量（如 jsdom 测试）时，直接淡出收尾
    if (typeof line.getTotalLength !== 'function') {
      g.style.transition = 'opacity 200ms';
      g.style.opacity = '0';
      window.setTimeout(() => {
        g.remove();
        this.pieceEls.delete(piece.id);
        onDone();
      }, 210);
      return;
    }

    const total = line.getTotalLength();
    // 蛇身可见长度 = 从起点到头部顶点的长度
    const bodyLen = total - extLen;
    const gap = total + bodyLen + 10;
    line.style.strokeDasharray = `${bodyLen} ${gap}`;
    line.style.strokeLinecap = 'round';

    const travel = bodyLen + extLen; // 让尾巴也走过出界点
    const duration = 680;
    const start = performance.now();

    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeIn 让飞出有加速感
      const e = t * t;
      const d = e * travel;
      line.style.strokeDashoffset = `${-d}`;
      // 箭头沿路径前移到当前窗口头部
      const headPos = Math.min(d + bodyLen, total);
      const pt = line.getPointAtLength(headPos);
      const ahead = line.getPointAtLength(Math.min(headPos + 1, total));
      const ang = (Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180) / Math.PI;
      tri.setAttribute('transform', `translate(${pt.x} ${pt.y}) rotate(${ang})`);

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        g.remove();
        this.pieceEls.delete(piece.id);
        onDone();
      }
    };
    requestAnimationFrame(frame);
  }

  /** 失败变红闪烁 */
  playFail(piece: Piece, onDone: () => void): void {
    const g = this.pieceEls.get(piece.id);
    if (!g) {
      onDone();
      return;
    }
    g.classList.add('failed');
    window.setTimeout(() => {
      g.classList.remove('failed');
      onDone();
    }, 900);
  }

  markHint(pieceId: number): void {
    this.pieceEls.get(pieceId)?.classList.add('hinted');
  }

  clearHint(pieceId: number): void {
    this.pieceEls.get(pieceId)?.classList.remove('hinted');
  }

  clearAllHints(): void {
    for (const el of this.pieceEls.values()) {
      el.classList.remove('hinted');
    }
  }

  updateHUD(state: GameState): void {
    this.levelEl.textContent = `关卡: ${state.level}`;

    this.heartsEl.innerHTML = '';
    const maxLives = Math.max(3, state.lives);
    for (let i = 0; i < maxLives; i++) {
      const heart = document.createElement('span');
      heart.className = i < state.lives ? 'heart full' : 'heart empty';
      heart.textContent = '♥';
      this.heartsEl.appendChild(heart);
    }

    if (state.timerStarted) {
      this.timerEl.classList.remove('hidden');
      const m = Math.floor(state.timeRemaining / 60);
      const s = state.timeRemaining % 60;
      this.timerEl.textContent = `🪙 ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    } else {
      this.timerEl.classList.add('hidden');
    }

    this.lightningEl.textContent = state.lightning > 0 ? String(state.lightning) : '0';
    this.hintBtn.disabled = state.lightning <= 0 || state.status !== 'playing';
    this.hintBtn.classList.toggle('disabled', this.hintBtn.disabled);
  }

  showOverlay(
    type: 'won' | 'lost' | 'levelup' | 'gamecomplete',
    state: GameState
  ): void {
    let title = '';
    let msg = '';
    let buttons = '';
    switch (type) {
      case 'won':
      case 'levelup':
        title = '🎉 关卡完成';
        msg = `关卡 ${state.level} 已通过`;
        buttons = `<button class="ov-btn primary" data-action="next">下一关</button>`;
        break;
      case 'gamecomplete':
        title = '🏆 全部通关';
        msg = '恭喜你完成了所有关卡！';
        buttons = `<button class="ov-btn primary" data-action="restart">重新开始</button>`;
        break;
      case 'lost':
        title = '💔 关卡失败';
        msg = state.lives <= 0 ? '生命值耗尽' : '时间到';
        buttons = `<button class="ov-btn primary" data-action="retry">重新开始本关</button>`;
        break;
    }
    this.overlayEl.innerHTML = `
      <div class="modal">
        <div class="modal-title">${title}</div>
        <div class="modal-msg">${msg}</div>
        <div class="modal-actions">${buttons}</div>
      </div>
    `;
    this.overlayEl.classList.remove('hidden');
  }

  onOverlayAction(handler: (action: string) => void): void {
    this.overlayEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.dataset.action) handler(target.dataset.action);
    });
  }

  /** 暂停菜单：继续 / 重玩本关 / 回到第一关 */
  showPauseMenu(state: GameState): void {
    this.overlayEl.innerHTML = `
      <div class="modal">
        <div class="modal-title">⏸ 已暂停</div>
        <div class="modal-msg">关卡 ${state.level}</div>
        <div class="modal-actions vertical">
          <button class="ov-btn primary" data-action="resume">继续游戏</button>
          <button class="ov-btn" data-action="retry">重玩本关</button>
          <button class="ov-btn" data-action="restart">回到第一关</button>
        </div>
      </div>
    `;
    this.overlayEl.classList.remove('hidden');
  }

  /** 关卡选择：列出所有关卡，未解锁的禁用 */
  showLevelSelect(totalLevels: number, unlockedIndex: number): void {
    const items: string[] = [];
    for (let i = 0; i < totalLevels; i++) {
      const locked = i > unlockedIndex;
      items.push(
        `<button class="level-cell ${locked ? 'locked' : ''}" ${
          locked ? 'disabled' : ''
        } data-action="goto:${i}">${locked ? '🔒' : i + 1}</button>`
      );
    }
    this.overlayEl.innerHTML = `
      <div class="modal">
        <div class="modal-title">选择关卡</div>
        <div class="level-grid">${items.join('')}</div>
        <div class="modal-actions">
          <button class="ov-btn" data-action="close">关闭</button>
        </div>
      </div>
    `;
    this.overlayEl.classList.remove('hidden');
  }

  hideOverlay(): void {
    this.overlayEl.classList.add('hidden');
    this.overlayEl.innerHTML = '';
  }
}
