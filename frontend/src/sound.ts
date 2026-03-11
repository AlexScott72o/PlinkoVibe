/**
 * Simple sound effects using Web Audio API (no external files) plus a streamed
 * background music track. Music and SFX mute state are stored separately in
 * localStorage. Multiple sounds can play at once; each call creates independent
 * nodes so they don't interrupt each other.
 */

const STORAGE_MUSIC = 'plinko_music_muted';
const STORAGE_SFX = 'plinko_sfx_muted';
const STORAGE_BGM_VOLUME = 'plinko_bgm_volume';

let ctx: AudioContext | null = null;

/** Keep references to active oscillators so they aren't GC'd before they finish playing. */
const activeOscillators = new Set<OscillatorNode>();

/** Singleton HTMLAudio element for the background music track. */
let bgmAudio: HTMLAudioElement | null = null;

/** Reference SFX volume (e.g. win sound). BGM max = 50% of this. */
const SFX_REF_VOLUME = 0.2;
/** Max BGM volume = 50% of SFX reference. */
const BGM_MAX_VOLUME = 0.5 * SFX_REF_VOLUME;

function getBgmAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (bgmAudio) return bgmAudio;
  try {
    const audio = new Audio('/audio/lucky-loop-arcade.mp3');
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = getBgmVolume() * BGM_MAX_VOLUME;
    bgmAudio = audio;
    return bgmAudio;
  } catch {
    return null;
  }
}

function getContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return ctx;
}

function getStored(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/** One-time migration: if old single mute was set, apply to both and clear it. */
function migrateMutedOnce(): void {
  if (typeof window === 'undefined') return;
  try {
    const old = localStorage.getItem('plinko_muted');
    if (old !== '1') return;
    if (localStorage.getItem(STORAGE_MUSIC) != null || localStorage.getItem(STORAGE_SFX) != null) return;
    localStorage.setItem(STORAGE_MUSIC, '1');
    localStorage.setItem(STORAGE_SFX, '1');
    localStorage.removeItem('plinko_muted');
  } catch {
    // ignore
  }
}

function setStored(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // ignore
  }
}

/** BGM volume slider 0–1. 0 = silent, 1 = 50% of SFX volume. Default 0.5 = 25% of SFX. */
export function getBgmVolume(): number {
  if (typeof window === 'undefined') return 0.5;
  try {
    const v = localStorage.getItem(STORAGE_BGM_VOLUME);
    if (v == null) return 0.5;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  } catch {
    // ignore
  }
  return 0.5;
}

export function setBgmVolume(sliderValue: number): void {
  const v = Math.max(0, Math.min(1, sliderValue));
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_BGM_VOLUME, String(v));
  } catch {
    // ignore
  }
  const bgm = bgmAudio;
  if (bgm) bgm.volume = v * BGM_MAX_VOLUME;
}

export function isMusicMuted(): boolean {
  migrateMutedOnce();
  return getStored(STORAGE_MUSIC);
}

export function setMusicMuted(muted: boolean): void {
  setStored(STORAGE_MUSIC, muted);
  if (muted) {
    const bgm = bgmAudio;
    if (bgm) {
      bgm.muted = true;
      bgm.pause();
    }
  } else {
    const bgm = getBgmAudio();
    if (bgm) {
      bgm.muted = false;
      void bgm.play().catch(() => {});
    }
  }
}

export function isSfxMuted(): boolean {
  migrateMutedOnce();
  return getStored(STORAGE_SFX);
}

export function setSfxMuted(muted: boolean): void {
  setStored(STORAGE_SFX, muted);
}

/** True when both music and SFX are muted (backward compat). */
export function isMuted(): boolean {
  return isMusicMuted() && isSfxMuted();
}

/** Set both music and SFX mute (backward compat). */
export function setMuted(muted: boolean): void {
  setMusicMuted(muted);
  setSfxMuted(muted);
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.15
): void {
  if (isSfxMuted()) return;
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
  activeOscillators.add(osc);
  osc.onended = () => activeOscillators.delete(osc);
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

/** Start or resume looping background music. Safe to call multiple times. */
export function startBackgroundMusic(): void {
  if (isMusicMuted()) return;
  const bgm = getBgmAudio();
  if (!bgm) return;
  bgm.muted = isMusicMuted();
  if (!bgm.paused) return;
  void bgm.play().catch(() => {});
}

let userGestureFallbackRegistered = false;

/**
 * Try to start BGM when the game is ready. If the browser blocks autoplay,
 * starts on first user interaction (click/tap/key). Call once when the game has loaded.
 */
export function tryAutoplayBackgroundMusic(): void {
  if (isMusicMuted()) return;
  startBackgroundMusic();
  if (userGestureFallbackRegistered) return;
  userGestureFallbackRegistered = true;
  const run = () => {
    startBackgroundMusic();
    document.removeEventListener('click', run);
    document.removeEventListener('keydown', run);
    document.removeEventListener('touchstart', run);
  };
  document.addEventListener('click', run, { once: true });
  document.addEventListener('keydown', run, { once: true });
  document.addEventListener('touchstart', run, { once: true });
}

/** Pause background music without changing the persisted mute flag. */
export function pauseBackgroundMusic(): void {
  const bgm = bgmAudio;
  if (!bgm) return;
  if (!bgm.paused) {
    bgm.pause();
  }
}
