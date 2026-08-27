/**
 * Web Audio API Sound Effects & Haptics Engine
 * Synthesizes pure sound waves without external audio files
 */

export class SoundManager {
  constructor() {
    this.audioCtx = null;
    this.muted = localStorage.getItem('star_battle_muted') === 'true';
    this.hapticsEnabled = localStorage.getItem('star_battle_haptics') !== 'false';
  }

  init() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  setMuted(muted) {
    this.muted = muted;
    localStorage.setItem('star_battle_muted', muted ? 'true' : 'false');
  }

  setHaptics(enabled) {
    this.hapticsEnabled = enabled;
    localStorage.setItem('star_battle_haptics', enabled ? 'true' : 'false');
  }

  vibrate(pattern = 15) {
    if (!this.hapticsEnabled || typeof navigator === 'undefined' || !navigator.vibrate) return;
    try {
      navigator.vibrate(pattern);
    } catch (_) {
      // Ignore vibration errors
    }
  }

  /**
   * Star placement: Bright, sparkling chime
   */
  playStar() {
    this.vibrate(25);
    if (this.muted) return;
    this.init();
    if (!this.audioCtx) return;

    const t = this.audioCtx.currentTime;
    const osc1 = this.audioCtx.createOscillator();
    const osc2 = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, t); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, t + 0.12); // A5

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1174.66, t); // D6
    osc2.frequency.exponentialRampToValueAtTime(1760, t + 0.15); // A6

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.25);
    osc2.stop(t + 0.25);
  }

  /**
   * Cross placement: Crisp, soft wooden tick
   */
  playCross() {
    this.vibrate(10);
    if (this.muted) return;
    this.init();
    if (!this.audioCtx) return;

    const t = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.05);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(t);
    osc.stop(t + 0.06);
  }

  /**
   * Erase / Clear cell
   */
  playErase() {
    this.vibrate(8);
    if (this.muted) return;
    this.init();
    if (!this.audioCtx) return;

    const t = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.08);

    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(t);
    osc.stop(t + 0.08);
  }

  /**
   * Conflict / Error alert
   */
  playError() {
    this.vibrate([40, 50, 40]);
    if (this.muted) return;
    this.init();
    if (!this.audioCtx) return;

    const t = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.linearRampToValueAtTime(140, t + 0.18);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(t);
    osc.stop(t + 0.2);
  }

  /**
   * Hint chime
   */
  playHint() {
    this.vibrate(30);
    if (this.muted) return;
    this.init();
    if (!this.audioCtx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, index) => {
      const t = this.audioCtx.currentTime + index * 0.06;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  /**
   * Victory Fanfare: Jubilant ascending arpeggio
   */
  playWin() {
    this.vibrate([80, 60, 80, 60, 150]);
    if (this.muted) return;
    this.init();
    if (!this.audioCtx) return;

    const notes = [
      { f: 523.25, d: 0.12, delay: 0.0 }, // C5
      { f: 659.25, d: 0.12, delay: 0.1 }, // E5
      { f: 783.99, d: 0.12, delay: 0.2 }, // G5
      { f: 1046.5, d: 0.2, delay: 0.3 }, // C6
      { f: 880.0, d: 0.12, delay: 0.45 }, // A5
      { f: 1046.5, d: 0.12, delay: 0.55 }, // C6
      { f: 1318.51, d: 0.45, delay: 0.65 }, // E6
    ];

    notes.forEach(note => {
      const t = this.audioCtx.currentTime + note.delay;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, t);

      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + note.d);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(t);
      osc.stop(t + note.d);
    });
  }
}
