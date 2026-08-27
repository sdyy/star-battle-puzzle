/**
 * Procedural Star Battle Puzzle Generator
 * Generates unique-solution puzzles with connected regions
 */

import { StarBattleSolver, CellState } from './solver.js';
import { PUZZLE_PACKS, createPRNG } from './puzzles.js';

export class StarBattleGenerator {
  /**
   * Generate a puzzle for specified size and stars
   * @param {number} size Board size N
   * @param {number} stars Stars per row/col/region K
   * @param {number|null} [seed=null] Optional seed for deterministic generation
   * @returns {{size: number, stars: number, regions: number[][], solution: number[][]}}
   */
  static generate(size, stars, seed = null) {
    const rng = seed !== null ? createPRNG(seed) : Math.random;

    // First attempt procedural generation with limited retries
    const maxProceduralAttempts = 35;
    for (let attempt = 0; attempt < maxProceduralAttempts; attempt++) {
      const candidate = this.tryGenerateProcedural(size, stars, rng);
      if (candidate) {
        const solver = new StarBattleSolver(size, stars, candidate.regions);
        const sol = solver.hasUniqueSolution();
        if (sol) {
          return {
            size,
            stars,
            regions: candidate.regions,
            solution: sol,
          };
        }
      }
    }

    // Fallback: Pick a base puzzle from pack and apply isomorphic transformations
    return this.generateFromPack(size, stars, rng);
  }

  /**
   * Try single procedural generation attempt
   */
  static tryGenerateProcedural(size, stars, rng) {
    // 1. Generate valid star placement
    const starGrid = this.generateValidStars(size, stars, rng);
    if (!starGrid) return null;

    // 2. Grow N connected regions around the stars such that each region has exactly `stars` stars
    const starPositions = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (starGrid[r][c] === CellState.STAR) {
          starPositions.push({ r, c });
        }
      }
    }

    // Group star positions into N groups of `stars` count
    // Shuffle stars
    for (let i = starPositions.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [starPositions[i], starPositions[j]] = [starPositions[j], starPositions[i]];
    }

    // Region seeds: assign region ID (0..size-1) to star groups
    const regions = Array.from({ length: size }, () => new Array(size).fill(-1));
    const regionStars = Array.from({ length: size }, () => []);

    for (let i = 0; i < starPositions.length; i++) {
      const regId = Math.floor(i / stars);
      const pos = starPositions[i];
      regions[pos.r][pos.c] = regId;
      regionStars[regId].push(pos);
    }

    // Grow regions using multi-source BFS / flood fill
    const queues = Array.from({ length: size }, (_, id) => [...regionStars[id]]);
    let unassigned = size * size - starPositions.length;

    const dirs = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];

    let steps = 0;
    while (unassigned > 0 && steps < size * size * 10) {
      steps++;
      // Pick random region to expand
      const regId = Math.floor(rng() * size);
      const queue = queues[regId];
      if (queue.length === 0) {
        // Find existing cells of this region with free neighbors
        const regCells = [];
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            if (regions[r][c] === regId) {
              regCells.push({ r, c });
            }
          }
        }
        if (regCells.length > 0) {
          const randCell = regCells[Math.floor(rng() * regCells.length)];
          queue.push(randCell);
        } else {
          continue;
        }
      }

      const curIdx = Math.floor(rng() * queue.length);
      const cur = queue[curIdx];

      // Try expanding to neighbor
      const neighbors = [];
      for (const [dr, dc] of dirs) {
        const nr = cur.r + dr;
        const nc = cur.c + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size && regions[nr][nc] === -1) {
          neighbors.push({ r: nr, c: nc });
        }
      }

      if (neighbors.length > 0) {
        const chosen = neighbors[Math.floor(rng() * neighbors.length)];
        regions[chosen.r][chosen.c] = regId;
        queue.push(chosen);
        unassigned--;
      } else {
        queue.splice(curIdx, 1);
      }
    }

    // If any cells unassigned, assign to adjacent region
    if (unassigned > 0) {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (regions[r][c] === -1) {
            for (const [dr, dc] of dirs) {
              const nr = r + dr;
              const nc = c + dc;
              if (nr >= 0 && nr < size && nc >= 0 && nc < size && regions[nr][nc] !== -1) {
                regions[r][c] = regions[nr][nc];
                unassigned--;
                break;
              }
            }
          }
        }
      }
    }

    // Verify all cells assigned
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (regions[r][c] === -1) return null;
      }
    }

    return { regions, starGrid };
  }

  /**
   * Generate valid non-touching stars in N x N grid with K stars per row and col
   */
  static generateValidStars(size, stars, rng) {
    const grid = Array.from({ length: size }, () => new Array(size).fill(CellState.EMPTY));
    const colStars = new Array(size).fill(0);

    const canPlace = (r, c) => {
      if (grid[r][c] !== CellState.EMPTY) return false;
      if (colStars[c] >= stars) return false;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
            if (grid[nr][nc] === CellState.STAR) return false;
          }
        }
      }
      return true;
    };

    const backtrack = (r) => {
      if (r === size) return true;

      // Find all valid columns in row r
      const validCols = [];
      for (let c = 0; c < size; c++) {
        if (canPlace(r, c)) validCols.push(c);
      }

      // Shuffle validCols
      for (let i = validCols.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [validCols[i], validCols[j]] = [validCols[j], validCols[i]];
      }

      if (validCols.length < stars) return false;

      // Helper to try combinations of stars in row r
      const tryRowComb = (combStart, currentComb) => {
        if (currentComb.length === stars) {
          // Commit current combination
          for (const c of currentComb) {
            grid[r][c] = CellState.STAR;
            colStars[c]++;
          }
          if (backtrack(r + 1)) return true;
          // Backtrack
          for (const c of currentComb) {
            grid[r][c] = CellState.EMPTY;
            colStars[c]--;
          }
          return false;
        }

        for (let i = combStart; i < validCols.length; i++) {
          const c = validCols[i];
          if (currentComb.length > 0 && Math.abs(c - currentComb[currentComb.length - 1]) <= 1) {
            continue;
          }
          if (canPlace(r, c)) {
            grid[r][c] = CellState.STAR;
            colStars[c]++;
            currentComb.push(c);

            if (tryRowComb(i + 1, currentComb)) return true;

            currentComb.pop();
            grid[r][c] = CellState.EMPTY;
            colStars[c]--;
          }
        }
        return false;
      };

      return tryRowComb(0, []);
    };

    const success = backtrack(0);
    return success ? grid : null;
  }

  /**
   * Pick puzzle from packs and apply symmetry transformations (Rotate, Flip, Relabel)
   */
  static generateFromPack(size, stars, rng) {
    let packName = 'medium';
    if (size === 6) packName = 'easy';
    else if (size === 8) packName = 'medium';
    else if (size === 10) packName = 'hard';
    else if (size === 12) packName = 'expert';
    else if (size === 14) packName = 'master';

    const pack = PUZZLE_PACKS[packName] || PUZZLE_PACKS.medium;
    const basePuzzle = pack[Math.floor(rng() * pack.length)];

    let reg = basePuzzle.regions.map(row => [...row]);
    const pSize = basePuzzle.size;

    // Apply random rotation (0, 90, 180, 270 deg)
    const rotations = Math.floor(rng() * 4);
    for (let rot = 0; rot < rotations; rot++) {
      const newReg = Array.from({ length: pSize }, () => new Array(pSize).fill(0));
      for (let r = 0; r < pSize; r++) {
        for (let c = 0; c < pSize; c++) {
          newReg[c][pSize - 1 - r] = reg[r][c];
        }
      }
      reg = newReg;
    }

    // Apply random horizontal flip
    if (rng() > 0.5) {
      reg = reg.map(row => row.slice().reverse());
    }

    // Apply random vertical flip
    if (rng() > 0.5) {
      reg.reverse();
    }

    // Relabel regions with random permutation
    const perm = Array.from({ length: pSize }, (_, i) => i);
    for (let i = pSize - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }

    const relabeled = reg.map(row => row.map(v => perm[v]));

    const solver = new StarBattleSolver(pSize, basePuzzle.stars, relabeled);
    const sol = solver.hasUniqueSolution();

    return {
      size: pSize,
      stars: basePuzzle.stars,
      regions: relabeled,
      solution: sol || solver.solve(null, 1)[0],
    };
  }
}
