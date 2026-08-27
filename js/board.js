/**
 * Interactive Star Battle Board Renderer & Input Controller
 * Clean, distraction-free rendering with touch drag gestures & smooth animations
 */

import { CellState } from './solver.js';

export class BoardRenderer {
  /**
   * @param {HTMLElement} containerElement
   * @param {Object} options
   */
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = {
      onCellChange: options.onCellChange || (() => {}),
      onCellHover: options.onCellHover || (() => {}),
      ...options,
    };

    this.size = 6;
    this.stars = 1;
    this.regions = [];
    this.grid = [];
    this.solution = null;
    this.activeTool = 'auto'; // 'auto' | 'star' | 'cross' | 'erase'

    this.cellElements = [];

    this.isDragging = false;
    this.dragTool = null;
    this.dragVisited = new Set();
    this.hoverCell = null;

    this.hintCells = [];
    this.conflictCells = [];

    // Distinct, pleasant region palette
    this.regionColors = [
      'rgba(59, 130, 246, 0.22)',   // blue
      'rgba(16, 185, 129, 0.22)',   // emerald
      'rgba(245, 158, 11, 0.22)',   // amber
      'rgba(139, 92, 246, 0.22)',   // purple
      'rgba(236, 72, 153, 0.22)',   // pink
      'rgba(20, 184, 166, 0.22)',   // teal
      'rgba(249, 115, 22, 0.22)',   // orange
      'rgba(99, 102, 241, 0.22)',   // indigo
      'rgba(168, 85, 247, 0.22)',   // violet
      'rgba(234, 179, 8, 0.22)',    // yellow
      'rgba(6, 182, 212, 0.22)',    // cyan
      'rgba(244, 63, 94, 0.22)',    // rose
      'rgba(132, 204, 22, 0.22)',   // lime
      'rgba(120, 113, 108, 0.22)',  // stone
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

  /**
   * Set new puzzle board
   */
  setBoard(size, stars, regions, grid = null, solution = null) {
    this.size = size;
    this.stars = stars;
    this.regions = regions;
    this.solution = solution;
    this.grid = grid || Array.from({ length: size }, () => new Array(size).fill(CellState.EMPTY));
    this.hintCells = [];
    this.conflictCells = [];

    this.render();
  }

  setActiveTool(tool) {
    this.activeTool = tool;
  }

  setConflicts(conflicts) {
    this.conflictCells = conflicts || [];
    this.updateCellStyles();
  }

  setHints(hintList) {
    this.hintCells = hintList || [];
    this.updateCellStyles();
  }

  clearHighlights() {
    this.hintCells = [];
    this.conflictCells = [];
    this.updateCellStyles();
  }

  updateCounters() {
    // Intentionally empty for clean UI layout
  }

  /**
   * Clean Full DOM Render without cluttered numbers
   */
  render() {
    this.container.innerHTML = '';
    const size = this.size;

    const boardWrapper = document.createElement('div');
    boardWrapper.className = 'star-board-wrapper';

    // Pure Grid element (takes 100% of the board wrapper)
    const gridEl = document.createElement('div');
    gridEl.className = 'star-grid';
    gridEl.style.setProperty('--grid-size', size);

    this.cellElements = Array.from({ length: size }, () => new Array(size));

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cellEl = document.createElement('div');
        cellEl.className = 'star-cell';
        cellEl.dataset.row = r;
        cellEl.dataset.col = c;
        cellEl.dataset.region = this.regions[r][c];

        // Apply region thick borders
        this.applyRegionBorders(cellEl, r, c);

        // Apply region background color
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

  /**
   * Determine thick borders based on region borders
   */
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
   * Bind touch and pointer events to cell
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

      if (this.activeTool === 'auto') {
        const cur = this.grid[r][c];
        if (cur === CellState.EMPTY) {
          this.applyChange(r, c, CellState.STAR);
        } else if (cur === CellState.STAR) {
          this.applyChange(r, c, CellState.CROSS);
          this.dragTool = 'cross';
        } else {
          this.applyChange(r, c, CellState.EMPTY);
          this.dragTool = 'erase';
        }
      } else if (this.activeTool === 'star') {
        const target = this.grid[r][c] === CellState.STAR ? CellState.EMPTY : CellState.STAR;
        this.applyChange(r, c, target);
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

      if (this.isDragging) {
        const key = `${r},${c}`;
        if (!this.dragVisited.has(key)) {
          this.dragVisited.add(key);
          if (this.dragTool === 'cross') {
            if (this.grid[r][c] !== CellState.STAR) {
              this.applyChange(r, c, CellState.CROSS);
            }
          } else if (this.dragTool === 'erase') {
            this.applyChange(r, c, CellState.EMPTY);
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
    const el = this.cellElements[r][c];
    if (!el) return;

    const state = this.grid[r][c];
    el.innerHTML = '';
    el.classList.remove('has-star', 'has-cross', 'is-conflict', 'is-hint-target');

    if (state === CellState.STAR) {
      el.classList.add('has-star');
      el.innerHTML = `
        <svg class="star-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      `;
    } else if (state === CellState.CROSS) {
      el.classList.add('has-cross');
      el.innerHTML = `<span class="cross-icon">✕</span>`;
    }

    const isConflict = this.conflictCells.some(p => p.r === r && p.c === c);
    if (isConflict) {
      el.classList.add('is-conflict');
    }

    const hint = this.hintCells.find(p => p.r === r && p.c === c);
    if (hint) {
      el.classList.add('is-hint-target');
      if (hint.action === 'star') el.classList.add('hint-star');
      if (hint.action === 'cross') el.classList.add('hint-cross');
    }
  }

  updateAllCellContents() {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        this.updateCell(r, c);
      }
    }
  }

  updateCellStyles() {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const el = this.cellElements[r][c];
        if (!el) continue;
        el.classList.remove('is-conflict', 'is-hint-target', 'hint-star', 'hint-cross');

        const isConflict = this.conflictCells.some(p => p.r === r && p.c === c);
        if (isConflict) {
          el.classList.add('is-conflict');
        }

        const hint = this.hintCells.find(p => p.r === r && p.c === c);
        if (hint) {
          el.classList.add('is-hint-target');
          if (hint.action === 'star') el.classList.add('hint-star');
          if (hint.action === 'cross') el.classList.add('hint-cross');
        }
      }
    }
  }

  highlightHoverUnits(r, c) {
    const curRegion = this.regions[r][c];
    for (let row = 0; row < this.size; row++) {
      for (let col = 0; col < this.size; col++) {
        const el = this.cellElements[row][col];
        if (!el) continue;
        el.classList.remove('hover-row', 'hover-col', 'hover-region');
        if (row === r && col === c) {
          // target
        } else if (this.regions[row][col] === curRegion) {
          el.classList.add('hover-region');
        } else if (row === r) {
          el.classList.add('hover-row');
        } else if (col === c) {
          el.classList.add('hover-col');
        }
      }
    }
  }

  clearHoverHighlight() {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const el = this.cellElements[r][c];
        if (el) {
          el.classList.remove('hover-row', 'hover-col', 'hover-region');
        }
      }
    }
  }
}
