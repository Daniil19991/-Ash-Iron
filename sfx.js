// Ретро-звуки, синтезированные WebAudio: файлы не нужны, работает офлайн.
// Браузеры разрешают звук только после касания — контекст создаётся при старте игры.
let ctx = null;
let master = null; // общая громкость
let alertGain = null; // отдельная громкость сигнала «приседай»
const levels = { volume: 0.8, alert: 1, vibrate: true };

export function initAudio() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    if (!master) {
      master = ctx.createGain();
      master.connect(ctx.destination);
      alertGain = ctx.createGain();
      alertGain.connect(master);
      applyLevels();
    }
  } catch (e) {
    ctx = null;
  }
}

function applyLevels() {
  // громкость нелинейна на слух: квадрат делает середину шкалы заметно тише максимума
  if (master) master.gain.value = levels.volume * levels.volume * 1.25;
  if (alertGain) alertGain.gain.value = levels.alert;
}

/** Настройки звука: volume 0..1, alert 0..1.5 (сигнал замаха), vibrate. */
export function setAudio({ volume, alert, vibrate } = {}) {
  if (volume != null) levels.volume = volume;
  if (alert != null) levels.alert = alert;
  if (vibrate != null) levels.vibrate = vibrate;
  applyLevels();
}

function tone(freq, dur, { type = "square", vol = 0.12, slide = 0, delay = 0, out = master } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(out || ctx.destination);
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
  src.connect(gain).connect(master || ctx.destination);
  src.start();
}

export const sfx = {
  hit: () => { noise(0.12, 0.2); tone(180, 0.1, { slide: -100 }); },
  crit: () => { noise(0.15, 0.25); tone(320, 0.15, { slide: -200 }); tone(640, 0.1, { delay: 0.05, vol: 0.08 }); },
  hurt: () => { tone(140, 0.3, { type: "sawtooth", slide: -90, vol: 0.18 }); noise(0.2, 0.15); },
  dodge: () => tone(500, 0.12, { type: "triangle", slide: 300, vol: 0.1 }),
  heal: () => [0, 0.08, 0.16].forEach((d, i) => tone(440 * (1 + i * 0.25), 0.15, { type: "triangle", delay: d, vol: 0.1 })),
  warn: () => tone(220, 0.08, { vol: 0.08 }),
  // враг замахнулся — пора приседать: громкий тревожный «дин-дин-ДОН», слышно с 2–3 м
  alert: () => {
    [[988, 0, 0.12], [988, 0.14, 0.12], [1319, 0.28, 0.3]].forEach(([f, d, len]) => {
      tone(f, len, { type: "square", delay: d, vol: 0.24, out: alertGain });
      tone(f * 2, len * 0.7, { type: "triangle", delay: d, vol: 0.12, out: alertGain });
    });
    try {
      if (levels.vibrate && navigator.vibrate) navigator.vibrate([120, 40, 120]); // Android
    } catch (e) { /* нет вибрации */ }
  },
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
