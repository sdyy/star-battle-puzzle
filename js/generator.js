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

    // Pick verified base puzzle from pack and apply isomorphic symmetry transformations
    return this.generateFromPack(size, stars, rng);
  }

  /**
   * Pick puzzle from packs and apply symmetry transformations (Rotate, Flip, Relabel)
   */
  static generateFromPack(size, stars, rng) {
    let packName = 'medium';
    if (size === 6) packName = 'easy';
    else if (size === 8) packName = 'medium';
    else if (size === 10) packName = stars === 1 ? 'hard_1' : 'hard_2';
    else if (size === 12) packName = stars === 1 ? 'expert_1' : 'expert_2';
    else if (size === 14) packName = 'master';

    const pack = PUZZLE_PACKS[packName] || PUZZLE_PACKS.hard_1 || PUZZLE_PACKS.easy;
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
