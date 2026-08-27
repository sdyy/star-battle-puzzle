/**
 * Star Battle Main Game Controller
 * Orchestrates solver, generator, renderer, audio, timer, history, settings, and UI
 */

import { StarBattleSolver, CellState } from './solver.js';
import { StarBattleGenerator } from './generator.js';
import { DIFFICULTY_CONFIG, getDailySeed } from './puzzles.js';
import { BoardRenderer } from './board.js';
import { SoundManager } from './audio.js';

export class StarBattleGame {
  constructor() {
    this.sound = new SoundManager();
    this.board = null;
    this.solver = null;

    // Game state
    this.difficulty = localStorage.getItem('sb_difficulty') || 'easy';
    this.isDaily = false;
    this.dailySeedInfo = null;

    this.size = 6;
    this.stars = 1;
    this.regions = [];
    this.solution = null;
    this.grid = [];

    // History stack for Undo / Redo
    this.history = [];
    this.redoStack = [];

    // Timer state
    this.startTime = null;
    this.elapsedSeconds = 0;
    this.timerInterval = null;
    this.isTimerRunning = false;
    this.isPaused = false;
    this.movesCount = 0;
    this.hintsUsed = 0;
    this.isGameOver = false;

    // Player settings
    this.settings = {
      autoCrossAdj: localStorage.getItem('sb_opt_autocross_adj') !== 'false',
      autoCrossComplete: localStorage.getItem('sb_opt_autocross_comp') === 'true',
      showConflicts: localStorage.getItem('sb_opt_conflicts') !== 'false',
      theme: localStorage.getItem('sb_theme') || 'theme-dark',
      sound: localStorage.getItem('star_battle_muted') !== 'true',
      haptics: localStorage.getItem('star_battle_haptics') !== 'false',
    };

    this.selectedCellCoord = { r: 0, c: 0 };

    this.initDOM();
    this.initTheme();
    this.initEvents();
    this.loadGame();
  }

  initDOM() {
    this.boardContainer = document.getElementById('board-container');
    this.timerEl = document.getElementById('timer-display');
    this.difficultySelect = document.getElementById('difficulty-select');
    this.hintBanner = document.getElementById('hint-banner');
    this.hintTitleEl = document.getElementById('hint-title');
    this.hintMessageEl = document.getElementById('hint-message');
    this.hintActionBtn = document.getElementById('hint-action-btn');
    this.hintCloseBtn = document.getElementById('hint-close-btn');

    this.undoBtn = document.getElementById('btn-undo');
    this.redoBtn = document.getElementById('btn-redo');
    this.pauseBtn = document.getElementById('btn-pause');
    this.restartBtn = document.getElementById('btn-restart');
    this.newGameBtn = document.getElementById('btn-new-game');
    this.hintBtn = document.getElementById('btn-hint');
    this.checkBtn = document.getElementById('btn-check');

    // Modals
    this.winModal = document.getElementById('win-modal');
    this.rulesModal = document.getElementById('rules-modal');
    this.settingsModal = document.getElementById('settings-modal');
    this.statsModal = document.getElementById('stats-modal');
    this.pauseOverlay = document.getElementById('pause-overlay');

    // Stats elements in Win Modal
    this.winTimeEl = document.getElementById('win-time');
    this.winBestTimeEl = document.getElementById('win-best-time');
    this.winMovesEl = document.getElementById('win-moves');
    this.winHintsEl = document.getElementById('win-hints');

    // Tool selector buttons
    this.toolButtons = document.querySelectorAll('.tool-btn');

    // Instantiate board renderer
    this.board = new BoardRenderer(this.boardContainer, {
      onCellChange: (change) => this.handleCellChange(change),
    });
  }

  initTheme() {
    document.body.className = this.settings.theme;
  }

  setTheme(themeName) {
    this.settings.theme = themeName;
    document.body.className = themeName;
    localStorage.setItem('sb_theme', themeName);
  }

  initEvents() {
    // Difficulty change
    if (this.difficultySelect) {
      this.difficultySelect.value = this.difficulty;
      this.difficultySelect.addEventListener('change', (e) => {
        this.difficulty = e.target.value;
        this.isDaily = this.difficulty === 'daily';
        localStorage.setItem('sb_difficulty', this.difficulty);
        this.startNewGame();
      });
    }

    // Tool buttons (Auto / Star / Cross / Erase)
    this.toolButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        this.toolButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.board.setActiveTool(tool);
        this.sound.vibrate(10);
      });
    });

    // Control buttons
    if (this.undoBtn) this.undoBtn.addEventListener('click', () => this.undo());
    if (this.redoBtn) this.redoBtn.addEventListener('click', () => this.redo());
    if (this.pauseBtn) this.pauseBtn.addEventListener('click', () => this.togglePause());
    if (this.restartBtn) this.restartBtn.addEventListener('click', () => this.restartGame());
    if (this.newGameBtn) this.newGameBtn.addEventListener('click', () => this.startNewGame());
    if (this.hintBtn) this.hintBtn.addEventListener('click', () => this.requestHint());
    if (this.checkBtn) this.checkBtn.addEventListener('click', () => this.checkBoard());

    // Hint banner buttons
    if (this.hintCloseBtn) {
      this.hintCloseBtn.addEventListener('click', () => {
        this.hintBanner.classList.remove('show');
        this.board.clearHighlights();
      });
    }

    // Modal close buttons
    document.querySelectorAll('.modal-close-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal');
        if (modal) modal.classList.remove('show');
      });
    });

    // Win Modal Play Again / Share
    const winPlayAgainBtn = document.getElementById('win-play-again-btn');
    if (winPlayAgainBtn) {
      winPlayAgainBtn.addEventListener('click', () => {
        this.winModal.classList.remove('show');
        this.startNewGame();
      });
    }

    const winShareBtn = document.getElementById('win-share-btn');
    if (winShareBtn) {
      winShareBtn.addEventListener('click', () => this.shareResult());
    }

    // Top Bar modal openers
    const btnOpenRules = document.getElementById('btn-open-rules');
    if (btnOpenRules) btnOpenRules.addEventListener('click', () => this.rulesModal.classList.add('show'));

    const btnOpenSettings = document.getElementById('btn-open-settings');
    if (btnOpenSettings) {
      btnOpenSettings.addEventListener('click', () => {
        this.updateSettingsUI();
        this.settingsModal.classList.add('show');
      });
    }

    const btnOpenStats = document.getElementById('btn-open-stats');
    if (btnOpenStats) {
      btnOpenStats.addEventListener('click', () => {
        this.renderStatsModal();
        this.statsModal.classList.add('show');
      });
    }

    // Resume from pause overlay
    const resumeBtn = document.getElementById('btn-resume');
    if (resumeBtn) resumeBtn.addEventListener('click', () => this.togglePause());

    // Settings checkboxes & theme selector
    this.bindSettingsEvents();

    // Keyboard navigation and shortcuts
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  bindSettingsEvents() {
    const optAutoAdj = document.getElementById('opt-auto-cross-adj');
    if (optAutoAdj) {
      optAutoAdj.checked = this.settings.autoCrossAdj;
      optAutoAdj.addEventListener('change', (e) => {
        this.settings.autoCrossAdj = e.target.checked;
        localStorage.setItem('sb_opt_autocross_adj', e.target.checked);
      });
    }

    const optAutoComp = document.getElementById('opt-auto-cross-comp');
    if (optAutoComp) {
      optAutoComp.checked = this.settings.autoCrossComplete;
      optAutoComp.addEventListener('change', (e) => {
        this.settings.autoCrossComplete = e.target.checked;
        localStorage.setItem('sb_opt_autocross_comp', e.target.checked);
      });
    }

    const optConflicts = document.getElementById('opt-show-conflicts');
    if (optConflicts) {
      optConflicts.checked = this.settings.showConflicts;
      optConflicts.addEventListener('change', (e) => {
        this.settings.showConflicts = e.target.checked;
        localStorage.setItem('sb_opt_conflicts', e.target.checked);
        this.updateBoardConflicts();
      });
    }

    const optSound = document.getElementById('opt-sound');
    if (optSound) {
      optSound.checked = this.settings.sound;
      optSound.addEventListener('change', (e) => {
        this.settings.sound = e.target.checked;
        this.sound.setMuted(!e.target.checked);
      });
    }

    const optHaptics = document.getElementById('opt-haptics');
    if (optHaptics) {
      optHaptics.checked = this.settings.haptics;
      optHaptics.addEventListener('change', (e) => {
        this.settings.haptics = e.target.checked;
        this.sound.setHaptics(e.target.checked);
      });
    }

    const themeRadios = document.querySelectorAll('input[name="theme-select"]');
    themeRadios.forEach((radio) => {
      if (radio.value === this.settings.theme) radio.checked = true;
      radio.addEventListener('change', (e) => {
        this.setTheme(e.target.value);
      });
    });
  }

  updateSettingsUI() {
    const optAutoAdj = document.getElementById('opt-auto-cross-adj');
    if (optAutoAdj) optAutoAdj.checked = this.settings.autoCrossAdj;

    const optAutoComp = document.getElementById('opt-auto-cross-comp');
    if (optAutoComp) optAutoComp.checked = this.settings.autoCrossComplete;

    const optConflicts = document.getElementById('opt-show-conflicts');
    if (optConflicts) optConflicts.checked = this.settings.showConflicts;

    const optSound = document.getElementById('opt-sound');
    if (optSound) optSound.checked = this.settings.sound;

    const optHaptics = document.getElementById('opt-haptics');
    if (optHaptics) optHaptics.checked = this.settings.haptics;

    const themeRadio = document.querySelector(`input[name="theme-select"][value="${this.settings.theme}"]`);
    if (themeRadio) themeRadio.checked = true;
  }

  /**
   * Keyboard shortcuts
   */
  handleKeyDown(e) {
    // If typing in input or modal open, skip
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (this.winModal.classList.contains('show') || this.rulesModal.classList.contains('show') || this.settingsModal.classList.contains('show') || this.statsModal.classList.contains('show')) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show'));
      }
      return;
    }

    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }

    if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.redo();
      return;
    }

    if (e.key === 'h' || e.key === 'H') {
      this.requestHint();
      return;
    }

    if (e.key === 'p' || e.key === 'P') {
      this.togglePause();
      return;
    }

    // Grid arrow keys navigation
    const { r, c } = this.selectedCellCoord;
    if (e.key === 'ArrowUp' && r > 0) this.selectCell(r - 1, c);
    else if (e.key === 'ArrowDown' && r < this.size - 1) this.selectCell(r + 1, c);
    else if (e.key === 'ArrowLeft' && c > 0) this.selectCell(r, c - 1);
    else if (e.key === 'ArrowRight' && c < this.size - 1) this.selectCell(r, c + 1);
    else if (e.key === ' ' || e.key === 's' || e.key === 'S') {
      // Toggle Star
      e.preventDefault();
      const target = this.grid[r][c] === CellState.STAR ? CellState.EMPTY : CellState.STAR;
      this.board.applyChange(r, c, target);
    } else if (e.key === 'x' || e.key === 'X' || e.key === 'd' || e.key === 'D') {
      // Toggle Cross
      e.preventDefault();
      const target = this.grid[r][c] === CellState.CROSS ? CellState.EMPTY : CellState.CROSS;
      this.board.applyChange(r, c, target);
    } else if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'e' || e.key === 'E') {
      // Erase
      e.preventDefault();
      this.board.applyChange(r, c, CellState.EMPTY);
    }
  }

  selectCell(r, c) {
    this.selectedCellCoord = { r, c };
    this.board.highlightHoverUnits(r, c);
  }

  /**
   * Start New Game / Reset Board
   */
  startNewGame() {
    this.stopTimer();
    this.elapsedSeconds = 0;
    this.movesCount = 0;
    this.hintsUsed = 0;
    this.isGameOver = false;
    this.history = [];
    this.redoStack = [];
    this.updateUndoRedoUI();
    this.updateTimerDisplay();
    this.hintBanner.classList.remove('show');

    const config = DIFFICULTY_CONFIG[this.difficulty] || DIFFICULTY_CONFIG.easy;
    this.size = config.size;
    this.stars = config.stars;

    let seed = null;
    if (this.isDaily) {
      this.dailySeedInfo = getDailySeed();
      seed = this.dailySeedInfo.seed;
      const subtitle = document.getElementById('daily-badge');
      if (subtitle) subtitle.textContent = `📅 每日挑戰 (${this.dailySeedInfo.dateString})`;
    } else {
      const subtitle = document.getElementById('daily-badge');
      if (subtitle) subtitle.textContent = '';
    }

    // Generate puzzle
    const puzzle = StarBattleGenerator.generate(this.size, this.stars, seed);
    this.regions = puzzle.regions;
    this.solution = puzzle.solution;
    this.grid = Array.from({ length: this.size }, () => new Array(this.size).fill(CellState.EMPTY));

    this.solver = new StarBattleSolver(this.size, this.stars, this.regions);
    this.board.setBoard(this.size, this.stars, this.regions, this.grid, this.solution);

    this.saveGameState();
  }

  restartGame() {
    if (confirm('確定要重新開始這道題目嗎？目前的作答進度將會被重設。')) {
      this.stopTimer();
      this.elapsedSeconds = 0;
      this.movesCount = 0;
      this.hintsUsed = 0;
      this.isGameOver = false;
      this.history = [];
      this.redoStack = [];
      this.updateUndoRedoUI();
      this.updateTimerDisplay();
      this.hintBanner.classList.remove('show');

      this.grid = Array.from({ length: this.size }, () => new Array(this.size).fill(CellState.EMPTY));
      this.board.setBoard(this.size, this.stars, this.regions, this.grid, this.solution);
      this.saveGameState();
    }
  }

  loadGame() {
    const saved = localStorage.getItem('sb_active_game');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data && data.size && data.regions && data.grid && !data.isGameOver) {
          this.difficulty = data.difficulty || 'easy';
          this.isDaily = data.isDaily || false;
          this.size = data.size;
          this.stars = data.stars;
          this.regions = data.regions;
          this.solution = data.solution;
          this.grid = data.grid;
          this.elapsedSeconds = data.elapsedSeconds || 0;
          this.movesCount = data.movesCount || 0;
          this.hintsUsed = data.hintsUsed || 0;

          if (this.difficultySelect) this.difficultySelect.value = this.difficulty;
          this.solver = new StarBattleSolver(this.size, this.stars, this.regions);
          this.board.setBoard(this.size, this.stars, this.regions, this.grid, this.solution);
          this.updateTimerDisplay();
          this.updateUndoRedoUI();
          this.updateBoardConflicts();
          return;
        }
      } catch (e) {
        console.error('Failed to restore saved game:', e);
      }
    }

    this.startNewGame();
  }

  saveGameState() {
    const data = {
      difficulty: this.difficulty,
      isDaily: this.isDaily,
      size: this.size,
      stars: this.stars,
      regions: this.regions,
      solution: this.solution,
      grid: this.grid,
      elapsedSeconds: this.elapsedSeconds,
      movesCount: this.movesCount,
      hintsUsed: this.hintsUsed,
      isGameOver: this.isGameOver,
    };
    localStorage.setItem('sb_active_game', JSON.stringify(data));
  }

  /**
   * Handle user action on cell
   */
  handleCellChange({ r, c, oldState, newState }) {
    if (this.isGameOver) return;

    // Start timer on first move
    if (!this.isTimerRunning && !this.isPaused) {
      this.startTimer();
    }

    this.movesCount++;

    // Play corresponding sound
    if (newState === CellState.STAR) {
      this.sound.playStar();
    } else if (newState === CellState.CROSS) {
      this.sound.playCross();
    } else {
      this.sound.playErase();
    }

    // Add to history
    this.history.push({ r, c, oldState, newState, autoChanges: [] });
    this.redoStack = [];
    this.updateUndoRedoUI();

    // Auto-assist helpers
    if (newState === CellState.STAR && this.settings.autoCrossAdj) {
      this.autoCrossAdjacent(r, c);
    }

    if (this.settings.autoCrossComplete) {
      this.autoCrossCompletedUnits();
    }

    // Conflict detection
    this.updateBoardConflicts();

    // Check victory
    this.checkWinCondition();

    this.saveGameState();
  }

  autoCrossAdjacent(r, c) {
    const adj = this.solver.getAdjacent(r, c);
    const autoList = [];
    adj.forEach(({ r: nr, c: nc }) => {
      if (this.grid[nr][nc] === CellState.EMPTY) {
        this.grid[nr][nc] = CellState.CROSS;
        this.board.updateCell(nr, nc);
        autoList.push({ r: nr, c: nc, oldState: CellState.EMPTY, newState: CellState.CROSS });
      }
    });

    if (autoList.length > 0 && this.history.length > 0) {
      this.history[this.history.length - 1].autoChanges.push(...autoList);
    }
  }

  autoCrossCompletedUnits() {
    const val = this.solver.validate(this.grid);
    const autoList = [];

    // Rows
    for (let r = 0; r < this.size; r++) {
      if (val.rowStarCounts[r] === this.stars) {
        for (let c = 0; c < this.size; c++) {
          if (this.grid[r][c] === CellState.EMPTY) {
            this.grid[r][c] = CellState.CROSS;
            this.board.updateCell(r, c);
            autoList.push({ r, c, oldState: CellState.EMPTY, newState: CellState.CROSS });
          }
        }
      }
    }

    // Cols
    for (let c = 0; c < this.size; c++) {
      if (val.colStarCounts[c] === this.stars) {
        for (let r = 0; r < this.size; r++) {
          if (this.grid[r][c] === CellState.EMPTY) {
            this.grid[r][c] = CellState.CROSS;
            this.board.updateCell(r, c);
            autoList.push({ r, c, oldState: CellState.EMPTY, newState: CellState.CROSS });
          }
        }
      }
    }

    // Regions
    for (let reg = 0; reg < this.size; reg++) {
      if (val.regStarCounts[reg] === this.stars) {
        for (const { r, c } of this.solver.regionCells[reg]) {
          if (this.grid[r][c] === CellState.EMPTY) {
            this.grid[r][c] = CellState.CROSS;
            this.board.updateCell(r, c);
            autoList.push({ r, c, oldState: CellState.EMPTY, newState: CellState.CROSS });
          }
        }
      }
    }

    if (autoList.length > 0 && this.history.length > 0) {
      this.history[this.history.length - 1].autoChanges.push(...autoList);
    }
  }

  updateBoardConflicts() {
    if (!this.settings.showConflicts) {
      this.board.setConflicts([]);
      return;
    }
    const val = this.solver.validate(this.grid);
    this.board.setConflicts(val.conflictStars);
  }

  undo() {
    if (this.history.length === 0 || this.isGameOver) return;
    const step = this.history.pop();

    // Revert auto changes first
    if (step.autoChanges && step.autoChanges.length > 0) {
      for (let i = step.autoChanges.length - 1; i >= 0; i--) {
        const a = step.autoChanges[i];
        this.grid[a.r][a.c] = a.oldState;
        this.board.updateCell(a.r, a.c);
      }
    }

    // Revert primary cell
    this.grid[step.r][step.c] = step.oldState;
    this.board.updateCell(step.r, step.c);
    this.board.updateCounters();

    this.redoStack.push(step);
    this.updateUndoRedoUI();
    this.updateBoardConflicts();
    this.sound.playErase();
    this.saveGameState();
  }

  redo() {
    if (this.redoStack.length === 0 || this.isGameOver) return;
    const step = this.redoStack.pop();

    this.grid[step.r][step.c] = step.newState;
    this.board.updateCell(step.r, step.c);

    if (step.autoChanges && step.autoChanges.length > 0) {
      for (const a of step.autoChanges) {
        this.grid[a.r][a.c] = a.newState;
        this.board.updateCell(a.r, a.c);
      }
    }

    this.board.updateCounters();
    this.history.push(step);
    this.updateUndoRedoUI();
    this.updateBoardConflicts();
    this.sound.playStar();
    this.saveGameState();
  }

  updateUndoRedoUI() {
    if (this.undoBtn) this.undoBtn.disabled = this.history.length === 0;
    if (this.redoBtn) this.redoBtn.disabled = this.redoStack.length === 0;
  }

  /**
   * Request smart hint
   */
  requestHint() {
    if (this.isGameOver) return;

    this.hintsUsed++;
    this.sound.playHint();

    const hint = this.solver.getHint(this.grid, this.solution);
    if (!hint) {
      this.showHintBanner('提示', '目前棋盤非常完美，暫無直接矛盾或強迫落星點，請繼續探索！', []);
      return;
    }

    this.board.setHints(hint.cells);
    this.showHintBanner(hint.title, hint.message, hint.cells);
  }

  showHintBanner(title, message, cells) {
    this.hintTitleEl.textContent = title;
    this.hintMessageEl.textContent = message;
    this.hintBanner.classList.add('show');

    if (cells && cells.length > 0 && (cells[0].action === 'star' || cells[0].action === 'cross')) {
      this.hintActionBtn.style.display = 'inline-block';
      this.hintActionBtn.textContent = '自動套用此步驟';
      this.hintActionBtn.onclick = () => {
        cells.forEach(({ r, c, action }) => {
          if (action === 'star') this.board.applyChange(r, c, CellState.STAR);
          else if (action === 'cross') this.board.applyChange(r, c, CellState.CROSS);
        });
        this.hintBanner.classList.remove('show');
        this.board.clearHighlights();
      };
    } else {
      this.hintActionBtn.style.display = 'none';
    }
  }

  checkBoard() {
    const val = this.solver.validate(this.grid);
    if (val.isWon) {
      this.triggerWin();
      return;
    }

    if (val.conflictStars.length > 0) {
      this.sound.playError();
      this.showHintBanner(
        '檢測結果：發現衝突',
        `棋盤上有 ${val.conflictStars.length} 顆星星產生衝突或相鄰，已為您用紅框標記。`,
        val.conflictStars.map((p) => ({ ...p, action: 'conflict' }))
      );
      this.board.setConflicts(val.conflictStars);
    } else {
      this.sound.playHint();
      let starCount = 0;
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          if (this.grid[r][c] === CellState.STAR) starCount++;
        }
      }
      const totalStars = this.size * this.stars;
      this.showHintBanner(
        '檢測結果：正常無衝突',
        `目前已放置 ${starCount} / ${totalStars} 顆星星，所有規則均無衝突，請繼續加油！`,
        []
      );
    }
  }

  /**
   * Victory detection
   */
  checkWinCondition() {
    const val = this.solver.validate(this.grid);
    if (val.isWon) {
      this.triggerWin();
    }
  }

  triggerWin() {
    this.isGameOver = true;
    this.stopTimer();
    this.sound.playWin();
    this.triggerConfetti();

    // Record stats
    const record = this.recordWinStats();

    // Fill win modal
    this.winTimeEl.textContent = this.formatTime(this.elapsedSeconds);
    this.winBestTimeEl.textContent = record.bestTime ? this.formatTime(record.bestTime) : this.formatTime(this.elapsedSeconds);
    this.winMovesEl.textContent = this.movesCount;
    this.winHintsEl.textContent = this.hintsUsed;

    setTimeout(() => {
      this.winModal.classList.add('show');
    }, 600);

    localStorage.removeItem('sb_active_game');
  }

  recordWinStats() {
    const statsKey = 'sb_player_stats';
    let stats = {};
    try {
      stats = JSON.parse(localStorage.getItem(statsKey)) || {};
    } catch (_) {
      stats = {};
    }

    const diff = this.difficulty;
    if (!stats[diff]) {
      stats[diff] = { wins: 0, bestTime: null, totalTime: 0 };
    }

    stats[diff].wins += 1;
    stats[diff].totalTime += this.elapsedSeconds;
    if (!stats[diff].bestTime || this.elapsedSeconds < stats[diff].bestTime) {
      stats[diff].bestTime = this.elapsedSeconds;
    }

    localStorage.setItem(statsKey, JSON.stringify(stats));
    return stats[diff];
  }

  renderStatsModal() {
    const statsKey = 'sb_player_stats';
    let stats = {};
    try {
      stats = JSON.parse(localStorage.getItem(statsKey)) || {};
    } catch (_) {
      stats = {};
    }

    const listEl = document.getElementById('stats-list');
    if (!listEl) return;

    listEl.innerHTML = '';
    const diffs = ['easy', 'medium', 'hard', 'expert', 'master'];

    diffs.forEach((d) => {
      const cfg = DIFFICULTY_CONFIG[d];
      const s = stats[d] || { wins: 0, bestTime: null };
      const card = document.createElement('div');
      card.className = 'stats-card';
      card.innerHTML = `
        <div class="stats-card-header">
          <span class="stats-icon">${cfg.icon}</span>
          <span class="stats-name">${cfg.name} (${cfg.size}x${cfg.size})</span>
        </div>
        <div class="stats-card-body">
          <div>通關次數：<strong>${s.wins}</strong> 次</div>
          <div>最佳紀錄：<strong>${s.bestTime ? this.formatTime(s.bestTime) : '--:--'}</strong></div>
        </div>
      `;
      listEl.appendChild(card);
    });
  }

  shareResult() {
    const diffName = DIFFICULTY_CONFIG[this.difficulty]?.name || this.difficulty;
    const timeStr = this.formatTime(this.elapsedSeconds);
    let text = `⭐ Star Battle Puzzle (${diffName}) 通關！\n`;
    text += `⏱️ 耗時：${timeStr} | 步數：${this.movesCount} | 提示：${this.hintsUsed}\n`;
    text += `\n一起來挑戰：https://sdyy.github.io/star-battle-puzzle/`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        alert('成績已複製到剪貼簿！可直接貼給好友！');
      });
    } else {
      prompt('請複製以下成績：', text);
    }
  }

  /**
   * Confetti celebration animation
   */
  triggerConfetti() {
    const canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6', '#eab308'];
    const particles = [];

    for (let i = 0; i < 120; i++) {
      particles.push({
        x: canvas.width * 0.5,
        y: canvas.height * 0.5,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.7) * 16,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
        gravity: 0.35,
        alpha: 1,
      });
    }

    let start = performance.now();
    const frame = (now) => {
      const elapsed = (now - start) / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.rot += p.rotSpeed;
        p.alpha = Math.max(0, 1 - elapsed / 2.5);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });

      if (elapsed < 2.5) {
        requestAnimationFrame(frame);
      } else {
        canvas.remove();
      }
    };

    requestAnimationFrame(frame);
  }

  /**
   * Timer management
   */
  startTimer() {
    if (this.isTimerRunning) return;
    this.isTimerRunning = true;
    this.startTime = Date.now() - this.elapsedSeconds * 1000;
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
      this.updateTimerDisplay();
    }, 1000);
  }

  stopTimer() {
    this.isTimerRunning = false;
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  togglePause() {
    if (this.isGameOver) return;
    if (this.isPaused) {
      this.isPaused = false;
      this.pauseOverlay.classList.remove('show');
      if (this.pauseBtn) this.pauseBtn.innerHTML = '⏸️ 暫停';
      this.startTimer();
    } else {
      this.isPaused = true;
      this.stopTimer();
      this.pauseOverlay.classList.add('show');
      if (this.pauseBtn) this.pauseBtn.innerHTML = '▶️ 繼續';
    }
  }

  updateTimerDisplay() {
    if (this.timerEl) {
      this.timerEl.textContent = this.formatTime(this.elapsedSeconds);
    }
  }

  formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
}

// Bootstrap on DOM loaded
window.addEventListener('DOMContentLoaded', () => {
  window.game = new StarBattleGame();
});
