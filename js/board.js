/**
 * Star Battle Board Renderer & Gesture Event Controller
 * Renders grid, handles Single Tap (X / Remove), Double Tap (Star ⭐), and Drag Fill/Erase
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
    window.addEventListener('pointerup', () => {
      this.isDragging = false;
      this.dragTool = null;
      this.dragVisited.clear();
    });
    window.addEventListener('pointercancel', () => {
      this.isDragging = false;
      this.dragTool = null;
      this.dragVisited.clear();
    });
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
    this.conflicts.clear();
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
   * - Double Tap (within 320ms): ⭐ Star
   * - Swipe / Drag from Empty: Continuous fill ✖
   * - Swipe / Drag from X: Continuous remove ✖
   */
  bindCellEvents(cellEl, r, c) {
    cellEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.handleRightClick(r, c);
    });

    cellEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (e.button === 2) {
        this.handleRightClick(r, c);
        return;
      }

      this.isDragging = true;
      this.dragVisited.clear();
      this.dragVisited.add(`${r},${c}`);

      const now = Date.now();
      const isDoubleTap = this.lastTap &&
        this.lastTap.r === r &&
        this.lastTap.c === c &&
        (now - this.lastTap.time) < 320;

      if (isDoubleTap) {
        // Double Tap: Toggle Star ⭐
        this.lastTap = null;
        this.dragTool = null;
        const target = this.grid[r][c] === CellState.STAR ? CellState.EMPTY : CellState.STAR;
        this.applyChange(r, c, target);
        return;
      }

      // Record first tap timestamp
      this.lastTap = { r, c, time: now };

      if (this.activeTool === 'auto') {
        const cur = this.grid[r][c];
        if (cur === CellState.EMPTY) {
          this.applyChange(r, c, CellState.CROSS);
          this.dragTool = 'cross';
        } else if (cur === CellState.CROSS) {
          this.applyChange(r, c, CellState.EMPTY);
          this.dragTool = 'erase';
        } else if (cur === CellState.STAR) {
          this.applyChange(r, c, CellState.EMPTY);
          this.dragTool = 'erase';
        }
      } else if (this.activeTool === 'star') {
        const target = this.grid[r][c] === CellState.STAR ? CellState.EMPTY : CellState.STAR;
        this.applyChange(r, c, target);
        this.dragTool = null;
      } else if (this.activeTool === 'cross') {
        const target = this.grid[r][c] === CellState.CROSS ? CellState.EMPTY : CellState.CROSS;
        this.applyChange(r, c, target);
        this.dragTool = target === CellState.CROSS ? 'cross' : 'erase';
      } else if (this.activeTool === 'erase') {
        this.applyChange(r, c, CellState.EMPTY);
        this.dragTool = 'erase';
      }
    });

    cellEl.addEventListener('pointerenter', (e) => {
      this.hoverCell = { r, c };
      this.highlightHoverUnits(r, c);

      if (this.isDragging && this.dragTool) {
        const key = `${r},${c}`;
        if (!this.dragVisited.has(key)) {
          this.dragVisited.add(key);
          this.lastTap = null; // Dragging invalidates previous double tap

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
    });

    cellEl.addEventListener('pointerleave', () => {
      this.clearHoverHighlight();
    });
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
    const cellEl = this.cellElements[r][c];
    if (!cellEl) return;

    const val = this.grid[r][c];
    const isConflict = this.conflicts.has(`${r},${c}`);

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

  setConflicts(conflictSet) {
    this.conflicts = conflictSet;
    this.updateAllCellContents();
  }

  highlightHoverUnits(r, c) {
    const regId = this.regions[r][c];
    for (let row = 0; row < this.size; row++) {
      for (let col = 0; col < this.size; col++) {
        const el = this.cellElements[row][col];
        if (!el) continue;
        el.classList.remove('hover-row', 'hover-col', 'hover-region');
        if (row === r) el.classList.add('hover-row');
        if (col === c) el.classList.add('hover-col');
        if (this.regions[row][col] === regId) el.classList.add('hover-region');
      }
    }
  }

  clearHoverHighlight() {
    for (let row = 0; row < this.size; row++) {
      for (let col = 0; col < this.size; col++) {
        const el = this.cellElements[row][col];
        if (el) el.classList.remove('hover-row', 'hover-col', 'hover-region');
      }
    }
  }

  highlightCells(cells, className = 'is-hint-target') {
    this.clearHighlights(className);
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
    // No-op clean board without outside counters
  }
}
