import { DELTA, GameState, Piece } from './types';
import { headCell } from './gridLogic';

type ClickHandler = (id: number) => void;
type ButtonHandler = () => void;
type ZoomHandler = (zoom: number) => void;

const SVG_NS = 'http://www.w3.org/2000/svg';

export class Renderer {
  private root: HTMLElement;
  private svg!: SVGSVGElement;
  private boardEl!: HTMLElement;
  private boardInner!: HTMLElement;
  private gridLinesGroup!: SVGGElement;
  private piecesGroup!: SVGGElement;
  private guideGroup!: SVGGElement;
  private levelEl!: HTMLElement;
  private heartsEl!: HTMLElement;
  private timerEl!: HTMLElement;
  private lightningEl!: HTMLElement;
  private hintBtn!: HTMLButtonElement;
  private guideBtn!: HTMLButtonElement;
  private zoomSlider!: HTMLInputElement;
  private zoomLabel!: HTMLElement;
  private overlayEl!: HTMLElement;

  /** pieceId -> 该棋子的 SVG 分组 <g> */
  private pieceEls = new Map<number, SVGGElement>();

  private clickHandler: ClickHandler = () => {};
  private hintHandler: ButtonHandler = () => {};
  private settingsHandler: ButtonHandler = () => {};
  private levelSelectHandler: ButtonHandler = () => {};
  private zoomHandler: ZoomHandler = () => {};
  private guideHandler: ButtonHandler = () => {};

  private cellSize = 40;
  private rows = 0;
  private cols = 0;

  /* ---- zoom / pan state ---- */
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private panStartPanX = 0;
  private panStartPanY = 0;
  private guideVisible = false;

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
  onZoom(handler: ZoomHandler): void {
    this.zoomHandler = handler;
  }
  onGuideToggle(handler: ButtonHandler): void {
    this.guideHandler = handler;
  }

  private buildShell(): void {
    this.root.innerHTML = `
      <div class="game">
        <header class="hud">
          <div class="hud-left">
            <button class="icon-btn" id="btn-theme" aria-label="明暗模式">🌙</button>
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
          <div class="board-inner" id="board-inner">
            <svg class="grid-svg" id="grid-svg" xmlns="${SVG_NS}"></svg>
          </div>
          <div class="overlay hidden" id="overlay"></div>
        </main>

        <footer class="foot">
          <button class="tool-btn" id="btn-hint" aria-label="提示">
            <span class="tool-icon">💡</span>
            <span class="tool-label">提示</span>
            <span class="lightning" id="lightning">∞</span>
          </button>
          <div class="zoom-control">
            <button class="zoom-btn" id="btn-zoom-out" aria-label="缩小">−</button>
            <input type="range" class="zoom-slider" id="zoom-slider" min="100" max="300" value="100" step="10" />
            <button class="zoom-btn" id="btn-zoom-in" aria-label="放大">+</button>
            <span class="zoom-label" id="zoom-label">100%</span>
          </div>
          <button class="tool-btn" id="btn-guide" aria-label="辅助线">
            <span class="tool-icon">#</span>
            <span class="tool-label">辅助线</span>
          </button>
        </footer>
      </div>
    `;

    this.svg = this.byId('grid-svg') as unknown as SVGSVGElement;
    this.boardEl = this.byId('board');
    this.boardInner = this.byId('board-inner');
    this.levelEl = this.byId('level-title');
    this.heartsEl = this.byId('hearts');
    this.timerEl = this.byId('timer');
    this.lightningEl = this.byId('lightning');
    this.hintBtn = this.byId('btn-hint') as HTMLButtonElement;
    this.guideBtn = this.byId('btn-guide') as HTMLButtonElement;
    this.zoomSlider = this.byId('zoom-slider') as HTMLInputElement;
    this.zoomLabel = this.byId('zoom-label');
    this.overlayEl = this.byId('overlay');

    this.hintBtn.addEventListener('click', () => this.hintHandler());
    this.byId('btn-settings').addEventListener('click', () => this.settingsHandler());
    this.byId('btn-eye').addEventListener('click', () => this.levelSelectHandler());

    // 明暗模式切换
    const themeBtn = this.byId('btn-theme');
    const applyTheme = (dark: boolean) => {
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      themeBtn.textContent = dark ? '☀️' : '🌙';
    };
    // 加载保存的偏好
    const savedDark = localStorage.getItem('arrow-theme') === 'dark';
    applyTheme(savedDark);
    themeBtn.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const next = !isDark;
      applyTheme(next);
      try { localStorage.setItem('arrow-theme', next ? 'dark' : 'light'); } catch {}
    });

    // zoom slider
    this.zoomSlider.addEventListener('input', () => {
      const z = Number(this.zoomSlider.value) / 100;
      this.setZoom(z);
      this.zoomHandler(z);
    });
    this.byId('btn-zoom-in').addEventListener('click', () => {
      this.setZoom(Math.min(3, this.zoom + 0.2));
      this.zoomHandler(this.zoom);
    });
    this.byId('btn-zoom-out').addEventListener('click', () => {
      this.setZoom(Math.max(1, this.zoom - 0.2));
      this.zoomHandler(this.zoom);
    });

    // guide toggle
    this.guideBtn.addEventListener('click', () => {
      this.guideVisible = !this.guideVisible;
      this.guideBtn.classList.toggle('active', this.guideVisible);
      this.guideGroup.style.display = this.guideVisible ? '' : 'none';
      this.guideHandler();
    });

    // mouse wheel zoom
    this.boardEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      this.setZoom(Math.max(1, Math.min(3, this.zoom + delta)));
      this.zoomHandler(this.zoom);
    }, { passive: false });

    // mouse pan
    this.boardEl.addEventListener('mousedown', (e) => {
      if (this.zoom <= 1) return;
      this.isPanning = true;
      this.panStartX = e.clientX;
      this.panStartY = e.clientY;
      this.panStartPanX = this.panX;
      this.panStartPanY = this.panY;
      this.boardEl.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      this.panX = this.panStartPanX + (e.clientX - this.panStartX);
      this.panY = this.panStartPanY + (e.clientY - this.panStartY);
      this.clampPan();
      this.applyTransform();
    });
    window.addEventListener('mouseup', () => {
      this.isPanning = false;
      this.boardEl.style.cursor = '';
    });

    // touch pan & pinch-zoom
    let lastTouchDist = 0;
    this.boardEl.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1 && this.zoom > 1) {
        this.isPanning = true;
        this.panStartX = e.touches[0].clientX;
        this.panStartY = e.touches[0].clientY;
        this.panStartPanX = this.panX;
        this.panStartPanY = this.panY;
      } else if (e.touches.length === 2) {
        lastTouchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    }, { passive: true });
    this.boardEl.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && this.isPanning) {
        this.panX = this.panStartPanX + (e.touches[0].clientX - this.panStartX);
        this.panY = this.panStartPanY + (e.touches[0].clientY - this.panStartY);
        this.clampPan();
        this.applyTransform();
        e.preventDefault();
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (lastTouchDist > 0) {
          const scale = dist / lastTouchDist;
          this.setZoom(Math.max(1, Math.min(3, this.zoom * scale)));
          this.zoomHandler(this.zoom);
        }
        lastTouchDist = dist;
        e.preventDefault();
      }
    }, { passive: false });
    this.boardEl.addEventListener('touchend', () => {
      this.isPanning = false;
      lastTouchDist = 0;
    }, { passive: true });
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

  /** 设置缩放并刷新 UI */
  private setZoom(z: number): void {
    this.zoom = Math.round(z * 10) / 10;
    this.clampPan();
    this.applyTransform();
    this.zoomSlider.value = String(Math.round(this.zoom * 100));
    this.zoomLabel.textContent = `${Math.round(this.zoom * 100)}%`;
  }

  /** 限制平移不超出可视区域 */
  private clampPan(): void {
    const bw = this.boardEl.clientWidth;
    const bh = this.boardEl.clientHeight;
    const sw = Number(this.svg.getAttribute('width')) * this.zoom;
    const sh = Number(this.svg.getAttribute('height')) * this.zoom;
    const maxPX = Math.max(0, (sw - bw) / 2);
    const maxPY = Math.max(0, (sh - bh) / 2);
    this.panX = Math.max(-maxPX, Math.min(maxPX, this.panX));
    this.panY = Math.max(-maxPY, Math.min(maxPY, this.panY));
  }

  /** 应用缩放+平移变换 */
  private applyTransform(): void {
    this.boardInner.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  /** 重置缩放和平移 */
  private resetZoom(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.applyTransform();
    this.zoomSlider.value = '100';
    this.zoomLabel.textContent = '100%';
  }

  /** 绘制网格线 */
  private drawGridLines(): void {
    this.gridLinesGroup.innerHTML = '';
    const w = this.cols * this.cellSize;
    const h = this.rows * this.cellSize;
    // vertical lines
    for (let c = 0; c <= this.cols; c++) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(c * this.cellSize));
      line.setAttribute('y1', '0');
      line.setAttribute('x2', String(c * this.cellSize));
      line.setAttribute('y2', String(h));
      this.gridLinesGroup.appendChild(line);
    }
    // horizontal lines
    for (let r = 0; r <= this.rows; r++) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('y1', String(r * this.cellSize));
      line.setAttribute('x2', String(w));
      line.setAttribute('y2', String(r * this.cellSize));
      this.gridLinesGroup.appendChild(line);
    }
  }

  /** 绘制辅助线：从每个未消除棋子头部向飞出方向画虚线箭头 */
  drawGuideLines(state: GameState): void {
    this.guideGroup.innerHTML = '';
    for (const piece of state.pieces.values()) {
      if (piece.removed) continue;
      const head = headCell(piece);
      const hc = this.center(head.row, head.col);
      const { dr, dc } = DELTA[piece.dir];
      // 射线终点：沿 dir 到边界
      let endRow = head.row;
      let endCol = head.col;
      while (true) {
        const nr = endRow + dr;
        const nc = endCol + dc;
        if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) break;
        endRow = nr;
        endCol = nc;
      }
      const ec = this.center(endRow, endCol);
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(hc.x));
      line.setAttribute('y1', String(hc.y));
      line.setAttribute('x2', String(ec.x));
      line.setAttribute('y2', String(ec.y));
      line.setAttribute('stroke', '#2ecc71');
      line.setAttribute('stroke-width', String(Math.max(1.5, this.cellSize * 0.06)));
      line.setAttribute('stroke-dasharray', `${this.cellSize * 0.15} ${this.cellSize * 0.1}`);
      line.setAttribute('opacity', '0.55');
      line.setAttribute('stroke-linecap', 'round');
      this.guideGroup.appendChild(line);

      // 箭头小三角
      const triSize = Math.max(3, this.cellSize * 0.18);
      const ang = this.dirAngle(piece.dir);
      const rad = (ang * Math.PI) / 180;
      const tipX = ec.x + Math.cos(rad) * triSize * 1.2;
      const tipY = ec.y + Math.sin(rad) * triSize * 1.2;
      const lx = ec.x + Math.cos(rad + 2.4) * triSize;
      const ly = ec.y + Math.sin(rad + 2.4) * triSize;
      const rx = ec.x + Math.cos(rad - 2.4) * triSize;
      const ry = ec.y + Math.sin(rad - 2.4) * triSize;
      const tri = document.createElementNS(SVG_NS, 'path');
      tri.setAttribute('d', `M ${tipX} ${tipY} L ${lx} ${ly} L ${rx} ${ry} Z`);
      tri.setAttribute('fill', '#2ecc71');
      tri.setAttribute('opacity', '0.55');
      this.guideGroup.appendChild(tri);
    }
    this.guideGroup.style.display = this.guideVisible ? '' : 'none';
  }

  /** 构建棋盘 SVG */
  mountGrid(state: GameState): void {
    this.rows = state.rows;
    this.cols = state.cols;
    this.pieceEls.clear();
    this.hideOverlay();
    this.resetZoom();

    // 计算单元格尺寸以适配视口
    const maxBoardWidth = Math.min(window.innerWidth - 24, 460);
    const maxBoardHeight = window.innerHeight - 260;
    const sizeByW = Math.floor(maxBoardWidth / state.cols);
    const sizeByH = Math.floor(maxBoardHeight / state.rows);
    this.cellSize = Math.max(18, Math.min(sizeByW, sizeByH, 52));

    const w = this.cellSize * state.cols;
    const h = this.cellSize * state.rows;
    this.svg.setAttribute('width', String(w));
    this.svg.setAttribute('height', String(h));
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.svg.innerHTML = '';

    // 创建分层 group
    this.gridLinesGroup = document.createElementNS(SVG_NS, 'g');
    this.gridLinesGroup.setAttribute('class', 'grid-lines-layer');
    this.svg.appendChild(this.gridLinesGroup);

    this.piecesGroup = document.createElementNS(SVG_NS, 'g');
    this.piecesGroup.setAttribute('class', 'pieces-layer');
    this.svg.appendChild(this.piecesGroup);

    this.guideGroup = document.createElementNS(SVG_NS, 'g');
    this.guideGroup.setAttribute('class', 'guide-layer');
    this.svg.appendChild(this.guideGroup);

    // 绘制网格线
    this.drawGridLines();

    // 绘制棋子
    for (const piece of state.pieces.values()) {
      const g = this.buildPieceEl(piece);
      this.piecesGroup.appendChild(g);
      this.pieceEls.set(piece.id, g);
    }

    // 绘制辅助线
    this.drawGuideLines(state);

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

  /** 扫描头部前方空格数（到障碍物或边界的距离） */
  private scanDistance(state: GameState, piece: Piece): number {
    const head = headCell(piece);
    const { dr, dc } = DELTA[piece.dir];
    let r = head.row + dr;
    let c = head.col + dc;
    let count = 0;
    while (r >= 0 && r < state.rows && c >= 0 && c < state.cols) {
      if (state.grid[r][c] !== null) break;
      count++;
      r += dr;
      c += dc;
    }
    return count;
  }

  /** 失败弹射动画：沿路径飞到障碍物前，再沿同路径弹回 */
  playFail(piece: Piece, state: GameState, onDone: () => void): void {
    const g = this.pieceEls.get(piece.id);
    if (!g) { onDone(); return; }

    const dist = this.scanDistance(state, piece);

    // 前方无空间，原地变红闪烁
    if (dist === 0) {
      g.classList.add('failed');
      window.setTimeout(() => { g.classList.remove('failed'); onDone(); }, 700);
      return;
    }

    const line = g.querySelector<SVGPathElement>('.piece-line')!;
    const tri = g.querySelector<SVGPathElement>('.piece-head')!;
    const hit = g.querySelector<SVGPathElement>('.piece-hit');
    if (hit) hit.remove();
    g.classList.add('flying');
    g.style.color = 'var(--fail-red)';

    // 保存原始路径，动画结束时恢复
    const origD = line.getAttribute('d')!;

    // 沿飞出方向延伸路径（到边界）
    const pts = this.points(piece);
    const headPt = pts[pts.length - 1];
    const { dr, dc } = DELTA[piece.dir];
    const headCellPos = headCell(piece);
    const edgeSteps =
      piece.dir === 'up' ? headCellPos.row + 1 :
      piece.dir === 'down' ? this.rows - headCellPos.row :
      piece.dir === 'left' ? headCellPos.col + 1 :
      this.cols - headCellPos.col;
    const extLen = (edgeSteps + 1) * this.cellSize;
    const extHead = { x: headPt.x + dc * extLen, y: headPt.y + dr * extLen };

    let dPath = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) dPath += ` L ${pts[i].x} ${pts[i].y}`;
    dPath += ` L ${extHead.x} ${extHead.y}`;
    line.setAttribute('d', dPath);

    if (typeof line.getTotalLength !== 'function') {
      g.style.transition = 'opacity 200ms';
      g.style.opacity = '0.5';
      window.setTimeout(() => {
        g.style.opacity = '1';
        g.style.transition = '';
        g.classList.remove('flying');
        g.style.color = '';
        onDone();
      }, 400);
      return;
    }

    const pathLen = line.getTotalLength();
    const bodyLen = pathLen - extLen;
    const gap = pathLen + bodyLen + 10;
    line.style.strokeDasharray = `${bodyLen} ${gap}`;

    // 实际弹射距离：不超过路径可用长度
    const maxPx = Math.min(dist * this.cellSize, extLen - this.cellSize * 0.5);
    const duration = 800;
    const start = performance.now();

    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      let d: number;

      if (t < 0.42) {
        // 前半段：easeOut 飞出
        const p = t / 0.42;
        d = maxPx * (1 - (1 - p) * (1 - p));
      } else if (t < 0.55) {
        // 碰壁停顿 + 微抖
        d = maxPx;
        const shake = Math.sin((t - 0.42) * 60) * 1.5;
        tri.setAttribute('transform',
          `translate(${headPt.x + dc * maxPx + (dc === 0 ? shake : 0)} ${headPt.y + dr * maxPx + (dr === 0 ? shake : 0)}) rotate(${this.dirAngle(piece.dir)})`
        );
        line.style.strokeDashoffset = `${-(maxPx + shake * 0.3)}`;
        requestAnimationFrame(frame);
        return;
      } else {
        // 后半段：easeIn 弹回
        const p = (t - 0.55) / 0.45;
        d = maxPx * (1 - p * p);
      }

      line.style.strokeDashoffset = `${-d}`;

      // 箭头跟随路径位置，始终保持原始朝向
      const headPos = Math.min(d + bodyLen, pathLen);
      const pt = line.getPointAtLength(headPos);
      const aheadPt = line.getPointAtLength(Math.min(headPos + 1, pathLen));
      const ang = (Math.atan2(aheadPt.y - pt.y, aheadPt.x - pt.x) * 180) / Math.PI;
      tri.setAttribute('transform', `translate(${pt.x} ${pt.y}) rotate(${ang})`);

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        // 恢复原始路径
        line.setAttribute('d', origD);
        line.style.strokeDasharray = '';
        line.style.strokeDashoffset = '';
        g.classList.remove('flying');
        g.style.color = '';
        onDone();
      }
    };
    requestAnimationFrame(frame);
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

  /** 关卡选择：列出所有关卡 */
  showLevelSelect(totalLevels: number, _unlockedIndex: number): void {
    const items: string[] = [];
    for (let i = 0; i < totalLevels; i++) {
      items.push(
        `<button class="level-cell" data-action="goto:${i}">${i + 1}</button>`
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
