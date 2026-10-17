import { DEFAULT_SETTINGS, type Settings } from './storage';

export type SoundName =
  | 'place' | 'rock' | 'merge' | 'upgrade' | 'shoot' | 'hit' | 'splash' | 'kill'
  | 'leak' | 'waveStart' | 'waveEnd' | 'click' | 'error' | 'win' | 'lose';

/** Attack sounds for `shoot`, named after the kinds of tower that fire them. */
export type ShootVariant = 'arrow' | 'cannon' | 'frost' | 'arcane' | 'poison';

export type Wave = 'square' | 'triangle' | 'sawtooth' | 'sine' | 'noise';

/** One oscillator (or filtered noise burst) with a pitch slide and a pluck envelope. */
export interface Tone {
  wave: Wave;
  /** Start pitch in Hz; for noise, the filter frequency. */
  freq: number;
  /** Pitch reached at the end of the tone; omitted holds `freq`. */
  slide?: number;
  /** Seconds after the sound starts. */
  at?: number;
  /** Seconds. */
  dur: number;
  /** Peak gain, 0–1, before master volume. */
  gain: number;
  /** Noise only: lowpass for thuds, highpass for hiss, bandpass by default. */
  filter?: 'lowpass' | 'highpass' | 'bandpass';
}

export interface Sound {
  tones: readonly Tone[];
  /** Cues the player must hear even when combat fills every voice. */
  important?: boolean;
  /** Random pitch spread (± this fraction), so a volley doesn't sound like one sample on repeat. */
  jitter?: number;
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;
const G4 = 392, FS4 = 369.99, F4 = 349.23;

function notes(wave: Wave, freqs: readonly number[], step: number, dur: number, gain: number, from = 0): Tone[] {
  return freqs.map((freq, i) => ({ wave, freq, at: from + i * step, dur, gain }));
}

export const SHOOT_VARIANTS: Readonly<Record<ShootVariant, Sound>> = {
  arrow: { jitter: 0.06, tones: [{ wave: 'square', freq: 1400, slide: 700, dur: 0.05, gain: 0.12 }] },
  cannon: {
    jitter: 0.05,
    tones: [
      { wave: 'noise', filter: 'lowpass', freq: 1000, slide: 150, dur: 0.16, gain: 0.2 },
      { wave: 'triangle', freq: 160, slide: 55, dur: 0.14, gain: 0.2 },
    ],
  },
  frost: {
    jitter: 0.05,
    tones: [
      { wave: 'noise', filter: 'highpass', freq: 4000, slide: 6000, dur: 0.09, gain: 0.1 },
      { wave: 'triangle', freq: 1600, slide: 2200, dur: 0.07, gain: 0.1 },
    ],
  },
  arcane: {
    jitter: 0.05,
    tones: [
      { wave: 'triangle', freq: 500, slide: 1500, dur: 0.1, gain: 0.18 },
      { wave: 'square', freq: 1000, slide: 3000, at: 0.01, dur: 0.06, gain: 0.06 },
    ],
  },
  poison: {
    jitter: 0.08,
    tones: [
      { wave: 'square', freq: 260, slide: 180, dur: 0.08, gain: 0.12 },
      { wave: 'noise', freq: 900, slide: 500, dur: 0.06, gain: 0.12 },
    ],
  },
};

export const SOUNDS: Readonly<Record<SoundName, Sound>> = {
  place: {
    tones: [
      { wave: 'square', freq: 520, slide: 780, dur: 0.05, gain: 0.14 },
      { wave: 'triangle', freq: 260, dur: 0.08, gain: 0.2 },
    ],
  },
  rock: {
    tones: [
      { wave: 'noise', filter: 'lowpass', freq: 600, slide: 120, dur: 0.14, gain: 0.35 },
      { wave: 'triangle', freq: 120, slide: 60, dur: 0.12, gain: 0.3 },
    ],
  },
  merge: { tones: notes('square', [C5, E5, G5, C6], 0.045, 0.07, 0.18) },
  upgrade: {
    tones: [
      { wave: 'square', freq: 330, slide: 1320, dur: 0.22, gain: 0.16 },
      { wave: 'triangle', freq: 660, slide: 2640, at: 0.02, dur: 0.2, gain: 0.12 },
    ],
  },
  shoot: SHOOT_VARIANTS.arrow,
  hit: { jitter: 0.1, tones: [{ wave: 'noise', freq: 2500, slide: 900, dur: 0.06, gain: 0.2 }] },
  splash: {
    jitter: 0.05,
    tones: [
      { wave: 'noise', filter: 'lowpass', freq: 1800, slide: 250, dur: 0.22, gain: 0.3 },
      { wave: 'triangle', freq: 200, slide: 80, dur: 0.12, gain: 0.2 },
    ],
  },
  kill: {
    jitter: 0.06,
    tones: [
      { wave: 'square', freq: 900, slide: 180, dur: 0.09, gain: 0.15 },
      { wave: 'noise', freq: 3000, slide: 1200, dur: 0.05, gain: 0.12 },
    ],
  },
  leak: {
    important: true,
    tones: [
      { wave: 'square', freq: 220, slide: 110, dur: 0.28, gain: 0.16 },
      { wave: 'square', freq: 233, slide: 116, dur: 0.28, gain: 0.08 },
      { wave: 'triangle', freq: 110, slide: 55, dur: 0.3, gain: 0.25 },
    ],
  },
  waveStart: {
    important: true,
    tones: [
      ...notes('square', [G4, C5, G5], 0.09, 0.1, 0.18),
      { wave: 'triangle', freq: G4 / 2, dur: 0.32, gain: 0.25 },
    ],
  },
  waveEnd: { important: true, tones: notes('triangle', [E5, G5, C6], 0.07, 0.14, 0.3) },
  click: { important: true, tones: [{ wave: 'square', freq: 1200, dur: 0.03, gain: 0.12 }] },
  error: {
    important: true,
    tones: [
      { wave: 'square', freq: 180, dur: 0.08, gain: 0.2 },
      { wave: 'square', freq: 140, at: 0.1, dur: 0.12, gain: 0.2 },
    ],
  },
  win: {
    important: true,
    tones: [
      ...notes('square', [C5, E5, G5], 0.11, 0.14, 0.16),
      { wave: 'square', freq: C6, at: 0.33, dur: 0.55, gain: 0.14 },
      { wave: 'triangle', freq: C5, at: 0.33, dur: 0.6, gain: 0.3 },
    ],
  },
  lose: {
    important: true,
    tones: [
      ...notes('square', [G4, FS4, F4], 0.18, 0.2, 0.16),
      { wave: 'square', freq: 262, slide: 196, at: 0.54, dur: 0.6, gain: 0.16 },
      { wave: 'triangle', freq: 131, slide: 98, at: 0.54, dur: 0.65, gain: 0.3 },
    ],
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];

/** Seconds from a sound's start to the end of its last tone. */
export function soundLength(sound: Sound): number {
  let end = 0;
  for (const tone of sound.tones) end = Math.max(end, (tone.at ?? 0) + tone.dur);
  return end;
}

export interface VoiceLimits {
  /** Sounds playing at once, across all names. */
  maxVoices: number;
  /** Sounds of one name playing at once (all `shoot` variants share a cap). */
  maxPerSound: number;
  /** Seconds within which a repeat of the same sound and variant is dropped. */
  repeatGap: number;
}

export const DEFAULT_LIMITS: Readonly<VoiceLimits> = { maxVoices: 14, maxPerSound: 4, repeatGap: 0.04 };

export interface VoiceLimiter {
  /** Claims a voice for a sound starting at `now` (seconds), or says to drop it. */
  admit(key: string, group: string, now: number, length: number, important: boolean): boolean;
  /** Voices still sounding at `now`. */
  active(now: number): number;
}

/**
 * Keeps 80 towers firing in the same tick from summing into clipping (the
 * compressor alone still peaks above 1.3 in Chrome) and from building 80 node
 * graphs per tick. Important cues skip the voice caps but not the repeat gap.
 */
export function createVoiceLimiter(limits: VoiceLimits = DEFAULT_LIMITS): VoiceLimiter {
  const voices: { group: string; end: number }[] = [];
  const lastStart = new Map<string, number>();

  const prune = (now: number): void => {
    let kept = 0;
    for (const voice of voices) if (voice.end > now) voices[kept++] = voice;
    voices.length = kept;
  };

  return {
    admit(key, group, now, length, important) {
      prune(now);
      const last = lastStart.get(key);
      if (last !== undefined && now - last < limits.repeatGap) return false;
      if (!important) {
        if (voices.length >= limits.maxVoices) return false;
        let same = 0;
        for (const voice of voices) if (voice.group === group) same++;
        if (same >= limits.maxPerSound) return false;
      }
      voices.push({ group, end: now + length });
      lastStart.set(key, now);
      return true;
    },
    active(now) {
      prune(now);
      return voices.length;
    },
  };
}

export interface PlayOptions {
  /** `shoot` only: which attack sound. Defaults to `arrow`. */
  variant?: ShootVariant;
  /** Multiplies this sound's gain, e.g. quieter for a tower off screen. */
  volume?: number;
  /** Multiplies every frequency. */
  pitch?: number;
}

export interface AudioEngineOptions {
  createContext?: () => AudioContext;
  /** For pitch jitter and noise offsets; never feeds the sim. */
  random?: () => number;
  limits?: VoiceLimits;
}

export interface AudioEngine {
  /** True if the sound was scheduled; false when muted, still locked, or throttled. */
  play(name: SoundName, opts?: PlayOptions): boolean;
  /** Creates or resumes the AudioContext. iOS only allows this inside a user gesture. */
  unlock(): void;
  /** Resumes a context that already exists, e.g. on returning to the foreground. */
  resume(): void;
  suspend(): void;
  setSettings(settings: Pick<Settings, 'sound' | 'volume'>): void;
}

/** Starts sounds a few ms ahead, so the attack ramp isn't scheduled in the past. */
const LOOKAHEAD = 0.005;

export function createAudioEngine(options: AudioEngineOptions = {}): AudioEngine {
  const createContext = options.createContext ?? (() => new AudioContext({ latencyHint: 'interactive' }));
  const random = options.random ?? Math.random;
  const limiter = createVoiceLimiter(options.limits);
  let ctx: AudioContext | undefined;
  let master: GainNode | undefined;
  let noise: AudioBuffer | undefined;
  let enabled = DEFAULT_SETTINGS.sound;
  let volume = DEFAULT_SETTINGS.volume;

  // Squared, because loudness is perceived roughly logarithmically: a linear slider would do little in its top half.
  const masterGain = (): number => (enabled ? volume * volume : 0);

  function build(context: AudioContext): void {
    const limiterNode = context.createDynamicsCompressor();
    limiterNode.threshold.value = -10;
    limiterNode.knee.value = 6;
    limiterNode.ratio.value = 12;
    limiterNode.attack.value = 0.002;
    limiterNode.release.value = 0.12;
    limiterNode.connect(context.destination);
    master = context.createGain();
    master.gain.value = masterGain();
    master.connect(limiterNode);

    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = random() * 2 - 1;
    noise = buffer;

    // iOS keeps a freshly resumed context silent until a source starts inside the gesture.
    const blip = context.createBufferSource();
    blip.buffer = context.createBuffer(1, 1, context.sampleRate);
    blip.connect(context.destination);
    blip.start();
  }

  function startTone(context: AudioContext, out: AudioNode, tone: Tone, t0: number, pitch: number, gain: number): void {
    const start = t0 + (tone.at ?? 0);
    const end = start + tone.dur;
    const env = context.createGain();
    // A linear decay, as chip sound does it: an exponential one falls silent within the first third.
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(tone.gain * gain, start + Math.min(0.004, tone.dur / 4));
    env.gain.linearRampToValueAtTime(0, end);
    env.connect(out);

    let source: AudioScheduledSourceNode;
    let freq: AudioParam;
    if (tone.wave === 'noise') {
      const burst = context.createBufferSource();
      burst.buffer = noise ?? null;
      burst.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = tone.filter ?? 'bandpass';
      burst.connect(filter).connect(env);
      // A random offset into the shared noise buffer, so repeats don't sound identical.
      burst.start(start, random());
      source = burst;
      freq = filter.frequency;
    } else {
      const osc = context.createOscillator();
      osc.type = tone.wave;
      osc.connect(env);
      osc.start(start);
      source = osc;
      freq = osc.frequency;
    }
    freq.setValueAtTime(tone.freq * pitch, start);
    if (tone.slide !== undefined) freq.exponentialRampToValueAtTime(tone.slide * pitch, end);
    source.onended = () => env.disconnect();
    source.stop(end + 0.02);
  }

  function resume(): void {
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => undefined);
  }

  return {
    play(name, opts = {}) {
      if (!enabled || volume <= 0 || !ctx || !master || ctx.state !== 'running') return false;
      const variant = name === 'shoot' ? (opts.variant ?? 'arrow') : undefined;
      const sound = variant ? SHOOT_VARIANTS[variant] : SOUNDS[name];
      const t0 = ctx.currentTime + LOOKAHEAD;
      const key = variant ? `${name}:${variant}` : name;
      if (!limiter.admit(key, name, t0, soundLength(sound), sound.important ?? false)) return false;
      const spread = sound.jitter ?? 0;
      const pitch = (opts.pitch ?? 1) * (1 + (random() * 2 - 1) * spread);
      const gain = Math.max(0, opts.volume ?? 1);
      for (const tone of sound.tones) startTone(ctx, master, tone, t0, pitch, gain);
      return true;
    },
    unlock() {
      if (!ctx) {
        try {
          ctx = createContext();
          build(ctx);
        } catch (err) {
          console.warn('[audio] Web Audio is unavailable', err);
          ctx = undefined;
          return;
        }
      }
      resume();
    },
    resume,
    suspend() {
      if (ctx?.state === 'running') ctx.suspend().catch(() => undefined);
    },
    setSettings(settings) {
      enabled = settings.sound;
      volume = Math.min(1, Math.max(0, settings.volume));
      if (master) master.gain.value = masterGain();
    },
  };
}

const engine = createAudioEngine();
let setUp = false;

/**
 * Call once at boot. Opts into iPhone's playback audio session, so sound plays
 * with the silent switch on, and unlocks Web Audio on the first tap or key
 * press. The listeners stay, because iOS interrupts the context (calls, Siri,
 * the background) and only a later gesture can resume it.
 */
export function setupAudio(): void {
  if (setUp || typeof window === 'undefined') return;
  setUp = true;
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'playback';
  const unlock = (): void => engine.unlock();
  for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
    window.addEventListener(type, unlock, { capture: true, passive: true });
  }
  // Suspending in the background also hands the audio session back to other apps.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') engine.suspend();
    else engine.resume();
  });
}

/** Plays a named sound; does nothing until the first gesture, when muted, or when throttled. */
export const play = (name: SoundName, opts?: PlayOptions): boolean => engine.play(name, opts);

/** Apply `sound` and `volume` from the stored settings, at boot and whenever they change. */
export const setAudioSettings = (settings: Pick<Settings, 'sound' | 'volume'>): void => engine.setSettings(settings);
