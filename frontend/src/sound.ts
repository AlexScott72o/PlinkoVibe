/**
 * Simple sound effects using Web Audio API (no external files).
 * Peg bounce, landing, and win tiers. Mute state stored in localStorage.
 */

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return ctx;
}

export function setMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('plinko_muted', muted ? '1' : '0');
  } catch {
    // ignore
  }
}

export function isMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem('plinko_muted') === '1';
  } catch {
    return false;
  }
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.15
): void {
  if (isMuted()) return;
  const ac = getContext();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.frequency.value = frequency;
  osc.type = type;
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + duration);
}

export function playPegBounce(): void {
  playTone(800, 0.04, 'sine', 0.08);
}

export function playLanding(): void {
  playTone(200, 0.1, 'sine', 0.12);
}

export function playWin(winAmount: number, betAmount: number): void {
  const mult = betAmount > 0 ? winAmount / betAmount : 0;
  if (mult < 1) return;
  const volume = 0.2;
  if (mult >= 5) {
    playTone(523, 0.15, 'sine', volume);
    setTimeout(() => playTone(659, 0.15, 'sine', volume), 120);
    setTimeout(() => playTone(784, 0.2, 'sine', volume), 240);
  } else if (mult >= 1.5) {
    playTone(523, 0.12, 'sine', volume);
    setTimeout(() => playTone(659, 0.15, 'sine', volume), 100);
  } else {
    playTone(523, 0.1, 'sine', volume * 0.8);
  }
}
