import { settings } from './settings.js';

// All sound is synthesised with the Web Audio API: no audio files.
let ctx = null, sfxGain = null, musicGain = null, noiseBuffer = null, musicTimer = null;
let nightMood = false, rainGain = null, melodyBus = null;

// Browsers only allow audio after a click or key press; call this from one.
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    sfxGain = ctx.createGain();
    musicGain = ctx.createGain();
    sfxGain.connect(ctx.destination);
    // music goes through a gentle low-pass so nothing is harsh, and the melody gets a soft echo on top
    const warm = ctx.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = 2600;
    musicGain.connect(warm).connect(ctx.destination);
    melodyBus = ctx.createGain();
    const echo = ctx.createDelay(1), feedback = ctx.createGain(), wet = ctx.createGain();
    echo.delayTime.value = 0.42;
    feedback.gain.value = 0.34;
    wet.gain.value = 0.4;
    melodyBus.connect(musicGain);
    melodyBus.connect(echo);
    echo.connect(feedback).connect(echo);
    echo.connect(wet).connect(musicGain);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    // rain: a steady hiss of filtered noise whose loudness follows the weather
    const rain = ctx.createBufferSource(), band = ctx.createBiquadFilter();
    rain.buffer = noiseBuffer;
    rain.loop = true;
    band.type = 'bandpass';
    band.frequency.value = 2400;
    band.Q.value = 0.5;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rain.connect(band).connect(rainGain).connect(sfxGain);
    rain.start();
    applyVolume();
    musicTimer = setInterval(musicTick, 400);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function applyVolume() {
  if (!ctx) return;
  sfxGain.gain.value = settings.sfx;
  musicGain.gain.value = settings.music * 0.9;
}

export function setNight(night) { nightMood = night; }

// level 0..1: how hard it is raining (0 under water, where the hiss would be wrong)
export function setRain(level) {
  if (rainGain) rainGain.gain.setTargetAtTime(level * 0.28, ctx.currentTime, 0.6);
}

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

// ---------- background music ----------
// A slow, warm loop in the style of a lullaby: a soft pad holds each chord, a round bass sits under it,
// and a music-box melody wanders over the top with a little echo. Four chords, eight seconds each.
// By day it is in C major; at night it moves to the relative minor, slower-feeling and sparser.
// Around it, birds sing by day and crickets chirp at night.
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const BAR = 8; // seconds per chord
const DAY_CHORDS = [
  [48, 55, 59, 64], // Cmaj7
  [45, 52, 55, 60], // Am7
  [41, 48, 52, 57], // Fmaj7
  [43, 50, 55, 59], // G
];
const NIGHT_CHORDS = [
  [45, 52, 55, 59], // Am9
  [41, 48, 52, 57], // Fmaj7
  [38, 45, 48, 53], // Dm7
  [40, 47, 52, 55], // Em7
];
const MELODY = [60, 62, 64, 67, 69, 72, 74, 76]; // C major pentatonic, fits every chord above
let nextBar = 0, barIndex = 0, lastNote = 3;

// One held note with a slow swell and fade: the building block of the pad.
function swell(freq, start, length, vol, type = 'sine') {
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(vol, start + 2.2);
  gain.gain.setValueAtTime(vol, start + length - 2.4);
  gain.gain.linearRampToValueAtTime(0.0001, start + length + 1.2);
  osc.connect(gain).connect(musicGain);
  osc.start(start);
  osc.stop(start + length + 1.3);
}

// A music-box pluck: bright at the first instant, then a long soft ring.
function pluck(freq, start, vol) {
  for (const [mult, level, type] of [[1, 1, 'triangle'], [2, 0.35, 'sine'], [3, 0.08, 'sine']]) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq * mult;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(vol * level, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 2.6 / mult);
    osc.connect(gain).connect(melodyBus);
    osc.start(start);
    osc.stop(start + 2.8 / mult);
  }
}

function scheduleBar(start) {
  const chords = nightMood ? NIGHT_CHORDS : DAY_CHORDS;
  const chord = chords[barIndex % chords.length];
  barIndex++;
  // pad: each chord tone twice, a few cents apart, so it shimmers gently
  for (const n of chord) {
    swell(midi(n) * 1.003, start, BAR, 0.035, 'sine');
    swell(midi(n) * 0.997, start, BAR, 0.03, 'triangle');
  }
  // bass: the root, an octave down
  swell(midi(chord[0] - 12), start, BAR, 0.07, 'sine');

  // melody: a few plucks on the beat, stepping to nearby notes so it sings instead of jumping around
  const beats = nightMood ? [0, 3, 6] : [0, 1.5, 3, 4, 6, 7];
  for (const beat of beats) {
    if (Math.random() < (nightMood ? 0.35 : 0.25)) continue; // leave room to breathe
    lastNote = Math.max(0, Math.min(MELODY.length - 1, lastNote + [-2, -1, -1, 0, 1, 1, 2][(Math.random() * 7) | 0]));
    const note = MELODY[lastNote] - (nightMood ? 12 : 0);
    pluck(midi(note), start + beat + Math.random() * 0.04, nightMood ? 0.07 : 0.09);
  }
}

// A bird: two or three quick rising chirps.
function bird() {
  const base = 2600 + Math.random() * 1400, chirps = 2 + ((Math.random() * 3) | 0);
  for (let i = 0; i < chirps; i++) tone(base + i * 120, 0.09, 'sine', 0.035, 700, i * 0.14, musicGain);
}

// Crickets: a short run of even, high pulses.
function crickets() {
  const pulses = 5 + ((Math.random() * 5) | 0);
  for (let i = 0; i < pulses; i++) tone(4300, 0.035, 'sine', 0.018, 0, i * 0.075, musicGain);
}

// Runs a few times a second: keeps the next chord scheduled a little ahead, and sprinkles in the wildlife.
function musicTick() {
  if (!ctx || ctx.state !== 'running') return;
  if (settings.music <= 0) {
    nextBar = 0;
    return;
  }
  const now = ctx.currentTime;
  if (nextBar < now) nextBar = now + 0.3;
  while (nextBar < now + 1.5) {
    scheduleBar(nextBar);
    nextBar += BAR;
  }
  if (Math.random() < (nightMood ? 0.11 : 0.05)) (nightMood ? crickets : bird)();
}
