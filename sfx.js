// Ретро-звуки, синтезированные WebAudio: файлы не нужны, работает офлайн.
// Браузеры разрешают звук только после касания — контекст создаётся при старте игры.
let ctx = null;

export function initAudio() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch (e) {
    ctx = null;
  }
}

function tone(freq, dur, { type = "square", vol = 0.12, slide = 0, delay = 0 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur, vol = 0.15) {
  if (!ctx) return;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.buffer = buf;
  src.connect(gain).connect(ctx.destination);
  src.start();
}

export const sfx = {
  hit: () => { noise(0.12, 0.2); tone(180, 0.1, { slide: -100 }); },
  crit: () => { noise(0.15, 0.25); tone(320, 0.15, { slide: -200 }); tone(640, 0.1, { delay: 0.05, vol: 0.08 }); },
  hurt: () => { tone(140, 0.3, { type: "sawtooth", slide: -90, vol: 0.18 }); noise(0.2, 0.15); },
  dodge: () => tone(500, 0.12, { type: "triangle", slide: 300, vol: 0.1 }),
  heal: () => [0, 0.08, 0.16].forEach((d, i) => tone(440 * (1 + i * 0.25), 0.15, { type: "triangle", delay: d, vol: 0.1 })),
  warn: () => tone(220, 0.08, { vol: 0.08 }),
  rep: () => tone(660, 0.06, { type: "triangle", vol: 0.08 }),
  level: () => [0, 0.1, 0.2, 0.3].forEach((d, i) => tone([392, 494, 587, 784][i], 0.22, { type: "triangle", delay: d })),
  win: () => [0, 0.15, 0.3].forEach((d, i) => tone([330, 415, 494][i], 0.35, { type: "triangle", delay: d })),
  die: () => [0, 0.25, 0.5].forEach((d, i) => tone([220, 185, 147][i], 0.5, { type: "sawtooth", delay: d, vol: 0.1 })),
  click: () => tone(880, 0.03, { vol: 0.05 }),
  // косметика
  thunder: () => { noise(0.35, 0.3); tone(90, 0.4, { type: "sawtooth", slide: -50, vol: 0.12 }); },
  souls: () => [0, 0.1, 0.2].forEach((d, i) => tone(520 - i * 70, 0.4, { type: "sine", slide: -180, delay: d, vol: 0.07 })),
  fanfare: () => [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.38], [784, 0.6], [1047, 0.72]]
    .forEach(([f, d]) => { tone(f, 0.28, { type: "square", delay: d, vol: 0.06 }); tone(f / 2, 0.28, { type: "triangle", delay: d, vol: 0.08 }); }),
  pyre: () => { noise(0.8, 0.12); [196, 247, 294].forEach((f) => tone(f, 1.2, { type: "sine", vol: 0.06 })); },
  buy: () => [0, 0.07, 0.14, 0.21].forEach((d, i) => tone([660, 880, 1100, 1320][i], 0.12, { type: "triangle", delay: d, vol: 0.09 })),
};
