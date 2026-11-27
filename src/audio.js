import { settings } from './settings.js';

// All sound is synthesised with the Web Audio API: no audio files.
let ctx = null, sfxGain = null, musicGain = null, noiseBuffer = null, musicTimer = null;
let nightMood = false;

// Browsers only allow audio after a click or key press; call this from one.
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    sfxGain = ctx.createGain();
    musicGain = ctx.createGain();
    sfxGain.connect(ctx.destination);
    musicGain.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    applyVolume();
    musicTimer = setInterval(musicTick, 2600);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function applyVolume() {
  if (!ctx) return;
  sfxGain.gain.value = settings.sfx;
  musicGain.gain.value = settings.music * 0.5;
}

export function setNight(night) { nightMood = night; }

// A pitched blip. slide: Hz the pitch moves by over its length. delay: seconds from now.
function tone(freq, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0, dest = sfxGain) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// A burst of filtered noise: thuds, crunches, rustles.
function noise(dur, vol, freq, type = 'lowpass', delay = 0) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  src.buffer = noiseBuffer;
  filter.type = type;
  filter.frequency.value = freq;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(sfxGain);
  src.start(t, Math.random() * 0.5, dur + 0.02);
}

const SFX = {
  pick: () => tone(620, 0.09, 'triangle', 0.22, 280),
  chop: () => { noise(0.1, 0.5, 900); tone(150, 0.1, 'square', 0.12, -60); },
  mine: () => { noise(0.07, 0.35, 2800, 'highpass'); tone(540, 0.07, 'square', 0.1, -220); },
  hit: () => noise(0.09, 0.5, 1400),
  place: () => { tone(170, 0.12, 'sine', 0.35, -70); noise(0.05, 0.2, 600); },
  craft: () => { tone(520, 0.08, 'triangle', 0.22); tone(780, 0.14, 'triangle', 0.22, 0, 0.08); },
  eat: () => [0.22, 0.45, 0.68, 0.9].forEach((d) => noise(0.07, 0.3, 1100, 'bandpass', d)),
  drink: () => [0.22, 0.45, 0.68, 0.9].forEach((d, i) => tone(280 + i * 30, 0.1, 'sine', 0.2, 140, d)),
  hurt: () => { tone(230, 0.25, 'sawtooth', 0.25, -150); noise(0.1, 0.3, 700); },
  gone: () => tone(320, 0.35, 'triangle', 0.22, -260),
  step: () => noise(0.045, 0.1, 480),
  jump: () => tone(250, 0.13, 'sine', 0.14, 210),
  break: () => { noise(0.18, 0.5, 1800, 'highpass'); tone(200, 0.2, 'square', 0.12, -120); },
  goal: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.22, 0, i * 0.09)),
  ui: () => tone(880, 0.035, 'square', 0.07),
  splash: () => { noise(0.3, 0.4, 900, 'bandpass'); tone(180, 0.25, 'sine', 0.15, -90); },
  winded: () => noise(0.4, 0.2, 500, 'bandpass'),
  morning: () => [392, 494, 587].forEach((f, i) => tone(f, 0.5, 'sine', 0.18, 0, i * 0.18)),
};

export function sfx(name) {
  if (!ctx || settings.sfx <= 0) return;
  SFX[name]?.();
}

// Gentle generative music: a few soft notes from a pentatonic scale every couple of seconds,
// brighter by day, lower and sparser at night.
const DAY_SCALE = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];
const NIGHT_SCALE = [196.0, 220.0, 261.6, 293.7, 329.6, 392.0];
function musicTick() {
  if (!ctx || ctx.state !== 'running' || settings.music <= 0) return;
  const scale = nightMood ? NIGHT_SCALE : DAY_SCALE;
  const notes = nightMood ? 1 : 1 + (Math.random() < 0.5 ? 1 : 0);
  for (let i = 0; i < notes; i++) {
    if (Math.random() < 0.25) continue; // leave some silence
    const f = scale[(Math.random() * scale.length) | 0];
    const delay = i * 0.6 + Math.random() * 0.4;
    tone(f, 2.4, 'sine', 0.22, 0, delay, musicGain);
    tone(f * 2, 1.6, 'triangle', 0.05, 0, delay, musicGain);
  }
  if (Math.random() < 0.3) tone(scale[0] / 2, 3.2, 'sine', 0.16, 0, 0, musicGain);
}
