/**
 * Star Battle Board Renderer & Gesture Event Controller
 * Full mobile touch and desktop pointer support:
 * - Single Tap: ✖ / Clear
 * - Double Tap (within 380ms on same cell): ⭐ Star
 * - Swipe / Drag from Empty: Continuous fill ✖ across touch movement
 * - Swipe / Drag from X: Continuous clear ✖ across touch movement
 */

import { CellState } from './solver.js';

export class BoardRenderer {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      onCellChange: () => {},
      onCellHover: () => {},
      ...options,
    };

    this.size = 6;
    this.stars = 1;
    this.regions = [];
    this.grid = [];
    this.solution = null;
    this.cellElements = [];
    this.conflicts = new Set();
    this.activeTool = 'auto'; // 'auto', 'star', 'cross', 'erase'
    this.hoverCell = null;
    this.isDragging = false;
    this.dragTool = null; // 'cross' or 'erase'
    this.dragVisited = new Set();
    this.lastTap = null; // { r, c, time } for double-tap detection
    this.pointerStartCell = null;

    this.regionColors = [
      'rgba(59, 130, 246, 0.22)',   // Blue
      'rgba(16, 185, 129, 0.22)',   // Emerald
      'rgba(245, 158, 11, 0.22)',   // Amber
      'rgba(168, 85, 247, 0.22)',   // Purple
      'rgba(236, 72, 153, 0.22)',   // Pink
      'rgba(14, 165, 233, 0.22)',   // Sky
      'rgba(132, 204, 22, 0.22)',   // Lime
      'rgba(249, 115, 22, 0.22)',   // Orange
      'rgba(99, 102, 241, 0.22)',   // Indigo
      'rgba(20, 184, 166, 0.22)',   // Teal
      'rgba(244, 63, 94, 0.22)',    // Rose
      'rgba(163, 230, 53, 0.22)',   // Light Green
      'rgba(192, 132, 252, 0.22)',  // Violet
      'rgba(251, 191, 36, 0.22)',   // Yellow
    ];

    this.initGlobalEvents();
  }

  initGlobalEvents() {
    const handleMove = (clientX, clientY) => {
      if (!this.isDragging || !this.dragTool) return;
      const target = document.elementFromPoint(clientX, clientY);
      const cellEl = target ? target.closest('.star-cell') : null;
      if (cellEl) {
        const r = parseInt(cellEl.dataset.r, 10);
        const c = parseInt(cellEl.dataset.c, 10);
        if (!isNaN(r) && !isNaN(c)) {
          this.handleCellDrag(r, c);
        }
      }
    };

    window.addEventListener('pointermove', (e) => {
      handleMove(e.clientX, e.clientY);
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    const endDrag = () => {
      this.isDragging = false;
      this.dragTool = null;
      this.dragVisited.clear();
      this.pointerStartCell = null;
    };

    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    window.addEventListener('touchend', endDrag);
    window.addEventListener('touchcancel', endDrag);
  }

  setActiveTool(tool) {
    this.activeTool = tool;
  }

  setBoard(size, stars, regions, grid, solution = null) {
    this.size = size;
    this.stars = stars;
    this.regions = regions;
    this.grid = grid;
    this.solution = solution;
    this.conflicts = new Set();
    this.lastTap = null;
    this.render();
  }

  render() {
    this.container.innerHTML = '';
    const size = this.size;

    const boardWrapper = document.createElement('div');
    boardWrapper.className = 'star-board-wrapper';

    const gridEl = document.createElement('div');
    gridEl.className = 'star-grid';
    gridEl.style.setProperty('--grid-size', size);

    this.cellElements = Array.from({ length: size }, () => new Array(size));

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cellEl = document.createElement('div');
        cellEl.className = 'star-cell';
        cellEl.dataset.r = r;
        cellEl.dataset.c = c;

        this.applyRegionBorders(cellEl, r, c);

        const regId = this.regions[r][c];
        cellEl.style.backgroundColor = this.regionColors[regId % this.regionColors.length];

        this.bindCellEvents(cellEl, r, c);
        gridEl.appendChild(cellEl);
        this.cellElements[r][c] = cellEl;
      }
    }

    boardWrapper.appendChild(gridEl);
    this.container.appendChild(boardWrapper);

    this.updateAllCellContents();
  }

  applyRegionBorders(cellEl, r, c) {
    const size = this.size;
    const curRegion = this.regions[r][c];

    if (r === 0 || this.regions[r - 1][c] !== curRegion) {
      cellEl.classList.add('border-t-region');
    }
    if (r === size - 1 || this.regions[r + 1][c] !== curRegion) {
      cellEl.classList.add('border-b-region');
    }
    if (c === 0 || this.regions[r][c - 1] !== curRegion) {
      cellEl.classList.add('border-l-region');
    }
    if (c === size - 1 || this.regions[r][c + 1] !== curRegion) {
      cellEl.classList.add('border-r-region');
    }
  }

  /**
   * Bind gesture and pointer events to cell:
   * - Single Tap: ✖ / Remove
   * - Double Tap (within 380ms on same cell): ⭐ Star
   * - Swipe / Drag from Empty: Continuous fill ✖
   * - Swipe / Drag from X: Continuous remove ✖
   */
  bindCellEvents(cellEl, r, c) {
    cellEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.handleRightClick(r, c);
    });

    cellEl.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        e.preventDefault();
        this.handleRightClick(r, c);
        return;
      }

      this.isDragging = true;
      this.pointerStartCell = { r, c };
      this.dragVisited.clear();
      this.dragVisited.add(`${r},${c}`);

      const startState = this.grid[r][c];
      this.dragTool = startState === CellState.CROSS ? 'erase' : 'cross';

      const now = Date.now();
      const isDoubleTap = this.lastTap &&
        this.lastTap.r === r &&
        this.lastTap.c === c &&
        (now - this.lastTap.time) < 380;

      if (isDoubleTap) {
        // Double Tap: Toggle Star ⭐
        this.lastTap = null;
        this.dragTool = null; // Do not drag on double tap
        const target = this.grid[r][c] === CellState.STAR ? CellState.EMPTY : CellState.STAR;
        this.applyChange(r, c, target);
        return;
      }

      // Record first tap timestamp
      this.lastTap = { r, c, time: now };

      if (this.activeTool === 'auto') {
        if (startState === CellState.EMPTY) {
          this.applyChange(r, c, CellState.CROSS);
        } else if (startState === CellState.CROSS) {
          this.applyChange(r, c, CellState.EMPTY);
        } else if (startState === CellState.STAR) {
          this.applyChange(r, c, CellState.EMPTY);
        }
      } else if (this.activeTool === 'star') {
        const target = startState === CellState.STAR ? CellState.EMPTY : CellState.STAR;
        this.applyChange(r, c, target);
        this.dragTool = null;
      } else if (this.activeTool === 'cross') {
        const target = startState === CellState.CROSS ? CellState.EMPTY : CellState.CROSS;
        this.applyChange(r, c, target);
        this.dragTool = target === CellState.CROSS ? 'cross' : 'erase';
      } else if (this.activeTool === 'erase') {
        this.applyChange(r, c, CellState.EMPTY);
        this.dragTool = 'erase';
      }
    });

    cellEl.addEventListener('pointerenter', () => {
      this.hoverCell = { r, c };
      this.highlightHoverUnits(r, c);
    });

    cellEl.addEventListener('pointerleave', () => {
      this.clearHoverHighlight();
    });
  }

  handleCellDrag(r, c) {
    const key = `${r},${c}`;
    if (!this.dragVisited.has(key)) {
      this.dragVisited.add(key);

      // Only invalidate double-tap if moving into a different cell
      if (!this.pointerStartCell || this.pointerStartCell.r !== r || this.pointerStartCell.c !== c) {
        this.lastTap = null;
      }

      if (this.dragTool === 'cross') {
        if (this.grid[r][c] === CellState.EMPTY) {
          this.applyChange(r, c, CellState.CROSS);
        }
      } else if (this.dragTool === 'erase') {
        if (this.grid[r][c] === CellState.CROSS) {
          this.applyChange(r, c, CellState.EMPTY);
        }
      }
    }
  }

  handleRightClick(r, c) {
    const cur = this.grid[r][c];
    if (cur === CellState.CROSS) {
      this.applyChange(r, c, CellState.EMPTY);
    } else if (cur === CellState.EMPTY) {
      this.applyChange(r, c, CellState.CROSS);
    }
  }

  applyChange(r, c, newState) {
    const oldState = this.grid[r][c];
    if (oldState === newState) return;

    this.grid[r][c] = newState;
    this.updateCell(r, c);
    this.options.onCellChange({ r, c, oldState, newState, grid: this.grid });
  }

  updateCell(r, c) {
    const cellEl = this.cellElements[r]?.[c];
    if (!cellEl) return;

    const val = this.grid[r][c];
    const isConflict = this.conflicts && (typeof this.conflicts.has === 'function')
      ? this.conflicts.has(`${r},${c}`)
      : false;

    cellEl.innerHTML = '';
    cellEl.classList.toggle('is-conflict', isConflict);

    if (val === CellState.STAR) {
      cellEl.innerHTML = `
        <svg class="star-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 1.5l3.09 6.26L22 8.77l-5 4.87 1.18 6.88L12 17.27l-6.18 3.25L7 13.64 2 8.77l6.91-1.01L12 1.5z"/>
        </svg>
      `;
    } else if (val === CellState.CROSS) {
      cellEl.innerHTML = `<span class="cross-icon">✕</span>`;
    }
  }

  updateAllCellContents() {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        this.updateCell(r, c);
      }
    }
  }

  setConflicts(conflictList) {
    this.conflicts = new Set();
    if (conflictList) {
      if (Array.isArray(conflictList)) {
        for (const item of conflictList) {
          if (typeof item === 'string') {
            this.conflicts.add(item);
          } else if (item && typeof item.r === 'number' && typeof item.c === 'number') {
            this.conflicts.add(`${item.r},${item.c}`);
          }
        }
      } else if (conflictList instanceof Set) {
        this.conflicts = new Set(conflictList);
      }
    }
    this.updateAllCellContents();
  }

  highlightHoverUnits(r, c) {
    const regId = this.regions[r]?.[c];
    for (let row = 0; row < this.size; row++) {
      for (let col = 0; col < this.size; col++) {
        const el = this.cellElements[row]?.[col];
        if (!el) continue;
        el.classList.remove('hover-row', 'hover-col', 'hover-region');
        if (row === r) el.classList.add('hover-row');
        if (col === c) el.classList.add('hover-col');
        if (this.regions[row]?.[col] === regId) el.classList.add('hover-region');
      }
    }
  }

  clearHoverHighlight() {
    for (let row = 0; row < this.size; row++) {
      for (let col = 0; col < this.size; col++) {
        const el = this.cellElements[row]?.[col];
        if (el) el.classList.remove('hover-row', 'hover-col', 'hover-region');
      }
    }
  }

  setHints(cells) {
    this.highlightCells(cells, 'is-hint-target');
  }

  clearHints() {
    this.clearHighlights('is-hint-target');
  }

  highlightCells(cells = [], className = 'is-hint-target') {
    this.clearHighlights(className);
    if (!Array.isArray(cells)) return;
    for (const { r, c } of cells) {
      const el = this.cellElements[r]?.[c];
      if (el) el.classList.add(className);
    }
  }

  clearHighlights(className = 'is-hint-target') {
    for (let row = 0; row < this.size; row++) {
      for (let col = 0; col < this.size; col++) {
        const el = this.cellElements[row]?.[col];
        if (el) el.classList.remove(className);
      }
    }
  }

  updateCounters() {
    // Clean board
  }
}
