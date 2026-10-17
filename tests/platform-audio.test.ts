import { describe, expect, it } from 'vitest';
import {
  createAudioEngine,
  createVoiceLimiter,
  SHOOT_VARIANTS,
  SOUND_NAMES,
  SOUNDS,
  soundLength,
  type ShootVariant,
  type Sound,
  type SoundName,
} from '../src/platform/audio';

/** An AudioParam that rejects what real Web Audio rejects, e.g. exponential ramps to zero. */
class FakeParam {
  value = 0;
  setValueAtTime(value: number, time: number): this {
    check(Number.isFinite(value) && time >= 0, `setValueAtTime(${value}, ${time})`);
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    check(Number.isFinite(value) && time >= 0, `linearRamp(${value}, ${time})`);
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number): this {
    check(Number.isFinite(value) && value > 0 && time >= 0, `exponentialRamp(${value}, ${time})`);
    return this;
  }
}

function check(ok: boolean, what: string): void {
  if (!ok) throw new RangeError(`invalid automation: ${what}`);
}

class FakeNode {
  connect<T>(next: T): T {
    return next;
  }
  disconnect(): void {}
}

class FakeSource extends FakeNode {
  onended: (() => void) | null = null;
  constructor(private readonly ctx: FakeContext) {
    super();
  }
  start(when = 0): void {
    check(when >= 0, `start(${when})`);
    this.ctx.started++;
  }
  stop(): void {}
}

class FakeContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  sampleRate = 48_000;
  destination = new FakeNode();
  started = 0;
  resumes = 0;
  createGain() {
    return Object.assign(new FakeNode(), { gain: new FakeParam() });
  }
  createOscillator() {
    return Object.assign(new FakeSource(this), { type: 'sine', frequency: new FakeParam() });
  }
  createBufferSource() {
    return Object.assign(new FakeSource(this), { buffer: null, loop: false });
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam(), Q: new FakeParam() });
  }
  createDynamicsCompressor() {
    const p = () => new FakeParam();
    return Object.assign(new FakeNode(), { threshold: p(), knee: p(), ratio: p(), attack: p(), release: p() });
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  resume(): Promise<void> {
    this.resumes++;
    this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }
}

function setup() {
  const ctx = new FakeContext();
  const engine = createAudioEngine({ createContext: () => ctx as unknown as AudioContext, random: () => 0.5 });
  return { ctx, engine };
}

function unlocked() {
  const s = setup();
  s.engine.unlock();
  s.ctx.started = 0;
  return s;
}

const ALL_NAMES: SoundName[] = [
  'place', 'rock', 'merge', 'upgrade', 'shoot', 'hit', 'splash', 'kill',
  'leak', 'waveStart', 'waveEnd', 'click', 'error', 'win', 'lose', 'levelUp', 'summon', 'resource', 'rise',
];
const VARIANTS = Object.keys(SHOOT_VARIANTS) as ShootVariant[];

describe('sound bank', () => {
  it('has every named sound and several shoot variants', () => {
    expect([...SOUND_NAMES].sort()).toEqual([...ALL_NAMES].sort());
    expect(VARIANTS.length).toBeGreaterThanOrEqual(3);
  });

  const sounds: [string, Sound][] = [
    ...SOUND_NAMES.map((name): [string, Sound] => [name, SOUNDS[name]]),
    ...VARIANTS.map((v): [string, Sound] => [`shoot:${v}`, SHOOT_VARIANTS[v]]),
  ];

  it.each(sounds)('%s is a short, audible, sane synth patch', (_name, sound) => {
    expect(sound.tones.length).toBeGreaterThan(0);
    expect(soundLength(sound)).toBeLessThanOrEqual(1.5);
    for (const tone of sound.tones) {
      expect(tone.dur).toBeGreaterThan(0);
      expect(tone.at ?? 0).toBeGreaterThanOrEqual(0);
      expect(tone.gain).toBeGreaterThan(0);
      expect(tone.gain).toBeLessThanOrEqual(0.5);
      for (const hz of [tone.freq, tone.slide ?? tone.freq]) {
        expect(hz).toBeGreaterThanOrEqual(40);
        expect(hz).toBeLessThanOrEqual(12_000);
      }
    }
  });

  it('keeps combat sounds brief so the voice cap frees up quickly', () => {
    for (const name of ['shoot', 'hit', 'kill'] as const) expect(soundLength(SOUNDS[name])).toBeLessThan(0.2);
    for (const v of VARIANTS) expect(soundLength(SHOOT_VARIANTS[v])).toBeLessThan(0.2);
  });

  it('plays every sound and variant through Web Audio without an invalid schedule', () => {
    const { ctx, engine } = unlocked();
    for (const name of SOUND_NAMES) {
      ctx.currentTime += 1;
      expect(engine.play(name)).toBe(true);
    }
    for (const variant of VARIANTS) {
      ctx.currentTime += 1;
      expect(engine.play('shoot', { variant, pitch: 0.9, volume: 0.5 })).toBe(true);
    }
    expect(ctx.started).toBeGreaterThan(SOUND_NAMES.length);
  });
});

describe('unlock, mute and volume', () => {
  it('stays silent until unlocked by a gesture', () => {
    const { ctx, engine } = setup();
    expect(engine.play('click')).toBe(false);
    engine.unlock();
    expect(ctx.state).toBe('running');
    expect(engine.play('click')).toBe(true);
  });

  it('resumes after the context is suspended or interrupted', () => {
    const { ctx, engine } = unlocked();
    engine.suspend();
    expect(engine.play('click')).toBe(false);
    engine.unlock();
    expect(ctx.resumes).toBe(2);
    expect(engine.play('click')).toBe(true);
  });

  it('honours the sound and volume settings', () => {
    const { engine } = unlocked();
    engine.setSettings({ sound: false, volume: 0.8 });
    expect(engine.play('click')).toBe(false);
    engine.setSettings({ sound: true, volume: 0 });
    expect(engine.play('click')).toBe(false);
    engine.setSettings({ sound: true, volume: 0.5 });
    expect(engine.play('click')).toBe(true);
  });
});

describe('throttle', () => {
  it('drops a repeat of the same sound within 40 ms', () => {
    const { ctx, engine } = unlocked();
    expect(engine.play('hit')).toBe(true);
    ctx.currentTime += 0.02;
    expect(engine.play('hit')).toBe(false);
    ctx.currentTime += 0.03;
    expect(engine.play('hit')).toBe(true);
  });

  it('treats each shoot variant as its own sound for the repeat gap', () => {
    const { engine } = unlocked();
    expect(engine.play('shoot', { variant: 'arrow' })).toBe(true);
    expect(engine.play('shoot', { variant: 'cannon' })).toBe(true);
    expect(engine.play('shoot', { variant: 'arrow' })).toBe(false);
    expect(engine.play('shoot')).toBe(false);
  });

  it('turns 80 towers firing in one tick into a handful of voices', () => {
    const { ctx, engine } = unlocked();
    let played = 0;
    for (let i = 0; i < 80; i++) {
      if (engine.play('shoot', { variant: VARIANTS[i % VARIANTS.length] ?? 'arrow' })) played++;
    }
    expect(played).toBeLessThanOrEqual(4);
    expect(ctx.started).toBeLessThanOrEqual(8);
  });

  it('never exceeds the voice cap in a long, busy fight, yet lets important cues through', () => {
    const { ctx, engine } = unlocked();
    const busy: SoundName[] = ['shoot', 'hit', 'splash', 'kill'];
    const sounding: number[] = [];
    let leaksHeard = 0;
    for (let frame = 0; frame < 600; frame++) {
      const now = (ctx.currentTime = frame / 60);
      for (let i = 0; i < 40; i++) {
        const name = busy[i % busy.length] ?? 'hit';
        const variant = VARIANTS[i % VARIANTS.length] ?? 'arrow';
        const sound = name === 'shoot' ? SHOOT_VARIANTS[variant] : SOUNDS[name];
        if (engine.play(name, { variant })) sounding.push(now + soundLength(sound));
      }
      expect(sounding.filter((end) => end > now).length).toBeLessThanOrEqual(14);
      if (frame % 30 === 0 && engine.play('leak')) leaksHeard++;
    }
    expect(sounding.length).toBeGreaterThan(600);
    expect(leaksHeard).toBe(20);
  });

  it('frees voices as sounds finish', () => {
    const limiter = createVoiceLimiter({ maxVoices: 2, maxPerSound: 2, repeatGap: 0.04 });
    expect(limiter.admit('a', 'a', 0, 0.1, false)).toBe(true);
    expect(limiter.admit('b', 'b', 0, 0.1, false)).toBe(true);
    expect(limiter.admit('c', 'c', 0.05, 0.1, false)).toBe(false);
    expect(limiter.admit('important', 'x', 0.05, 0.1, true)).toBe(true);
    expect(limiter.active(0.11)).toBe(1);
    expect(limiter.admit('c', 'c', 0.11, 0.1, false)).toBe(true);
  });
});
