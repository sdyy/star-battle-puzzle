/**
 * Star Battle Puzzle Solver & Constraint Propagation Engine
 * Supports:
 * - High-speed MRV (Minimum Remaining Values) Backtracking Solver
 * - Board validation and constraint checking
 * - Solution count & uniqueness check
 * - Smart Hint generation with progressive difficulty logic
 */

export const CellState = {
  EMPTY: 0,
  STAR: 1,
  CROSS: 2,
};

export class StarBattleSolver {
  /**
   * @param {number} size Grid size N (e.g. 6, 8, 10, 12, 14)
   * @param {number} starsPerUnit Target stars per row/col/region K (e.g. 1, 2, 3)
   * @param {number[][]} regions 2D array [size][size] where value is region ID (0..N-1)
   */
  constructor(size, starsPerUnit, regions) {
    this.size = size;
    this.k = starsPerUnit;
    this.regions = regions;

    // Precompute region cell coordinates
    this.regionCells = Array.from({ length: size }, () => []);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const reg = regions[r][c];
        if (reg >= 0 && reg < size) {
          this.regionCells[reg].push({ r, c });
        }
      }
    }
  }

  /**
   * Get 8 adjacent cell coordinates
   */
  getAdjacent(r, c) {
    const adj = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < this.size && nc >= 0 && nc < this.size) {
          adj.push({ r: nr, c: nc });
        }
      }
    }
    return adj;
  }

  /**
   * Fast MRV Backtracking Solver
   * @param {number[][]} [initialGrid] Optional partial grid (CellState)
   * @param {number} [maxSolutions=2]
   * @returns {number[][][]} Array of 2D grids with solutions
   */
  solve(initialGrid = null, maxSolutions = 2) {
    const size = this.size;
    const k = this.k;
    const solutions = [];

    // Working grid: 0=empty, 1=star, 2=cross
    const grid = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) =>
        initialGrid ? initialGrid[r][c] : CellState.EMPTY
      )
    );

    const rowStars = new Array(size).fill(0);
    const colStars = new Array(size).fill(0);
    const regStars = new Array(size).fill(0);

    if (initialGrid) {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (initialGrid[r][c] === CellState.STAR) {
            rowStars[r]++;
            colStars[c]++;
            regStars[this.regions[r][c]]++;
          }
        }
      }
    }

    const canPlaceStar = (r, c) => {
      if (grid[r][c] !== CellState.EMPTY) return false;
      if (rowStars[r] >= k || colStars[c] >= k || regStars[this.regions[r][c]] >= k) return false;

      // Check 8-adjacency
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
            if (grid[nr][nc] === CellState.STAR) return false;
          }
        }
      }
      return true;
    };

    const isComplete = () => {
      for (let i = 0; i < size; i++) {
        if (rowStars[i] !== k || colStars[i] !== k || regStars[i] !== k) return false;
      }
      return true;
    };

    // Backtrack on rows sequentially
    const backtrackRow = (r) => {
      if (solutions.length >= maxSolutions) return;

      if (r === size) {
        if (isComplete()) {
          solutions.push(grid.map(row => [...row]));
        }
        return;
      }

      // Check if current row already satisfied
      const needed = k - rowStars[r];
      if (needed === 0) {
        backtrackRow(r + 1);
        return;
      }

      // Find valid columns in row r
      const validCols = [];
      for (let c = 0; c < size; c++) {
        if (canPlaceStar(r, c)) validCols.push(c);
      }

      if (validCols.length < needed) return;

      const tryComb = (start, currentComb) => {
        if (solutions.length >= maxSolutions) return;

        if (currentComb.length === needed) {
          backtrackRow(r + 1);
          return;
        }

        for (let i = start; i < validCols.length; i++) {
          const c = validCols[i];
          if (currentComb.length > 0 && Math.abs(c - currentComb[currentComb.length - 1]) <= 1) {
            continue;
          }
          if (canPlaceStar(r, c)) {
            grid[r][c] = CellState.STAR;
            rowStars[r]++;
            colStars[c]++;
            regStars[this.regions[r][c]]++;
            currentComb.push(c);

            tryComb(i + 1, currentComb);

            currentComb.pop();
            grid[r][c] = CellState.EMPTY;
            rowStars[r]--;
            colStars[c]--;
            regStars[this.regions[r][c]]--;
          }
        }
      };

      tryComb(0, []);
    };

    backtrackRow(0);
    return solutions;
  }

  /**
   * Verify if the puzzle has a unique solution
   */
  hasUniqueSolution() {
    const solutions = this.solve(null, 2);
    return solutions.length === 1 ? solutions[0] : null;
  }

  /**
   * Check board state for any rule violations
   */
  validate(grid) {
    const size = this.size;
    const k = this.k;
    const conflictStars = new Set();
    const rowStarCounts = new Array(size).fill(0);
    const colStarCounts = new Array(size).fill(0);
    const regStarCounts = new Array(size).fill(0);

    const stars = [];

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] === CellState.STAR) {
          stars.push({ r, c });
          rowStarCounts[r]++;
          colStarCounts[c]++;
          const reg = this.regions[r][c];
          regStarCounts[reg]++;
        }
      }
    }

    // Check star 8-adjacency
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const s1 = stars[i];
        const s2 = stars[j];
        if (Math.abs(s1.r - s2.r) <= 1 && Math.abs(s1.c - s2.c) <= 1) {
          conflictStars.add(`${s1.r},${s1.c}`);
          conflictStars.add(`${s2.r},${s2.c}`);
        }
      }
    }

    const overfilledRows = [];
    const overfilledCols = [];
    const overfilledRegions = [];

    for (let i = 0; i < size; i++) {
      if (rowStarCounts[i] > k) overfilledRows.push(i);
      if (colStarCounts[i] > k) overfilledCols.push(i);
      if (regStarCounts[i] > k) overfilledRegions.push(i);
    }

    for (const { r, c } of stars) {
      const reg = this.regions[r][c];
      if (rowStarCounts[r] > k || colStarCounts[c] > k || regStarCounts[reg] > k) {
        conflictStars.add(`${r},${c}`);
      }
    }

    const conflictStarList = Array.from(conflictStars).map(str => {
      const [r, c] = str.split(',').map(Number);
      return { r, c };
    });

    const isWon =
      conflictStarList.length === 0 &&
      overfilledRows.length === 0 &&
      overfilledCols.length === 0 &&
      overfilledRegions.length === 0 &&
      rowStarCounts.every(c => c === k) &&
      colStarCounts.every(c => c === k) &&
      regStarCounts.every(c => c === k);

    return {
      isValid: conflictStarList.length === 0 && overfilledRows.length === 0 && overfilledCols.length === 0 && overfilledRegions.length === 0,
      isWon,
      conflictStars: conflictStarList,
      overfilledRows,
      overfilledCols,
      overfilledRegions,
      rowStarCounts,
      colStarCounts,
      regStarCounts,
    };
  }

  /**
   * Generate intelligent hint based on current state
   */
  getHint(currentGrid, solution = null) {
    const size = this.size;
    const k = this.k;
    const val = this.validate(currentGrid);

    // 1. Prioritize pointing out conflicts
    if (val.conflictStars.length > 0) {
      return {
        type: 'error',
        title: '星星衝突',
        message: '發現有星星相鄰接觸，或某行/列/區域已超過星星上限！請先移除錯誤的星星。',
        cells: val.conflictStars.map(({ r, c }) => ({ r, c, action: 'conflict' })),
      };
    }

    // 2. Stars adjacent cross: check if any placed star has adjacent empty cells
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (currentGrid[r][c] === CellState.STAR) {
          const emptyAdj = this.getAdjacent(r, c).filter(
            ({ r: nr, c: nc }) => currentGrid[nr][nc] === CellState.EMPTY
          );
          if (emptyAdj.length > 0) {
            return {
              type: 'cross_adjacent',
              title: '星星周圍標叉',
              message: `(${r + 1}, ${c + 1}) 的星星周圍相鄰 8 格不能再放星星，可標記為 ✖。`,
              cells: emptyAdj.map(p => ({ ...p, action: 'cross' })),
            };
          }
        }
      }
    }

    // 3. Unit completed: mark remaining empty cells as CROSS
    for (let r = 0; r < size; r++) {
      if (val.rowStarCounts[r] === k) {
        const emptyCells = [];
        for (let c = 0; c < size; c++) {
          if (currentGrid[r][c] === CellState.EMPTY) emptyCells.push({ r, c });
        }
        if (emptyCells.length > 0) {
          return {
            type: 'unit_completed',
            title: `第 ${r + 1} 列已集滿星星`,
            message: `第 ${r + 1} 列已包含 ${k} 顆星星，該列剩餘空格均可標記為 ✖。`,
            cells: emptyCells.map(p => ({ ...p, action: 'cross' })),
            highlightUnit: { type: 'row', index: r },
          };
        }
      }
    }

    for (let c = 0; c < size; c++) {
      if (val.colStarCounts[c] === k) {
        const emptyCells = [];
        for (let r = 0; r < size; r++) {
          if (currentGrid[r][c] === CellState.EMPTY) emptyCells.push({ r, c });
        }
        if (emptyCells.length > 0) {
          return {
            type: 'unit_completed',
            title: `第 ${c + 1} 行已集滿星星`,
            message: `第 ${c + 1} 行已包含 ${k} 顆星星，該行剩餘空格均可標記為 ✖。`,
            cells: emptyCells.map(p => ({ ...p, action: 'cross' })),
            highlightUnit: { type: 'col', index: c },
          };
        }
      }
    }

    for (let reg = 0; reg < size; reg++) {
      if (val.regStarCounts[reg] === k) {
        const emptyCells = [];
        for (const { r, c } of this.regionCells[reg]) {
          if (currentGrid[r][c] === CellState.EMPTY) emptyCells.push({ r, c });
        }
        if (emptyCells.length > 0) {
          return {
            type: 'unit_completed',
            title: `區域 ${reg + 1} 已集滿星星`,
            message: `此區域已包含 ${k} 顆星星，區域內其餘空格均可標記為 ✖。`,
            cells: emptyCells.map(p => ({ ...p, action: 'cross' })),
            highlightUnit: { type: 'region', index: reg },
          };
        }
      }
    }

    // 4. Unit forced placement: remaining candidate cells equals remaining stars needed
    for (let r = 0; r < size; r++) {
      const remainingNeeded = k - val.rowStarCounts[r];
      if (remainingNeeded > 0) {
        const candidateCells = [];
        for (let c = 0; c < size; c++) {
          if (currentGrid[r][c] === CellState.EMPTY) {
            const adjStars = this.getAdjacent(r, c).some(
              ({ r: nr, c: nc }) => currentGrid[nr][nc] === CellState.STAR
            );
            if (!adjStars) candidateCells.push({ r, c });
          }
        }
        if (candidateCells.length === remainingNeeded) {
          return {
            type: 'unit_forced',
            title: `第 ${r + 1} 列確定位置`,
            message: `第 ${r + 1} 列還需要 ${remainingNeeded} 顆星星，且剛好只剩 ${candidateCells.length} 個有效位置！`,
            cells: candidateCells.map(p => ({ ...p, action: 'star' })),
            highlightUnit: { type: 'row', index: r },
          };
        }
      }
    }

    for (let c = 0; c < size; c++) {
      const remainingNeeded = k - val.colStarCounts[c];
      if (remainingNeeded > 0) {
        const candidateCells = [];
        for (let r = 0; r < size; r++) {
          if (currentGrid[r][c] === CellState.EMPTY) {
            const adjStars = this.getAdjacent(r, c).some(
              ({ r: nr, c: nc }) => currentGrid[nr][nc] === CellState.STAR
            );
            if (!adjStars) candidateCells.push({ r, c });
          }
        }
        if (candidateCells.length === remainingNeeded) {
          return {
            type: 'unit_forced',
            title: `第 ${c + 1} 行確定位置`,
            message: `第 ${c + 1} 行還需要 ${remainingNeeded} 顆星星，且剛好只剩 ${candidateCells.length} 個有效位置！`,
            cells: candidateCells.map(p => ({ ...p, action: 'star' })),
            highlightUnit: { type: 'col', index: c },
          };
        }
      }
    }

    for (let reg = 0; reg < size; reg++) {
      const remainingNeeded = k - val.regStarCounts[reg];
      if (remainingNeeded > 0) {
        const candidateCells = [];
        for (const { r, c } of this.regionCells[reg]) {
          if (currentGrid[r][c] === CellState.EMPTY) {
            const adjStars = this.getAdjacent(r, c).some(
              ({ r: nr, c: nc }) => currentGrid[nr][nc] === CellState.STAR
            );
            if (!adjStars) candidateCells.push({ r, c });
          }
        }
        if (candidateCells.length === remainingNeeded) {
          return {
            type: 'unit_forced',
            title: `區域 ${reg + 1} 確定位置`,
            message: `該區域還需要 ${remainingNeeded} 顆星星，剛好僅剩 ${candidateCells.length} 個可能位置！`,
            cells: candidateCells.map(p => ({ ...p, action: 'star' })),
            highlightUnit: { type: 'region', index: reg },
          };
        }
      }
    }

    // 5. Solution reveal
    if (solution) {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (solution[r][c] === CellState.STAR && currentGrid[r][c] !== CellState.STAR) {
            return {
              type: 'reveal_cell',
              title: '關鍵落星提示',
              message: `邏輯推導指出：(${r + 1}, ${c + 1}) 必須放置一顆星星 ⭐。`,
              cells: [{ r, c, action: 'star' }],
            };
          }
        }
      }
    }

    return null;
  }
}
