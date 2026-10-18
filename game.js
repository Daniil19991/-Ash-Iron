// «Ash & Iron» — мобильная (браузерная) версия. Порт game/core.py + game/scenes.py.
// Мир рисуется в 320×180 и масштабируется ×2; интерфейс — в логических координатах 640×H.
// В портретной ориентации под игрой появляется большая панель камеры.
import { NAMES } from "./exercises.js";
import { Motion } from "./motion.js";
import {
  BOSS_EVERY, CASTLE_FROM_WAVE, LOCATIONS, RELICS, SHOP_ORDER, SWORDS, enemyKind, isBossWave, item, locationFor, priceText, rewards,
} from "./gear.js";
import { Player, STATS } from "./player.js";
import { initAudio, setAudio, sfx } from "./sfx.js";
import { COSMETIC, COSMETICS, HitFx, KIND_TITLES, SwordAura, VictoryFx, drawSkinSlash } from "./cosmetics.js";
import { Leaderboard } from "./leaderboard.js";
import { Profile } from "./profile.js";
import { Store, TIPS } from "./store.js";
import { loadJSON, saveJSON } from "./storage.js";
import { confirmDialog, modalOpen, promptName } from "./ui.js";

const CW = 320, CH = 180;
const W = 640, GAME_H = 360;
const GROUND_TITLE = 150, GROUND_ARENA = 140;
const FONT = '"PressStart2P", monospace';

const COL = {
  text: "rgb(226,214,190)", dim: "rgb(150,138,128)", gold: "rgb(232,190,92)",
  red: "rgb(200,40,36)", green: "rgb(70,160,70)", shadow: "rgb(8,6,12)",
};

// Облик героя по реликвиям: доспех Костяного Рыцаря (рога, тёмные латы) и/или Амулет Углей
const LOOKS = ["base", "armor", "amulet", "both"];
function heroLook(owned) {
  const armor = owned.includes("armor"), amulet = owned.includes("amulet");
  return armor && amulet ? "both" : armor ? "armor" : amulet ? "amulet" : "base";
}
/** Префикс спрайтов героя: меч (или купленный облик меча skin) и облик по реликвиям. */
const heroSprite = (sword, owned, skin = null) => `hero_${skin || sword}_${heroLook(owned)}`;

// След удара для каждого меча
const SLASH_TIME = 0.18;
const SLASH_COLORS = { rusty: [190, 140, 100], steel: [235, 240, 250], great: [200, 210, 230], ash: [255, 150, 60] };

/** Дуга следа удара: k от 0 (начало) до 1 (исчезла). Двуручник — шире, пепельный — огненный. */
function drawSlash(c, x, y, sword, k, skin = null) {
  if (skin) return drawSkinSlash(c, x, y, skin, k);
  const big = sword === "great";
  const radius = big ? 22 : 16;
  const base = SLASH_COLORS[sword];
  const fade = Math.max(0, 1 - k);
  for (const [width, shrink, mix] of [[big ? 3 : 2, 0, 0], [1, 3, 0.5]]) {
    const col = base.map((ch) => Math.floor((ch + (255 - ch) * mix) * fade + 20 * (1 - fade)));
    c.fillStyle = `rgb(${col.join(",")})`;
    const sweep = -70 + 140 * Math.min(1, k * 2.5); // дуга быстро «прочерчивается» сверху вниз
    for (let a = -70; a <= sweep; a += 5) {
      const rad = (a * Math.PI) / 180;
      c.fillRect(Math.floor(x + Math.cos(rad) * (radius - shrink) * 0.55), Math.floor(y + Math.sin(rad) * (radius - shrink)), width, width);
    }
  }
  if (sword === "ash") {
    c.fillStyle = "rgb(255,200,90)";
    for (let i = 0; i < 4; i++) c.fillRect(x + Math.floor(rand(-4, 10)), y + Math.floor(rand(-radius, radius)), 1, 1);
  }
}

const IMG = {};

/** Все спрайты лежат в одном атласе (assets/atlas.png + atlas.json, см. tools/export_web_assets.py). */
async function loadImages() {
  const [rects, sheet] = await Promise.all([
    fetch("atlas.json").then((r) => r.json()),
    new Promise((ok, fail) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = fail;
      im.src = "atlas.png";
    }),
  ]);
  for (const [name, [x, y, w, h]] of Object.entries(rects)) {
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    cv.getContext("2d").drawImage(sheet, x, y, w, h, 0, 0, w, h);
    IMG[name] = cv;
  }
}

function anim(prefix, t, fps, n) {
  return IMG[`${prefix}_${((Math.floor(t * fps) % n) + n) % n}`];
}

const rand = (a, b) => a + Math.random() * (b - a);
const inRect = (p, r) => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

class Particles {
  constructor(x, y, rate = 18, spread = 5) {
    Object.assign(this, { x, y, rate, spread });
    this.items = [];
    this.acc = 0;
  }
  update(dt) {
    this.acc += dt * this.rate;
    while (this.acc >= 1) {
      this.acc -= 1;
      this.items.push([this.x + rand(-this.spread, this.spread), this.y, rand(-6, 6), rand(-26, -12), rand(1, 2.2)]);
    }
    for (const p of this.items) {
      p[0] += p[2] * dt + rand(-0.3, 0.3);
      p[1] += p[3] * dt;
      p[4] -= dt;
    }
    this.items = this.items.filter((p) => p[4] > 0);
  }
  draw(c) {
    for (const [x, y, , , life] of this.items) {
      c.fillStyle = life > 1.4 ? "rgb(255,200,90)" : life > 0.6 ? "rgb(230,110,40)" : "rgb(120,50,30)";
      c.fillRect(Math.floor(x), Math.floor(y), 1, 1);
    }
  }
}

// ------------------------------------------------------------------ Ядро
class Game {
  constructor(canvas, useCamera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.world = document.createElement("canvas");
    this.world.width = CW;
    this.world.height = CH;
    this.wctx = this.world.getContext("2d");
    this.player = Player.load();
    this.profile = Profile.load(); // имя в рейтинге, рекорд и облик — переживают «Новую игру»
    this.store = new Store(confirmDialog);
    this.leaderboard = new Leaderboard();
    this.settings = { volume: 0.8, alert: 1, vibrate: true, ...loadJSON(SETTINGS_KEY, {}) };
    setAudio(this.settings);
    this.leaderboard.flush(); // результат, накопленный без сети, уходит при запуске
    this.motion = new Motion();
    this.useCamera = useCamera;
    this.time = 0;
    this.shake = 0;
    this.keys = [];
    this.taps = [];
    this.manualCounts = { pushup: 0, squat: 0, jack: 0 };
    this.run = null; // здоровье/зелья между боями (null — полные, после костра)
    this.resize();
    addEventListener("resize", () => this.resize());
    this.codes = []; // физические клавиши (e.code) — J/K/L работают на любой раскладке
    this.held = new Set(); // зажатые клавиши: удержание уворота
    this.toast = "";
    this.toastT = 0;
    addEventListener("keydown", (e) => {
      if (modalOpen()) return; // открыто окно (имя, покупка) — игра клавиши не слушает
      if (["F2", "F3", "F4", "Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
      this.held.add(e.code);
      if (e.repeat) return; // автоповтор не считается новым повторением упражнения
      this.keys.push({ KeyW: "ArrowUp", KeyS: "ArrowDown" }[e.code] || e.key);
      this.codes.push(e.code);
    });
    addEventListener("keyup", (e) => this.held.delete(e.code));
    addEventListener("blur", () => this.held.clear());
    canvas.addEventListener("pointerdown", (e) => {
      const r = canvas.getBoundingClientRect();
      this.taps.push({ x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * this.H });
      e.preventDefault();
    });
  }

  /** Нужна ли сцене нижняя часть экрана в портрете (камера или крупное меню). */
  get usesPanel() {
    const s = this.scene;
    return !!s && (s.needsCamera || s.ownsPanel);
  }

  resize() {
    const vw = innerWidth, vh = innerHeight;
    this.portrait = vh > vw * 1.05;
    // камера видна только там, где нужны упражнения; иначе экран — одна картинка игры
    this.panelOn = this.portrait && this.usesPanel;
    this.H = this.panelOn ? Math.min(1400, Math.max(GAME_H + 200, Math.round((W * vh) / vw))) : GAME_H;
    this.canvas.width = W;
    this.canvas.height = this.H;
    const scale = Math.min(vw / W, vh / this.H);
    this.canvas.style.width = `${Math.floor(W * scale)}px`;
    this.canvas.style.height = `${Math.floor(this.H * scale)}px`;
    this.ctx.imageSmoothingEnabled = false;
    // Раскладка панели камеры и кнопок ручного ввода
    if (this.portrait) {
      const top = GAME_H + 8, btnH = 56;
      const camH = this.H - top - btnH - 24;
      const camW = Math.min(W - 16, Math.round((camH * 4) / 3));
      this.cam = [(W - camW) / 2, top, camW, camH];
      const y = this.H - btnH - 8, bw = (W - 32) / 3;
      this.manual = ["pushup", "squat", "jack"].map((ex, i) => [ex, [8 + i * (bw + 8), y, bw, btnH]]);
    } else {
      this.cam = [W - 136, 12, 120, 90];
      this.manual = ["pushup", "squat", "jack"].map((ex, i) => [ex, [W - 136, 110 + i * 30, 120, 26]]);
    }
  }

  // --- рисование
  text(s, x, y, size = 8, color = COL.text, align = "left", shadow = true, c = this.ctx) {
    c.font = `${size}px ${FONT}`;
    c.textBaseline = "top";
    c.textAlign = align;
    if (shadow) {
      c.fillStyle = COL.shadow;
      c.fillText(s, x + Math.max(1, size / 8), y + Math.max(1, size / 8));
    }
    c.fillStyle = color;
    c.fillText(s, x, y);
    return c.measureText(s).width;
  }

  wrap(s, maxChars) {
    const lines = [];
    let cur = "";
    for (const w of s.split(" ")) {
      if (cur && cur.length + w.length + 1 > maxChars) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  rect(r, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(...r);
  }

  bar(x, y, w, h, frac, color) {
    frac = Math.max(0, Math.min(1, frac));
    this.rect([x - 1, y - 1, w + 2, h + 2], COL.shadow);
    this.rect([x, y, w, h], "rgb(30,20,26)");
    this.rect([x, y, Math.floor(w * frac), h], color);
    this.rect([x, y, Math.floor(w * frac), 1], "rgba(255,255,255,0.3)");
  }

  button(r, label, { selected = false, size = 8, color } = {}) {
    this.rect(r, selected ? "rgba(70,40,30,0.85)" : "rgba(12,8,16,0.75)");
    const c = this.ctx;
    c.strokeStyle = selected ? COL.gold : "rgb(90,64,50)";
    c.lineWidth = 1;
    c.strokeRect(r[0] + 0.5, r[1] + 0.5, r[2] - 1, r[3] - 1);
    this.text(label, r[0] + r[2] / 2, r[1] + (r[3] - size) / 2, size, color || (selected ? COL.gold : COL.text), "center");
  }

  /** Было ли нажатие в прямоугольнике в этом кадре (нажатие «съедается»). */
  tapped(r) {
    const i = this.taps.findIndex((p) => inRect(p, r));
    if (i < 0) return false;
    this.taps.splice(i, 1);
    return true;
  }

  key(...names) {
    return this.keys.some((k) => names.includes(k));
  }

  /** Зажата клавиша уворота (K или 2) — герой остаётся внизу, как в удержанном приседе. */
  get manualLow() {
    return ["KeyK", "Digit2", "Numpad2"].some((c) => this.held.has(c));
  }

  /** Клавиши тестировщика: F2 — камни и пепел, F3 — следующий бой с боссом, F4 — к замку. */
  testKeys() {
    const p = this.player;
    if (this.codes.includes("F2")) {
      p.redGems += 10;
      p.blueGems += 1;
      p.souls += 300;
      this.say("Тест: +10 алых, +1 синий, +300 пепла");
    }
    if (this.codes.includes("F3")) {
      p.wave = Math.ceil(p.wave / BOSS_EVERY) * BOSS_EVERY;
      this.say(`Тест: следующий бой - босс (#${p.wave})`);
    }
    if (this.codes.includes("F4")) {
      p.wave = Math.max(p.wave, CASTLE_FROM_WAVE);
      this.say(`Тест: подступы к замку (#${p.wave})`);
    }
    if (["F2", "F3", "F4"].some((k) => this.codes.includes(k))) p.save();
  }

  say(text, t = 2.5) {
    this.toast = text;
    this.toastT = t;
  }

  /** Купленный и надетый облик данного типа (sword / hit / victory) или null. */
  style(kind) {
    const id = this.profile.style[kind];
    return id && this.store.owns(id) ? id : null;
  }

  get skin() {
    const id = this.style("sword");
    return id ? COSMETIC[id].skin : null;
  }

  /** Сохраняет рекорд и отправляет его в рейтинг (без сети — в очередь). */
  recordProgress() {
    if (this.profile.record(this.player)) {
      this.profile.save();
      this.leaderboard.submit(this.profile);
    }
  }

  /** Пиксельный камень 8×10: алый или синий. */
  gem(x, y, kind) {
    const c = this.ctx;
    const [dark, mid, light] = kind === "red"
      ? ["rgb(110,14,24)", "rgb(210,40,50)", "rgb(255,150,150)"]
      : ["rgb(20,40,120)", "rgb(60,110,230)", "rgb(170,210,255)"];
    const poly = (pts, color) => {
      c.fillStyle = color;
      c.beginPath();
      pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
      c.closePath();
      c.fill();
    };
    poly([[x + 5, y + 1], [x + 9, y + 5], [x + 5, y + 11], [x + 1, y + 5]], COL.shadow);
    poly([[x + 4, y], [x + 8, y + 4], [x + 4, y + 10], [x, y + 4]], mid);
    poly([[x + 4, y + 10], [x + 8, y + 4], [x + 4, y + 5]], dark);
    c.fillStyle = light;
    c.fillRect(x + 2, y + 3, 2, 1);
  }

  /** Счётчик камней «◆ 12  ◆ 1»; align "right" — по правому краю. */
  gems(x, y, p, align = "left") {
    const c = this.ctx;
    c.font = `8px ${FONT}`;
    const red = `${p.redGems}`, blue = `${p.blueGems}`;
    const width = 12 + c.measureText(red).width + 14 + 12 + c.measureText(blue).width;
    if (align === "right") x -= width;
    this.gem(x, y - 1, "red");
    x += 12 + this.text(red, x + 12, y, 8, "rgb(240,110,110)") + 14;
    this.gem(x, y - 1, "blue");
    this.text(blue, x + 12, y, 8, "rgb(130,170,255)");
  }

  cameraWidget() {
    const [x, y, w, h] = this.cam;
    this.rect([x - 2, y - 2, w + 4, h + 4], COL.shadow);
    this.ctx.strokeStyle = "rgb(60,46,50)";
    this.ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
    const big = this.portrait;
    if (this.motion.drawPreview(this.ctx, x, y, w, h)) {
      const d = this.motion.detector;
      this.text(d.posture, x + 4, y + h - (big ? 20 : 12), big ? 16 : 8, COL.gold);
      if (big) {
        const c = d.counts;
        this.text(`Отжим ${c.pushup}  Присед ${c.squat}  Звезда ${c.jack}`, x + 4, y + 4, 8, COL.text);
      }
    } else {
      this.text("КАМЕРА", x + w / 2, y + 8, big ? 16 : 8, COL.dim, "center");
      const lines = this.wrap(this.motion.status, big ? 36 : 14);
      lines.forEach((l, i) => this.text(l, x + w / 2, y + (big ? 40 : 24) + i * 12, 8, COL.dim, "center"));
      if (big) {
        this.wrap("Поставьте телефон на пол у стены, отойдите на 2–3 м, чтобы тело было целиком в кадре.", 36)
          .forEach((l, i) => this.text(l, x + w / 2, y + 100 + i * 12, 8, COL.dim, "center"));
      }
    }
  }

  /** Кнопки «ручного» упражнения: без камеры — основной ввод, с камерой — запасной. */
  manualButtons() {
    if (!this.portrait && this.motion.ok) return;
    const labels = this.portrait
      ? { pushup: "ОТЖИМ", squat: "ПРИСЕД", jack: "ЗВЕЗДА" }
      : { pushup: "ОТЖИМ [J]", squat: "ПРИСЕД [K]", jack: "ЗВЕЗДА [L]" };
    for (const [ex, r] of this.manual) this.button(r, labels[ex], { size: this.portrait ? 16 : 8 });
  }

  change(scene) {
    this.scene = scene;
  }

  frame(dt) {
    if (this.portrait && this.usesPanel !== this.panelOn) this.resize();
    let moves = this.motion.poll();
    // клавиатура (браузер на ПК) и экранные кнопки
    const pushup = ["pushup"], squat = ["squat_down", "squat"], jack = ["jack"];
    const keyMap = {
      KeyJ: pushup, Digit1: pushup, Numpad1: pushup,
      KeyK: squat, Digit2: squat, Numpad2: squat,
      KeyL: jack, Digit3: jack, Numpad3: jack,
    };
    for (const code of this.codes) if (keyMap[code]) moves.push(...keyMap[code]);
    this.testKeys();
    if (this.portrait || !this.motion.ok) {
      for (const [ex, r] of this.manual) {
        if (this.scene.manual && this.scene.needsCamera && this.tapped(r)) {
          moves.push(...(ex === "squat" ? ["squat_down", "squat"] : [ex]));
          this.manualCounts[ex] += 1;
        }
      }
    }
    for (const m of moves) this.player.addRep(m);
    this.time += dt;
    this.scene.handle(moves);
    this.scene.update(dt);

    const w = this.wctx;
    w.imageSmoothingEnabled = false;
    w.fillStyle = "#000";
    w.fillRect(0, 0, CW, CH);
    this.scene.draw(w);

    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    c.fillStyle = "rgb(10,6,12)";
    c.fillRect(0, 0, W, this.H);
    let ox = 0, oy = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      ox = Math.round(rand(-2, 2)) * 2;
      oy = Math.round(rand(-2, 2)) * 2;
    }
    c.drawImage(this.world, ox, oy, W, GAME_H);
    this.scene.drawUi();
    if (this.portrait && this.scene.needsCamera) {
      this.cameraWidget();
      if (this.scene.manual) this.manualButtons();
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      this.text(this.toast, W / 2, 4, 8, "rgb(120,220,255)", "center");
    }
    this.keys.length = 0;
    this.codes.length = 0;
    this.taps.length = 0;
  }
}

class Scene {
  constructor(game) {
    this.game = game;
    this.manual = false; // показывать кнопки ручных упражнений
  }
  /** Сейчас нужны упражнения: показать камеру и кнопки ручного ввода. */
  get needsCamera() {
    return false;
  }
  handle(moves) {}
  update(dt) {}
  draw(c) {}
  drawUi() {}
}

// ------------------------------------------------------------------ Главный экран
class TitleScene extends Scene {
  constructor(game) {
    super(game);
    this.embers = new Particles(208, 132, 22);
    this.index = 0;
    const g = game;
    this.items = [
      ["Продолжить путь", () => g.change(new BattleScene(g))],
      ["Костёр: прокачка", () => g.change(new BonfireScene(g))],
      ["Лавка образов", () => g.change(new CosmeticsScene(g))],
      ["Рейтинг", () => g.change(new LeaderboardScene(g))],
      ["Настройки", () => g.change(new SettingsScene(g))],
      ["Новая игра", () => this.newGame()],
    ];
    this.aura = new SwordAura();
    this.confirmT = 0;
    this.ownsPanel = true; // в портрете меню занимает место панели камеры
  }
  newGame() {
    // Защита от случайного касания: прогресс стирается только со второго нажатия
    if (this.confirmT <= 0) {
      this.confirmT = 3;
      return;
    }
    const g = this.game;
    g.player = new Player();
    g.player.save();
    g.run = null;
    g.change(new BonfireScene(g));
  }
  /** Крупные кнопки: на телефоне меню должно читаться с вытянутой руки. */
  rects() {
    const g = this.game, n = this.items.length;
    if (g.portrait) {
      // под картинкой: от строки статуса до низа экрана
      const top = GAME_H + 44, gap = 14;
      const h = Math.min(104, Math.floor((g.H - top - 16 - gap * (n - 1)) / n));
      const y0 = top + Math.max(0, Math.floor((g.H - top - 16 - n * h - gap * (n - 1)) / 2));
      return this.items.map((_, i) => [40, y0 + i * (h + gap), W - 80, h]);
    }
    return this.items.map((_, i) => [24, 90 + i * 41, 290, 35]);
  }
  textSize(r) {
    return this.game.portrait ? (r[3] >= 64 ? 24 : 16) : 12;
  }
  handle() {
    const g = this.game;
    if (g.key("ArrowUp")) this.index = (this.index + this.items.length - 1) % this.items.length;
    if (g.key("ArrowDown")) this.index = (this.index + 1) % this.items.length;
    const activate = (i) => {
      sfx.click();
      this.index = i;
      this.items[i][1]();
    };
    if (g.key("Enter", " ")) return activate(this.index);
    this.rects().forEach((r, i) => { if (g.tapped(r)) activate(i); });
  }
  update(dt) {
    this.embers.update(dt);
    this.aura.update(dt, this.game.skin, "idle", 172, GROUND_TITLE - 32);
    this.confirmT -= dt;
  }
  draw(c) {
    const t = this.game.time;
    c.drawImage(IMG.title_bg, 0, 0);
    const r = 34 + Math.round(Math.sin(t * 6) * 2);
    c.fillStyle = "rgba(255,120,40,0.16)";
    c.beginPath();
    c.ellipse(208, GROUND_TITLE - 2, r, 8, 0, 0, Math.PI * 2);
    c.fill();
    c.drawImage(anim("bonfire", t, 8, 4), 200, GROUND_TITLE - 22);
    const p = this.game.player;
    c.drawImage(anim(`${heroSprite(p.sword, p.owned, this.game.skin)}_idle`, t, 1.5, 2), 172, GROUND_TITLE - 32);
    this.aura.draw(c, this.game.skin, "idle", 172, GROUND_TITLE - 32, t);
    const sx = 270, sy = GROUND_TITLE - 32;
    c.drawImage(IMG.skeleton_dark_0, sx, sy);
    if (Math.floor(t * 1.3) % 5 !== 0) {
      c.fillStyle = "rgb(255,70,40)";
      c.fillRect(sx + 9, sy + 6, 1, 1);
      c.fillRect(sx + 14, sy + 6, 1, 1);
    }
    this.embers.draw(c);
  }
  drawUi() {
    const g = this.game, p = g.player;
    g.text("ASH & IRON", W / 2 + 3, 19, 40, "rgb(120,30,26)", "center", false);
    g.text("ASH & IRON", W / 2, 16, 40, "rgb(232,206,160)", "center", false);
    g.text("фитнес-RPG: тренируй тело, чтобы выжить во тьме", W / 2, 66, 8, COL.dim, "center");
    this.rects().forEach((r, i) => {
      const confirm = i === this.items.length - 1 && this.confirmT > 0;
      g.button(r, confirm ? "Стереть? Ещё раз" : this.items[i][0],
        { selected: i === this.index, color: confirm ? COL.red : undefined, size: this.textSize(r) });
    });
    const foe = isBossWave(p.wave) ? "БОСС" : Skeleton.NAMES[enemyKind(p.wave)].toLowerCase();
    const status = `Ур.${p.level} Пепел:${p.souls} ${LOCATIONS[locationFor(p.wave)].name}: ${foe} #${p.wave}`;
    if (g.portrait) g.text(status, W / 2, GAME_H + 14, status.length * 12 <= W - 24 ? 12 : 8, COL.text, "center");
    else g.text(status, 12, GAME_H - 16, 8, COL.dim);
    if (!g.portrait) g.text("ПК: J K L, тест F2-F4", W - 12, GAME_H - 16, 8, COL.dim, "right");
  }
}

// ------------------------------------------------------------------ Костёр
const BONFIRE_BUTTONS = [[[20, 216, 92, 26], "В БОЙ"], [[118, 216, 96, 26], "КУЗНИЦА"], [[220, 216, 90, 26], "МЕНЮ"]];

class BonfireScene extends Scene {
  constructor(game) {
    super(game);
    this.manual = true;
    this.embers = new Particles(216, 116, 26);
    this.ritual = null; // {stat, ex, need, done}
    this.say("Костёр зажжён. Здоровье и зелья восстановлены.");
    this.index = 0;
    game.run = null; // отдых у костра
  }
  say(msg, t = 3.5) {
    this.message = msg;
    this.msgT = t;
  }
  get needsCamera() {
    return !!this.ritual; // камера только во время ритуала прокачки
  }
  statRows() {
    return Object.keys(STATS).map((st, i) => [st, [20, 92 + i * 40, 290, 36]]);
  }
  startRitual(stat) {
    const p = this.game.player;
    if (!p.canLevel()) return this.say(`Нужно ${p.levelCost()} пепла, у вас ${p.souls}. Победите скелетов!`);
    this.ritual = { stat, ex: STATS[stat][1], need: p.repsNeeded(stat), done: 0 };
  }
  handle(moves) {
    const g = this.game, p = g.player;
    if (this.ritual) {
      if (g.key("Escape") || g.tapped([W / 2 - 70, GAME_H - 26, 140, 22])) {
        this.ritual = null;
        return this.say("Ритуал прерван. Пепел не потрачен.");
      }
      for (const m of moves) {
        if (m === this.ritual.ex) {
          this.ritual.done += 1;
          sfx.rep();
        }
      }
      if (this.ritual.done >= this.ritual.need) {
        const st = this.ritual.stat;
        p.levelUp(st);
        p.save();
        g.recordProgress();
        this.ritual = null;
        this.say(`${STATS[st][0]} повышена до ${p[st]}!`, 4);
        this.embers.rate = 120;
        sfx.level();
        if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
      }
      return;
    }
    const rows = this.statRows();
    const n = rows.length + 3;
    if (g.key("ArrowUp")) this.index = (this.index + n - 1) % n;
    if (g.key("ArrowDown")) this.index = (this.index + 1) % n;
    const activate = (i) => {
      sfx.click();
      this.index = i;
      if (i < rows.length) this.startRitual(rows[i][0]);
      else if (i === rows.length) g.change(new BattleScene(g));
      else if (i === rows.length + 1) g.change(new ShopScene(g));
      else g.change(new TitleScene(g));
    };
    if (g.key("Enter", " ")) return activate(this.index);
    if (g.key("Escape")) return g.change(new TitleScene(g));
    rows.forEach(([, r], i) => { if (g.tapped(r)) activate(i); });
    BONFIRE_BUTTONS.forEach(([r], j) => { if (g.tapped(r)) activate(rows.length + j); });
  }
  update(dt) {
    this.embers.update(dt);
    this.embers.rate += (26 - this.embers.rate) * Math.min(1, dt * 1.5);
    this.msgT -= dt;
  }
  draw(c) {
    const t = this.game.time;
    c.drawImage(IMG.title_bg, 0, 0);
    c.fillStyle = "rgba(0,0,0,0.47)";
    c.fillRect(0, 0, CW, CH);
    const r = 46 + Math.round(Math.sin(t * 5) * 3);
    c.fillStyle = "rgba(255,120,40,0.2)";
    c.beginPath();
    c.ellipse(216, GROUND_TITLE - 4, r, 12, 0, 0, Math.PI * 2);
    c.fill();
    c.drawImage(anim("bonfire", t, 8, 4), 200, GROUND_TITLE - 44, 32, 44);
    const p = this.game.player, hs = heroSprite(p.sword, p.owned, this.game.skin);
    const hero = this.ritual && this.ritual.done % 2 ? IMG[`${hs}_attack_0`] : IMG[`${hs}_idle_0`];
    c.drawImage(hero, 168, GROUND_TITLE - 32);
    this.embers.draw(c);
  }
  drawUi() {
    const g = this.game, p = g.player;
    g.rect([12, 12, 306, 260], "rgba(10,6,14,0.8)");
    g.ctx.strokeStyle = "rgb(90,64,50)";
    g.ctx.strokeRect(12.5, 12.5, 305, 259);
    g.text("КОСТЁР", 22, 22, 16, COL.gold);
    g.text(`Уровень ${p.level}`, 22, 46, 8);
    g.text(`Пепел: ${p.souls}`, 160, 46, 8, COL.gold);
    g.text(`Цена уровня: ${p.levelCost()} пепла`, 22, 62, 8, COL.dim);
    g.gems(310, 22, p, "right");
    g.text("Нажмите на навык:", 22, 78, 8, COL.dim);
    this.statRows().forEach(([st, r], i) => {
      const [name, ex, desc] = STATS[st];
      g.button(r, "", { selected: this.index === i });
      g.text(`${name} ${p[st]}`, r[0] + 8, r[1] + 7, 8, this.index === i ? COL.gold : COL.text);
      g.text(`${NAMES[ex]} x${p.repsNeeded(st)}: ${desc}`, r[0] + 8, r[1] + 21, 8, COL.dim);
    });
    BONFIRE_BUTTONS.forEach(([r, label], j) => g.button(r, label, { selected: this.index === 3 + j }));
    g.text(`Урон ${p.damage}  Здоровье ${p.maxHp}  Силы ${p.maxStamina}`, 22, 248, 8, COL.dim);
    const tr = p.totalReps;
    g.text(`Всего: отжим ${tr.pushup} присед ${tr.squat} звезда ${tr.jack}`, 22, 260, 8, COL.text);
    if (!g.portrait && this.needsCamera) {
      g.cameraWidget();
      g.manualButtons();
    }

    if (this.ritual) {
      const { stat, ex, need, done } = this.ritual;
      g.rect([0, GAME_H - 84, W, 84], "rgba(0,0,0,0.85)");
      g.text(`Ритуал: ${STATS[stat][0]}`, W / 2, GAME_H - 78, 8, COL.dim, "center");
      g.text(`${NAMES[ex]}: ${done} / ${need}`, W / 2, GAME_H - 64, 16, COL.gold, "center");
      g.bar(W / 2 - 150, GAME_H - 40, 300, 8, done / need, "rgb(230,140,50)");
      g.button([W / 2 - 70, GAME_H - 26, 140, 22], "ПРЕРВАТЬ");
    } else if (this.msgT > 0) {
      g.wrap(this.message, 76).forEach((l, i) => g.text(l, W / 2, GAME_H - 36 + i * 12, 8, COL.gold, "center"));
    }
  }
}

// ------------------------------------------------------------------ Бой
/** Враг волны: скелет, разбойник или босс локации (Костяной Рыцарь / Глава разбойников). */
class Skeleton {
  static NAMES = { skeleton: "Скелет-страж", bandit: "Разбойник", knight: "Костяной Рыцарь", chief: "Глава разбойников" };

  constructor(wave) {
    this.wave = wave;
    this.kind = enemyKind(wave);
    this.boss = this.kind === "knight" || this.kind === "chief";
    this.name = Skeleton.NAMES[this.kind];
    // баланс под обычного человека без спортивной подготовки
    const baseHp = 50 + 15 * (wave - 1);
    const baseDmg = 12 + 2 * (wave - 1);
    this.windupTime = Math.max(1.6, 2.3 - 0.04 * wave); // время на реакцию (присед)
    this.maxPoise = 3;
    this.comboChance = wave >= 4 ? 0.25 : 0;
    this.maxCombo = 1;
    this.maxHp = baseHp;
    this.damage = baseDmg;
    this.steal = 0; // сколько пепла крадёт удар
    this.potion = false; // глава разбойников один раз пьёт зелье
    this.homeX = 200;
    if (this.kind === "bandit") { // быстрый и хлипкий, крадёт пепел
      this.maxHp = Math.floor(baseHp * 0.8);
      this.damage = Math.floor(baseDmg * 0.9);
      this.windupTime = Math.max(1.5, this.windupTime * 0.9);
      this.comboChance = 0.35;
      this.steal = 10 + wave;
    } else if (this.kind === "knight") {
      this.maxHp = Math.floor(baseHp * 1.6);
      this.damage = Math.floor(baseDmg * 1.15);
      this.windupTime += 0.3; // тяжёлый двуручник замахивается дольше
      this.maxPoise = 5;
      this.comboChance = 0.4; // серии до трёх ударов
      this.maxCombo = 2;
      this.homeX = 188;
    } else if (this.kind === "chief") {
      this.maxHp = Math.floor(baseHp * 1.6);
      this.damage = Math.floor(baseDmg * 0.75); // бьёт всегда дважды, поэтому каждый удар слабее
      this.maxPoise = 5;
      this.comboChance = 0.7; // две сабли — чаще всего двойной удар
      this.steal = 20 + 2 * wave;
      this.potion = true;
      this.homeX = 184;
    }
    this.hp = this.maxHp;
    this.poise = this.maxPoise;
    this.state = "idle";
    this.timer = rand(1.5, 2.5);
    this.flash = 0;
    this.comboLeft = 0;
    this.enraged = false;
    this.drinkHits = 0;
    this.x = this.homeX;
  }
  set(state, timer) {
    this.state = state;
    this.timer = timer;
  }
  recoverTime() {
    return RECOVER_TIME * (this.enraged ? 0.8 : 1);
  }
}

const DRINK_TIME = 2.5; // сколько глава разбойников пьёт зелье
const DRINK_HITS = 3; // ударов, чтобы выбить зелье
const READY_TIME = 4; // секунд на то, чтобы отойти от телефона
const RECOVER_TIME = 1.6; // окно для удара после атаки скелета
const ABSENT_PAUSE = 1.0; // пауза, если игрока нет в кадре дольше этого

class BattleScene extends Scene {
  constructor(game) {
    super(game);
    this.manual = true;
    const p = game.player;
    this.HERO_X = 86;
    this.enemy = new Skeleton(p.wave);
    this.location = locationFor(p.wave);
    this.newLand = p.wave === CASTLE_FROM_WAVE; // первый бой на новой земле
    // Здоровье и зелья переносятся между боями до отдыха у костра
    const run = game.run || { hp: p.maxHp, estus: p.estusMax };
    this.hp = Math.min(run.hp, p.maxHp);
    this.estus = Math.min(run.estus, p.estusMax);
    this.stamina = p.maxStamina;
    this.action = "idle";
    this.actionT = 0;
    this.invuln = 0;
    this.regenPause = 0;
    this.hurtT = 0;
    this.texts = [];
    this.result = null;
    this.resultT = 0;
    this.reward = [0, 0, 0]; // пепел, алые, синие
    this.ready = READY_TIME;
    this.absentT = 0;
    this.paused = false;
    this.torchL = new Particles(64, 58, 8, 2);
    this.torchR = new Particles(256, 58, 8, 2);
    this.slashT = 0;
    this.bladeEmbers = new Particles(0, 0, 14, 2);
    this.aura = new SwordAura();
    this.hitFx = new HitFx();
    this.victory = null;
  }
  get needsCamera() {
    return true;
  }

  /** Где сейчас стоит герой (верхний левый угол спрайта) и в какой он позе. */
  heroPose() {
    const hx = this.HERO_X + (this.action === "attack" ? 10 : this.action === "dodge" ? -6 : 0);
    const pose = this.result === "dead" || this.hurtT > 0 ? "hurt" : this.action;
    return [hx, GROUND_ARENA - 32, pose];
  }

  float(text, x, y, color, size = 16) {
    this.texts.push({ text, x, y, color, size, ttl: 1 });
  }

  saveRun() {
    this.game.run = { hp: this.hp, estus: this.estus };
  }

  act(move) {
    const p = this.game.player, en = this.enemy;
    if (move === "pushup") {
      if (this.stamina < p.attackCost) return this.float("Нет сил!", this.HERO_X + 10, 90, COL.green, 8);
      this.stamina -= p.attackCost;
      this.regenPause = 0.6;
      this.action = "attack";
      this.actionT = 0.35;
      this.slashT = SLASH_TIME;
      const crit = en.state === "recover";
      let dmg = p.damage;
      if (crit) dmg = Math.floor(dmg * p.critMult);
      else if (en.kind === "knight") dmg = Math.floor(dmg * 0.7); // латы рыцаря: вне окна уязвимости гасят 30% урона
      en.hp -= dmg;
      en.flash = 0.15;
      this.game.shake = 0.12;
      crit ? sfx.crit() : sfx.hit();
      const label = crit ? `${dmg} КРИТ!` : en.kind === "knight" ? `${dmg} БРОНЯ` : `${dmg}`;
      this.float(label, en.x + 12, 90, crit ? COL.gold : COL.text);
      const hit = this.game.style("hit");
      if (hit) { // купленный эффект удара
        const cx = { knight: 30, chief: 28 }[en.kind] || 12, cy = en.boss ? 24 : 18;
        this.hitFx.spawn(hit, Math.round(en.x) + cx, GROUND_ARENA - cy);
        hit === "hit_storm" ? sfx.thunder() : sfx.souls();
      }
      if (p.lifesteal && this.hp < p.maxHp) this.hp = Math.min(p.maxHp, this.hp + p.lifesteal);
      if (en.state === "windup") {
        en.poise -= 1;
        if (en.poise <= 0) {
          en.comboLeft = 0;
          en.set("recover", en.recoverTime());
          this.float("ПРЕРВАН!", en.x + 12, 74, COL.gold);
        }
      }
      if (en.state === "drink" && ++en.drinkHits >= DRINK_HITS) {
        en.set("recover", en.recoverTime());
        this.float("ЗЕЛЬЕ ВЫБИТО!", en.x + 12, 60, COL.gold);
        sfx.crit();
      }
      if (en.kind === "knight" && !en.enraged && en.hp > 0 && en.hp <= en.maxHp / 2) {
        en.enraged = true; // ярость: быстрее замах, короче окно уязвимости
        en.windupTime *= 0.85;
        this.float("ЯРОСТЬ!", en.x + 12, 60, "rgb(255,60,40)");
      }
      if (en.potion && en.hp > 0 && en.hp <= en.maxHp / 2 && en.state !== "windup") {
        en.potion = false; // глава разбойников тянется к зелью — выбей его ударами
        en.drinkHits = 0;
        en.set("drink", DRINK_TIME);
        this.float("ПЬЁТ ЗЕЛЬЕ!", en.x + 12, 60, "rgb(255,90,90)");
      }
      if (en.hp <= 0) this.win();
    } else if (move === "squat_down" || move === "pushup_down") {
      // Уворот бесплатный: приседать/опускаться можно сколько угодно.
      // Если уже идёт замах — игрок пригнулся заранее и защищён до самого удара.
      this.action = "dodge";
      this.actionT = 0.9;
      const untilStrike = en.state === "windup" ? en.timer + 0.25 : 0;
      this.invuln = Math.max(this.invuln, 0.9, untilStrike);
      sfx.dodge();
    } else if (move === "jack") {
      if (this.estus <= 0) return this.float("Зелья кончились", this.HERO_X + 10, 90, COL.dim, 8);
      if (this.hp >= p.maxHp) return this.float("Здоровье полное", this.HERO_X + 10, 90, COL.dim, 8);
      this.estus -= 1;
      const heal = Math.floor(p.maxHp * 0.45);
      this.hp = Math.min(p.maxHp, this.hp + heal);
      this.action = "heal";
      this.actionT = 0.8;
      sfx.heal();
      this.float(`+${heal}`, this.HERO_X + 10, 90, "rgb(255,170,60)");
    }
  }

  win() {
    const p = this.game.player, en = this.enemy;
    en.set("dead", 0);
    this.result = "won";
    this.resultT = 0;
    let [ash, red, blue] = rewards(en.wave);
    if (p.lostSouls && p.lostAtWave === en.wave) {
      ash += p.lostSouls;
      p.lostSouls = 0;
    }
    p.souls += ash;
    p.redGems += red;
    p.blueGems += blue;
    this.reward = [ash, red, blue];
    p.wave += 1;
    if (en.boss) p.bossesDefeated += 1;
    p.save();
    this.saveRun();
    this.game.recordProgress();
    const style = this.game.style("victory");
    if (style) { // купленное оформление победы
      this.victory = new VictoryFx(style);
      style === "win_crown" ? sfx.fanfare() : sfx.pyre();
    } else {
      sfx.win();
    }
    if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
  }

  die() {
    const p = this.game.player;
    this.result = "dead";
    this.resultT = 0;
    p.lostSouls = p.souls;
    p.lostAtWave = p.wave;
    p.souls = 0;
    p.save();
    this.game.run = null; // возрождение у костра с полным здоровьем
    sfx.die();
  }

  handle(moves) {
    const g = this.game;
    if (this.result) {
      if (this.resultT < 1) return;
      // Звёздочка — следующий бой без подхода к телефону; касание/Enter — к костру
      if (this.result === "won" && moves.includes("jack")) return g.change(new BattleScene(g));
      if (g.taps.length || g.key("Enter", " ", "Escape") || (this.result === "dead" && moves.includes("jack"))) {
        g.taps.length = 0;
        g.change(new BonfireScene(g));
      }
      return;
    }
    if (g.key("Escape") || g.tapped([12, GAME_H - 30, 104, 22])) {
      this.saveRun();
      return g.change(new BonfireScene(g));
    }
    if (this.ready > 0 || this.paused) return;
    for (const m of moves) if (m !== "squat") this.act(m); // в бою важен сам момент приседа
  }

  update(dt) {
    const g = this.game, p = g.player, en = this.enemy;
    this.torchL.update(dt);
    this.torchR.update(dt);
    this.bladeEmbers.update(dt);
    this.slashT = Math.max(0, this.slashT - dt);
    for (const ft of this.texts) {
      ft.y -= 18 * dt;
      ft.ttl -= dt;
    }
    this.texts = this.texts.filter((ft) => ft.ttl > 0);
    en.flash = Math.max(0, en.flash - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    const [hx, hy, pose] = this.heroPose();
    this.aura.update(dt, this.game.skin, pose, hx, hy);
    this.hitFx.update(dt);
    if (this.result) {
      this.resultT += dt;
      if (this.victory) this.victory.update(dt);
      return;
    }
    // С камерой: бой ждёт, пока игрок встанет в кадр, и замирает, если он вышел
    const d = g.motion.ok ? g.motion.detector : null;
    const present = !d || d.posture !== "нет человека";
    this.absentT = present ? 0 : this.absentT + dt;
    this.paused = !!d && this.absentT > ABSENT_PAUSE;
    if (this.paused) return;
    if (this.ready > 0) {
      const before = Math.ceil(this.ready);
      if (present) this.ready -= dt;
      if (Math.ceil(this.ready) !== before && this.ready > 0) sfx.warn();
      return;
    }

    this.actionT -= dt;
    if (this.actionT <= 0) this.action = "idle";
    this.invuln = Math.max(0, this.invuln - dt);
    if ((d && d.low) || g.manualLow) { // пока игрок внизу — удар проходит над ним, герой в присяде
      this.invuln = Math.max(this.invuln, 0.15);
      this.action = "dodge";
      this.actionT = Math.max(this.actionT, 0.1);
    }
    this.regenPause -= dt;
    if (this.regenPause <= 0) this.stamina = Math.min(p.maxStamina, this.stamina + p.staminaRegen * dt);

    // ИИ скелета: ожидание -> замах (окно для приседа) -> удар -> уязвимость
    en.timer -= dt;
    if (en.state === "idle" && en.timer <= 0) {
      en.poise = en.maxPoise;
      en.comboLeft = 0;
      for (let i = 0; i < en.maxCombo; i++) if (Math.random() < en.comboChance) en.comboLeft += 1;
      en.set("windup", en.windupTime);
      sfx.alert();
    } else if (en.state === "windup" && en.timer <= 0) {
      en.set("attack", 0.35);
      this.resolveHit();
    } else if (en.state === "attack" && en.timer <= 0) {
      if (en.comboLeft > 0) {
        en.comboLeft -= 1; // следующий, более быстрый замах сразу после удара
        en.set("windup", en.windupTime * 0.85);
        this.float("ЕЩЁ УДАР!", en.x + 12, 70, "rgb(255,120,60)", 8);
        sfx.alert();
      } else {
        en.set("recover", en.recoverTime());
      }
    } else if (en.state === "recover" && en.timer <= 0) {
      en.set("idle", rand(1.6, 3));
    } else if (en.state === "drink" && en.timer <= 0) {
      const heal = Math.floor(en.maxHp * 0.2);
      en.hp = Math.min(en.maxHp, en.hp + heal);
      this.float(`+${heal} ЗЕЛЬЕ`, en.x + 12, 70, "rgb(120,220,120)");
      en.enraged = true; // подлечился и озверел
      en.windupTime *= 0.9;
      en.set("idle", 1);
    }
    const target = en.state === "attack" ? this.HERO_X + 30 : en.homeX;
    en.x += (target - en.x) * Math.min(1, dt * (en.state === "attack" ? 18 : 5));
  }

  resolveHit() {
    const en = this.enemy;
    if (this.invuln > 0) {
      sfx.dodge();
      return this.float("УВОРОТ!", this.HERO_X + 10, 80, "rgb(140,200,255)");
    }
    const dmg = Math.round(en.damage * this.game.player.damageTakenMult);
    this.hp -= dmg;
    this.hurtT = 0.3;
    this.game.shake = en.boss ? 0.4 : 0.3;
    sfx.hurt();
    if (navigator.vibrate) navigator.vibrate(en.boss ? 250 : 150);
    this.float(`-${dmg}`, this.HERO_X + 10, 86, COL.red);
    const p = this.game.player;
    if (en.steal && p.souls > 0) { // разбойники крадут пепел
      const stolen = Math.min(p.souls, en.steal);
      p.souls -= stolen;
      this.float(`-${stolen} пепла`, this.HERO_X + 10, 72, "rgb(200,170,120)", 8);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  draw(c) {
    const t = this.game.time, en = this.enemy;
    if (this.location === 1) {
      c.drawImage(IMG.arena_bg, 0, 0);
      for (const tx of [60, 252]) c.drawImage(anim("torch", t, 8, 4), tx, 56);
      this.torchL.draw(c);
      this.torchR.draw(c);
    } else {
      c.drawImage(IMG.castle_bg, 0, 0);
    }

    let spr;
    const kind = { skeleton: "skeleton", bandit: "bandit", knight: "boss", chief: "chief" }[en.kind];
    if (en.state === "drink") spr = anim("chief_drink", t, 4, 2);
    else if (en.state === "dead") spr = IMG[`${kind}_dead_0`];
    else if (en.flash > 0) spr = IMG[`${kind}_hurt_0`];
    else if (en.state === "windup") spr = anim(`${kind}_windup`, t, 8, 2);
    else if (en.state === "attack") spr = IMG[`${kind}_attack_0`];
    else if (en.boss && en.enraged) spr = anim(`${kind}_enraged`, t, 1.5, 2);
    else spr = anim(`${kind}_idle`, t, 1.5, 2);
    const ex = Math.round(en.x) - (en.state === "attack" ? 8 : 0);
    c.drawImage(spr, ex, GROUND_ARENA - spr.height);

    const p = this.game.player;
    const skin = this.game.skin;
    const hero = heroSprite(p.sword, p.owned, skin); // меч (или его облик) и облик по реликвиям
    if (this.result === "dead") spr = IMG[`${hero}_dead_0`];
    else if (this.hurtT > 0) spr = IMG[`${hero}_hurt_0`];
    else if (this.action === "idle") spr = anim(`${hero}_idle`, t, 1.5, 2);
    else spr = IMG[`${hero}_${this.action}_0`];
    const hx = this.HERO_X + (this.action === "attack" ? 10 : this.action === "dodge" ? -6 : 0);
    if (this.action === "dodge") {
      c.globalAlpha = 0.3;
      c.drawImage(spr, hx + 8, GROUND_ARENA - spr.height);
      c.globalAlpha = 1;
    }
    c.drawImage(spr, hx, GROUND_ARENA - spr.height);
    const [, hy, pose] = this.heroPose();
    this.aura.draw(c, skin, pose, hx, hy, t);
    if (this.slashT > 0) drawSlash(c, hx + 34, GROUND_ARENA - 19, p.sword, 1 - this.slashT / SLASH_TIME, skin); // след удара
    this.hitFx.draw(c);
    if (p.sword === "ash" && !skin) { // раскалённый клинок искрит
      [this.bladeEmbers.x, this.bladeEmbers.y] = this.action === "attack" ? [hx + 30, GROUND_ARENA - 20] : [hx + 20, GROUND_ARENA - 10];
      this.bladeEmbers.draw(c);
    }

    if (en.state === "windup") {
      const k = Math.max(0, Math.min(1, 1 - en.timer / en.windupTime));
      c.strokeStyle = `rgba(200,20,20,${(40 + 80 * k) / 255})`;
      c.lineWidth = 6;
      c.strokeRect(3, 3, CW - 6, CH - 6);
    }
  }

  drawUi() {
    const g = this.game, p = g.player, en = this.enemy;
    this.hitFx.drawFlash(g.ctx, W, GAME_H);
    g.bar(16, 16, Math.floor(p.maxHp * 1.4), 8, this.hp / p.maxHp, COL.red);
    g.bar(16, 28, Math.floor(p.maxStamina * 1.6), 6, this.stamina / p.maxStamina, COL.green);
    for (let i = 0; i < p.estusMax; i++) {
      g.rect([15 + i * 12, 39, 10, 14], COL.shadow);
      g.rect([16 + i * 12, 42, 8, 10], i < this.estus ? "rgb(240,150,50)" : "rgb(60,50,50)");
      g.rect([18 + i * 12, 40, 4, 2], "rgb(140,120,100)");
    }
    if (!g.portrait) {
      g.cameraWidget();
      g.manualButtons();
    }

    if (en.boss) { // полоска босса — в золотой рамке
      g.ctx.strokeStyle = COL.gold;
      g.ctx.strokeRect(137.5, GAME_H - 34.5, 345, 11);
      const extra = en.state === "drink" ? ` - ЗЕЛЬЕ ${en.drinkHits}/${DRINK_HITS}` : en.enraged ? " - ЯРОСТЬ" : "";
      g.text(`БОСС: ${en.name} #${en.wave}${extra}`, 140, GAME_H - 48, 8, en.enraged || en.state === "drink" ? "rgb(255,120,80)" : COL.gold);
    } else {
      g.text(`${en.name} #${en.wave}`, 140, GAME_H - 46, 8);
    }
    g.bar(140, GAME_H - 32, 340, 8, Math.max(0, en.hp) / en.maxHp, "rgb(150,20,20)");
    g.text(`Пепел: ${p.souls}`, W - 12, GAME_H - 16, 8, COL.gold, "right");
    g.gems(W - 12, GAME_H - 32, p, "right");
    g.button([12, GAME_H - 30, 104, 22], "< КОСТЁР");

    [["J", "ОТЖИМАНИЕ", "удар"], ["K", "ПРИСЕД/ВНИЗ", "уворот"], ["L", "ЗВЕЗДОЧКА", "зелье"]]
      .forEach(([k, a, b], i) => g.text(`[${k}] ${a}: ${b}`, 16, 62 + i * 12, 8, COL.dim));
    g.text("K держать: остаться внизу", 16, 98, 8, "rgb(110,100,100)");

    const plank = g.motion.ok && g.motion.detector.posture === "планка";
    if (this.paused) {
      g.rect([0, GAME_H / 2 - 30, W, 60], "rgba(0,0,0,0.75)");
      g.text("ПАУЗА: ВСТАНЬТЕ В КАДР", W / 2, GAME_H / 2 - 12, 16, COL.gold, "center");
      g.text("Камера не видит вас, скелет ждёт", W / 2, GAME_H / 2 + 10, 8, COL.dim, "center");
    } else if (this.ready > 0) {
      const tips = {
        knight: "Латы держат удары: бей в окно уязвимости",
        chief: "Крадёт пепел. На половине здоровья пьёт зелье: выбей 3 ударами",
        bandit: "Быстрый удар и крадёт пепел: не пропускай",
      };
      if (this.newLand) g.text("НОВАЯ ЗЕМЛЯ: ПОДСТУПЫ К ЗАМКУ", W / 2, 44, 8, "rgb(150,200,140)", "center");
      if (en.boss) g.text(`БОСС: ${en.name.toUpperCase()}`, W / 2, 34, 16, "rgb(255,90,60)", "center");
      if (tips[en.kind]) g.text(tips[en.kind], W / 2, 140, 8, COL.dim, "center");
      g.text("ПРИГОТОВЬТЕСЬ", W / 2, 60, 16, COL.gold, "center");
      g.text(`${Math.ceil(this.ready)}`, W / 2, 84, 32, COL.text, "center");
      g.text("Отойдите, чтобы тело было в кадре", W / 2, 124, 8, COL.dim, "center");
    } else if (en.state === "windup" && !this.result) {
      const k = Math.max(0, Math.min(1, en.timer / en.windupTime));
      const pulse = 0.5 + 0.5 * Math.sin(g.time * 14);
      g.text(plank ? "ОПУСТИСЬ!" : "ПРИСЕДАЙ!", W / 2, 56, 32, `rgb(255,${Math.floor(60 + 120 * pulse)},40)`, "center");
      g.bar(W / 2 - 80, 96, 160, 5, k, "rgb(255,90,50)");
      const top = GROUND_ARENA - ({ knight: 58, chief: 56 }[en.kind] || 44);
      g.text("!", Math.round(en.x + ({ knight: 30, chief: 28 }[en.kind] || 12)) * 2, 2 * top, 24, "rgb(255,200,60)", "center");
    } else if (en.state === "recover" && !this.result) {
      g.text("Окно для удара: ОТЖИМАЙСЯ!", W / 2, 70, 8, COL.gold, "center");
    } else if (en.state === "drink" && !this.result) {
      g.text(`ВЫБЕЙ ЗЕЛЬЕ! ${en.drinkHits}/${DRINK_HITS}`, W / 2, 60, 16, "rgb(255,120,90)", "center");
      g.bar(W / 2 - 80, 86, 160, 5, en.timer / DRINK_TIME, "rgb(120,220,120)");
    }

    for (const ft of this.texts) g.text(ft.text, Math.round(ft.x * 2), Math.round(ft.y * 2), ft.size, ft.color, "center");

    if (this.result === "won" && this.victory) {
      const [ash, red, blue] = this.reward;
      this.victory.draw(g.ctx, (ctx, ...a) => g.text(a[0], a[1], a[2], a[3], a[4], a[5], a[6] ?? true, ctx), {
        title: en.boss ? "БОСС ПОВЕРЖЕН" : "ВРАГ ПОВЕРЖЕН",
        loot: `+${ash} пепла  +${red} алых${blue ? `  +${blue} синий` : ""}`,
        hint: "Звёздочка: следующий бой. Касание: к костру",
      });
    } else if (this.result) {
      g.rect([0, GAME_H / 2 - 45, W, 90], `rgba(0,0,0,${Math.min(0.8, this.resultT * 1.2)})`);
      if (this.result === "dead") {
        g.text("ВЫ ПОГИБЛИ", W / 2, GAME_H / 2 - 28, 32, "rgb(170,20,20)", "center");
        g.text("Пепел остался на месте гибели: победите", W / 2, GAME_H / 2 + 14, 8, COL.dim, "center");
        g.text("этого скелета, чтобы вернуть его. Касание: к костру", W / 2, GAME_H / 2 + 26, 8, COL.dim, "center");
      } else {
        const [ash, red, blue] = this.reward;
        g.text(en.boss ? "БОСС ПОВЕРЖЕН" : "ВРАГ ПОВЕРЖЕН", W / 2, GAME_H / 2 - 28, 32, COL.gold, "center");
        g.text(`+${ash} пепла  +${red} алых${blue ? `  +${blue} синий` : ""}`, W / 2, GAME_H / 2 + 12, 8, COL.gold, "center");
        g.text("Звёздочка: следующий бой. Касание: к костру", W / 2, GAME_H / 2 + 26, 8, COL.text, "center");
      }
    }
  }
}

// ------------------------------------------------------------------ Кузница
const SHOP_ROWS = [...SHOP_ORDER, "back"];
const shopRect = (i) => [18, 48 + i * 40, 384, i === SHOP_ORDER.length ? 26 : 36];

/** Мечи за алые камни, уникальное снаряжение за синие (с боссов). */
class ShopScene extends Scene {
  constructor(game) {
    super(game);
    this.index = 0;
    this.embers = new Particles(300, 120, 10);
    this.previewEmbers = new Particles(548, 236, 16, 6); // искры пепельного клинка в превью
    this.say("Алые камни дают за каждого врага, синие за боссов.", 4);
  }
  say(msg, t = 3) {
    this.message = msg;
    this.msgT = t;
  }
  choose(key) {
    const g = this.game, p = g.player, it = item(key);
    if (key === "back") return g.change(new BonfireScene(g));
    if (p.owned.includes(key)) {
      if (SWORDS[key]) {
        p.equip(key);
        this.say(`Надет: ${it.name}`);
      } else {
        this.say(`${it.name} уже действует`);
      }
    } else if (p.buy(key)) {
      sfx.level();
      this.say(`Куплено: ${it.name}!${SWORDS[key] ? " Меч надет." : ""}`);
    } else {
      const [red, blue] = it.price;
      return this.say(`Не хватает камней: нужно ${blue ? `${blue} синих` : `${red} алых`}`);
    }
    p.save();
  }
  handle() {
    const g = this.game, n = SHOP_ROWS.length;
    if (g.key("Escape")) return g.change(new BonfireScene(g));
    if (g.key("ArrowUp")) this.index = (this.index + n - 1) % n;
    if (g.key("ArrowDown")) this.index = (this.index + 1) % n;
    const activate = (i) => {
      sfx.click();
      this.index = i;
      this.choose(SHOP_ROWS[i]);
    };
    if (g.key("Enter", " ")) return activate(this.index);
    SHOP_ROWS.forEach((_, i) => { if (g.tapped(shopRect(i))) activate(i); });
  }
  update(dt) {
    this.embers.update(dt);
    this.previewEmbers.update(dt);
    this.msgT -= dt;
  }
  draw(c) {
    c.drawImage(IMG.arena_bg, 0, 0);
    c.fillStyle = "rgba(0,0,0,0.43)";
    c.fillRect(0, 0, CW, CH);
    c.drawImage(anim("bonfire", this.game.time, 8, 4), 292, GROUND_ARENA - 22); // горн
    this.embers.draw(c);
  }
  drawUi() {
    const g = this.game, p = g.player;
    g.rect([10, 10, 400, 340], "rgba(10,6,14,0.85)");
    g.ctx.strokeStyle = "rgb(90,64,50)";
    g.ctx.strokeRect(10.5, 10.5, 399, 339);
    g.text("КУЗНИЦА", 22, 20, 16, COL.gold);
    g.gems(400, 24, p, "right");
    SHOP_ROWS.forEach((key, i) => {
      const r = shopRect(i), sel = this.index === i;
      if (key === "back") return g.button(r, "НАЗАД К КОСТРУ", { selected: sel });
      const it = item(key);
      let status, scol;
      if (p.owned.includes(key)) {
        if (p.sword === key) [status, scol] = ["НАДЕТ", COL.gold];
        else [status, scol] = SWORDS[key] ? ["ВЗЯТЬ", COL.text] : ["ЕСТЬ", COL.gold];
      } else {
        status = priceText(key);
        scol = it.price[1] ? "rgb(130,170,255)" : "rgb(240,110,110)";
        if (!p.canAfford(key)) scol = it.price[1] ? "rgb(65,85,128)" : "rgb(120,55,55)";
      }
      g.button(r, "", { selected: sel });
      g.text(it.name, r[0] + 8, r[1] + 7, 8, it.unique ? "rgb(150,190,255)" : sel ? COL.gold : COL.text);
      g.text(it.desc, r[0] + 8, r[1] + 21, 8, COL.dim);
      g.text(status, r[0] + r[2] - 8, r[1] + 14, 8, scol, "right");
    });
    // крупное превью героя; на непокупленной вещи — примерка
    const key = SHOP_ROWS[this.index];
    const sword = SWORDS[key] ? key : p.sword;
    const owned = RELICS[key] ? [...p.owned, key] : p.owned;
    const hero = anim(`${heroSprite(sword, owned)}_idle`, g.time, 1.5, 2);
    g.ctx.drawImage(hero, 470, 2 * GROUND_ARENA - 128, 96, 128);
    if (key !== "back" && !p.owned.includes(key)) g.text("ПРИМЕРКА", 518, 2 * GROUND_ARENA - 144, 8, "rgb(120,220,255)", "center");
    if (sword === "ash") this.previewEmbers.draw(g.ctx);
    const w = p.weapon;
    g.text(w.name, W - 12, 20, 8, COL.text, "right");
    g.text(`урон ${p.damage} крит x${w.crit}`, W - 12, 34, 8, COL.dim, "right");
    g.text(`удар ${w.cost} сил`, W - 12, 46, 8, COL.dim, "right");
    const relics = Object.keys(RELICS).filter((k) => p.owned.includes(k)).map((k) => RELICS[k].name);
    relics.forEach((name, i) => g.text(name, W - 12, 62 + i * 12, 8, "rgb(150,190,255)", "right"));
    if (this.msgT > 0) g.wrap(this.message, 26).forEach((l, i) => g.text(l, W - 12, GAME_H - 52 + i * 12, 8, COL.gold, "right"));
  }
}

// ------------------------------------------------------------------ Лавка образов (косметика за 1 $)
const COS_LAYOUT = (() => {
  const rows = [];
  let y = 40;
  for (const kind of ["sword", "hit", "victory"]) {
    rows.push({ head: KIND_TITLES[kind], y });
    y += 14;
    for (const item of COSMETICS.filter((c) => c.kind === kind)) {
      rows.push({ item, rect: [12, y, 318, 30] });
      y += 33;
    }
  }
  return rows;
})();
const COS_ITEMS = COS_LAYOUT.filter((r) => r.item);
const COS_PREVIEW = [340, 40, 288, 200];
const COS_ACTION = [340, 322, 288, 26];
const COS_RESTORE = [12, 322, 186, 26];
const COS_BACK = [206, 322, 124, 26];

/** Витрина: живое превью меча, удара по манекену и оформления победы; покупка и «надеть». */
class CosmeticsScene extends Scene {
  constructor(game) {
    super(game);
    this.index = 0;
    this.busy = false;
    this.pc = document.createElement("canvas"); // пиксельная сцена превью 144×100 (×2 на экране)
    this.pc.width = 144;
    this.pc.height = 100;
    this.pctx = this.pc.getContext("2d");
    this.vc = document.createElement("canvas"); // превью победы рисуется в полный экран и уменьшается
    this.vc.width = W;
    this.vc.height = GAME_H;
    this.aura = new SwordAura();
    this.hitFx = new HitFx();
    this.demoT = 0;
    this.msgT = 0;
    this.resetPreview();
  }
  get item() {
    return COS_ITEMS[this.index].item;
  }
  say(msg, t = 3) {
    this.message = msg;
    this.msgT = t;
  }
  resetPreview() {
    this.demoT = 0;
    this.victory = this.item.kind === "victory" ? new VictoryFx(this.item.id) : null;
  }
  select(i) {
    if (i === this.index) return;
    this.index = i;
    sfx.click();
    this.resetPreview();
  }
  async action() {
    const g = this.game, it = this.item;
    if (this.busy) return;
    if (!g.store.owns(it.id)) {
      this.busy = true;
      const bought = await g.store.buy(it);
      this.busy = false;
      if (!bought) return;
      sfx.buy();
      g.profile.style[it.kind] = it.id; // купленное сразу надевается
      g.profile.save();
      return this.say(`Куплено и надето: ${it.name}`, 4);
    }
    const on = g.profile.style[it.kind] === it.id;
    g.profile.style[it.kind] = on ? null : it.id;
    g.profile.save();
    sfx.click();
    this.say(on ? `Снято: ${it.name}` : `Надето: ${it.name}`);
  }
  async restore() {
    const ids = await this.game.store.restore();
    this.say(ids.length ? `Покупки восстановлены: ${ids.length}` : "Покупок пока нет");
  }
  handle() {
    const g = this.game, n = COS_ITEMS.length;
    if (g.key("Escape") || g.tapped(COS_BACK)) return g.change(new TitleScene(g));
    if (g.key("ArrowUp")) this.select((this.index + n - 1) % n);
    if (g.key("ArrowDown")) this.select((this.index + 1) % n);
    if (g.key("Enter", " ") || g.tapped(COS_ACTION)) return this.action();
    if (g.tapped(COS_RESTORE)) return this.restore();
    COS_ITEMS.forEach((r, i) => { if (g.tapped(r.rect)) this.select(i); });
  }
  update(dt) {
    this.msgT -= dt;
    this.demoT += dt;
    // демо: каждые 2,4 с герой бьёт манекен
    const phase = this.demoT % 2.4;
    this.attacking = phase > 1.0 && phase < 1.35;
    if (phase > 1.0 && phase - dt <= 1.0) {
      this.slashT = SLASH_TIME;
      const hit = this.item.kind === "hit" ? this.item.id : this.game.style("hit");
      if (hit) this.hitFx.spawn(hit, 108, 64);
      this.dummyFlash = 0.15;
    }
    this.slashT = Math.max(0, (this.slashT || 0) - dt);
    this.dummyFlash = Math.max(0, (this.dummyFlash || 0) - dt);
    this.aura.update(dt, this.previewSkin, this.attacking ? "attack" : "idle", this.attacking ? 34 : 28, 48);
    this.hitFx.update(dt);
    if (this.victory) {
      this.victory.update(dt);
      if (this.victory.t > 4.5) this.victory = new VictoryFx(this.item.id);
    }
  }
  /** Облик меча в превью: выбранный в списке (примерка) или надетый. */
  get previewSkin() {
    return this.item.kind === "sword" ? this.item.skin : this.game.skin;
  }
  draw(c) {
    c.drawImage(IMG.arena_bg, 0, 0);
    c.fillStyle = "rgba(0,0,0,0.55)";
    c.fillRect(0, 0, CW, CH);
  }
  drawPreview() {
    const g = this.game, p = g.player, c = this.pctx, t = g.time;
    c.imageSmoothingEnabled = false;
    c.drawImage(IMG.arena_bg, 60, 60, 144, 100, 0, 0, 144, 100);
    const skin = this.previewSkin, hs = heroSprite(p.sword, p.owned, skin);
    const pose = this.attacking ? "attack" : "idle", hx = this.attacking ? 34 : 28;
    const dummy = this.dummyFlash > 0 ? IMG.skeleton_hurt_0 : IMG.skeleton_idle_0;
    c.drawImage(dummy, 96, 80 - dummy.height);
    c.drawImage(this.attacking ? IMG[`${hs}_attack_0`] : anim(`${hs}_idle`, t, 1.5, 2), hx, 48);
    this.aura.draw(c, skin, pose, hx, 48, t);
    if (this.slashT > 0) drawSlash(c, hx + 34, 61, p.sword, 1 - this.slashT / SLASH_TIME, skin);
    this.hitFx.draw(c);
    const [x, y, w, h] = COS_PREVIEW;
    g.ctx.drawImage(this.pc, x, y, w, h);
    if (this.victory) {
      const vc = this.vc.getContext("2d");
      vc.clearRect(0, 0, W, GAME_H);
      vc.drawImage(this.pc, 0, 0, W, GAME_H);
      this.victory.draw(vc, (ctx, ...a) => g.text(a[0], a[1], a[2], a[3], a[4], a[5], a[6] ?? true, ctx), {
        title: "БОСС ПОВЕРЖЕН", loot: "+560 пепла  +5 алых  +1 синий", hint: "",
      });
      g.ctx.drawImage(this.vc, x, y, w, h);
    }
    g.ctx.strokeStyle = COL.gold;
    g.ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  }
  drawUi() {
    const g = this.game, it = this.item, owned = g.store.owns(it.id);
    g.text("ЛАВКА ОБРАЗОВ", 14, 14, 16, COL.gold);
    g.text("ТЕСТ: оплата не списывается", W - 12, 18, 8, "rgb(120,220,255)", "right");
    for (const row of COS_LAYOUT) {
      if (row.head) {
        g.text(row.head, 14, row.y + 3, 8, COL.dim);
        continue;
      }
      const ci = COS_ITEMS.indexOf(row), sel = ci === this.index, r = row.rect, c = row.item;
      g.button(r, "", { selected: sel });
      g.rect([r[0] + 6, r[1] + 7, 4, 16], `rgb(${c.color.join(",")})`);
      g.text(c.name, r[0] + 16, r[1] + 6, 8, sel ? COL.gold : COL.text);
      g.text(c.desc, r[0] + 16, r[1] + 18, 8, COL.dim);
      const on = g.profile.style[c.kind] === c.id && g.store.owns(c.id);
      const status = on ? "НАДЕТО" : g.store.owns(c.id) ? "ЕСТЬ" : g.store.price(c.id);
      g.text(status, r[0] + r[2] - 8, r[1] + 11, 8, on ? COL.gold : g.store.owns(c.id) ? COL.text : "rgb(120,220,255)", "right");
    }
    this.drawPreview();
    const [x, y, w, h] = COS_PREVIEW;
    g.text(it.name, x, y + h + 10, 8, `rgb(${it.color.join(",")})`);
    g.text(it.desc, x, y + h + 24, 8, COL.text);
    g.text("Только облик: сила героя не меняется", x, y + h + 38, 8, COL.dim);
    if (this.msgT > 0) g.text(this.message, x, y + h + 56, 8, COL.gold);
    const on = g.profile.style[it.kind] === it.id && owned;
    const label = !owned ? `КУПИТЬ ЗА ${g.store.price(it.id)}` : on ? "СНЯТЬ" : "НАДЕТЬ";
    g.button(COS_ACTION, label, { selected: true, color: owned ? COL.gold : "rgb(120,220,255)" });
    g.button(COS_RESTORE, "ВОССТАНОВИТЬ ПОКУПКИ");
    g.button(COS_BACK, "НАЗАД");
  }
}

// ------------------------------------------------------------------ Рейтинг
const LB_NAME = [12, 322, 250, 26];
const LB_REFRESH = [270, 322, 170, 26];
const LB_BACK = [448, 322, 180, 26];
const LB_ROWS = 10;

/** Рейтинг по побеждённым боссам и уровню. Без сети — сохранённая таблица, игра не ждёт сервер. */
class LeaderboardScene extends Scene {
  constructor(game) {
    super(game);
    this.res = null;
    this.load();
  }
  async load() {
    this.loading = true;
    const g = this.game;
    g.recordProgress();
    try {
      this.res = await g.leaderboard.top(g.profile);
    } finally {
      this.loading = false;
    }
  }
  async rename() {
    const g = this.game;
    const raw = await promptName({
      title: "ИМЯ В РЕЙТИНГЕ",
      text: "2-16 символов: буквы, цифры, пробел. Имя видят другие игроки.",
      value: g.profile.name,
    });
    if (raw == null) return;
    if (!g.profile.rename(raw)) return g.say("Такое имя не подходит");
    g.profile.save();
    g.leaderboard.submit(g.profile);
    this.load();
  }
  handle() {
    const g = this.game;
    if (g.key("Escape") || g.tapped(LB_BACK)) return g.change(new TitleScene(g));
    if (g.tapped(LB_REFRESH) || g.key("Enter")) return this.load();
    if (g.tapped(LB_NAME)) return this.rename();
  }
  draw(c) {
    c.drawImage(IMG.castle_bg, 0, 0);
    c.fillStyle = "rgba(0,0,0,0.62)";
    c.fillRect(0, 0, CW, CH);
  }
  drawUi() {
    const g = this.game, me = g.profile.id;
    g.text("РЕЙТИНГ", 14, 14, 16, COL.gold);
    g.text("по побеждённым боссам, затем по уровню", 14, 36, 8, COL.dim);
    const r = this.res;
    let status = "Загрузка...", scol = COL.dim;
    if (r) {
      if (r.source === "online") [status, scol] = ["Онлайн", "rgb(120,220,120)"];
      else if (r.source === "cache") {
        const when = r.at ? new Date(r.at).toLocaleDateString("ru-RU") : "";
        [status, scol] = [`Нет сети: сохранённая таблица ${when}`.trim(), "rgb(230,180,90)"];
      } else [status, scol] = ["Сервер рейтинга не подключён: показан ваш результат", "rgb(230,180,90)"];
      if (r.pending) status += " · ваш результат отправится при появлении сети";
    }
    g.wrap(status, 76).forEach((line, i) => g.text(line, 14, 290 + i * 12, 8, scol));
    const cols = [[22, "#"], [64, "ИМЯ"], [400, "БОССЫ"], [486, "УР."], [560, "РАУНД"]];
    cols.forEach(([x, h]) => g.text(h, x, 56, 8, COL.dim));
    g.rect([14, 68, W - 28, 1], "rgb(90,64,50)");
    if (r) {
      const rows = r.rows.slice(0, LB_ROWS);
      const mine = r.rows.findIndex((x) => x.player_id === me);
      const show = rows.map((row, i) => [i + 1, row]);
      if (mine >= LB_ROWS || (mine < 0 && r.rank)) {
        show.length = LB_ROWS - 1;
        const own = r.rows[mine] || { name: g.profile.name, ...g.profile.best, player_id: me };
        show.push([r.rank || mine + 1, own]);
      }
      show.forEach(([rank, row], i) => {
        const y = 76 + i * 21, isMe = row.player_id === me;
        if (isMe) g.rect([14, y - 4, W - 28, 19], "rgba(232,190,92,0.18)");
        const col = isMe ? COL.gold : rank <= 3 ? "rgb(255,220,150)" : COL.text;
        g.text(`${rank}`, 22, y, 8, col);
        g.text(row.name, 64, y, 8, col);
        g.text(`${row.bosses}`, 400, y, 8, col);
        g.text(`${row.level}`, 486, y, 8, col);
        g.text(`${row.wave}`, 560, y, 8, col);
      });
    }
    g.button(LB_NAME, `ИМЯ: ${g.profile.name}`);
    g.button(LB_REFRESH, this.loading ? "..." : "ОБНОВИТЬ");
    g.button(LB_BACK, "НАЗАД");
  }
}

// ------------------------------------------------------------------ Камера и советы
class CameraScene extends Scene {
  constructor(game) {
    super(game);
    this.manual = true;
  }
  get needsCamera() {
    return true;
  }

  handle(moves) {
    const g = this.game;
    if (moves.some((m) => m === "pushup" || m === "squat" || m === "jack")) sfx.rep();
    if (g.key("Escape", "Enter") || g.tapped([W / 2 - 60, GAME_H - 30, 120, 22])) g.change(new SettingsScene(g));
    if (!g.motion.ok && !g.motion.starting && g.tapped([20, 300, 200, 24])) g.motion.start();
  }
  draw(c) {
    c.drawImage(IMG.arena_bg, 0, 0);
    c.fillStyle = "rgba(0,0,0,0.6)";
    c.fillRect(0, 0, CW, CH);
  }
  drawUi() {
    const g = this.game, d = g.motion.detector;
    g.text("КАМЕРА И СОВЕТЫ", W / 2, 12, 16, COL.gold, "center");
    const fmt = (v) => (v == null ? "-" : `${Math.round(v)}°`);
    const x = 20;
    g.text(`Статус: ${g.motion.status}`, x, 40, 8);
    g.text(`Поза: ${d.posture}`, x, 54, 8);
    g.text(`Колени ${fmt(d.knee)}  Локти ${fmt(d.elbow)}  Наклон ${fmt(d.tilt)}`, x, 68, 8, COL.dim);
    const counts = g.motion.ok ? d.counts : g.manualCounts;
    ["pushup", "squat", "jack"].forEach((ex, i) => g.text(`${NAMES[ex]}: ${counts[ex]}`, x, 88 + i * 14, 8));
    const tips = [
      "Поставьте телефон на пол, прислонив к стене, и отойдите на 2-3 м.",
      "Отжимания и приседания: встаньте к телефону БОКОМ.",
      "Звёздочка: встаньте ЛИЦОМ, руки поднимайте над головой.",
      "Всё тело должно быть в кадре. Экран не гаснет во время игры.",
      "Без камеры жмите кнопки ОТЖИМ / ПРИСЕД / ЗВЕЗДА.",
    ];
    let y = 140;
    for (const tip of tips) for (const l of g.wrap(tip, g.portrait ? 74 : 56)) { g.text(l, x, y, 8, COL.dim); y += 12; }
    if (!g.motion.ok && !g.motion.starting) g.button([20, 300, 200, 24], "ВКЛЮЧИТЬ КАМЕРУ");
    g.button([W / 2 - 60, GAME_H - 30, 120, 22], "НАЗАД");
    if (!g.portrait) {
      g.cameraWidget();
      g.manualButtons();
    }
  }
}

// ------------------------------------------------------------------ Настройки
const SETTINGS_KEY = "ash-and-iron-settings";
const ALERT_LEVELS = [[0, "ВЫКЛ"], [0.5, "ТИХО"], [1, "НОРМА"], [1.5, "ГРОМКО"]];
const SET_ROWS = [60, 108, 156]; // громкость, сигнал, вибрация
const SET_MINUS = (y) => [300, y, 44, 36];
const SET_PLUS = (y) => [556, y, 44, 36];
const SET_TEST = [40, 204, 260, 34];
const SET_CAMERA = [40, 256, 270, 36];
const SET_SUPPORT = [330, 256, 270, 36];
const SET_BACK = [W / 2 - 90, 308, 180, 34];

class SettingsScene extends Scene {
  set(key, value) {
    const g = this.game;
    g.settings[key] = value;
    saveJSON(SETTINGS_KEY, g.settings);
    setAudio(g.settings);
  }
  handle() {
    const g = this.game, st = g.settings;
    const step = (i, d) => ALERT_LEVELS[Math.max(0, Math.min(ALERT_LEVELS.length - 1, i + d))][0];
    const ai = Math.max(0, ALERT_LEVELS.findIndex(([v]) => v === st.alert));
    if (g.tapped(SET_MINUS(SET_ROWS[0]))) { this.set("volume", Math.max(0, Math.round(st.volume * 10 - 1) / 10)); sfx.click(); }
    if (g.tapped(SET_PLUS(SET_ROWS[0]))) { this.set("volume", Math.min(1, Math.round(st.volume * 10 + 1) / 10)); sfx.click(); }
    if (g.tapped(SET_MINUS(SET_ROWS[1]))) { this.set("alert", step(ai, -1)); sfx.alert(); }
    if (g.tapped(SET_PLUS(SET_ROWS[1]))) { this.set("alert", step(ai, 1)); sfx.alert(); }
    if (g.tapped([300, SET_ROWS[2], 300, 36])) { this.set("vibrate", !st.vibrate); sfx.click(); }
    if (g.tapped(SET_TEST)) sfx.alert();
    if (g.tapped(SET_CAMERA)) return g.change(new CameraScene(g));
    if (g.tapped(SET_SUPPORT)) return g.change(new SupportScene(g));
    if (g.key("Escape") || g.tapped(SET_BACK)) g.change(new TitleScene(g));
  }
  draw(c) {
    c.drawImage(IMG.arena_bg, 0, 0);
    c.fillStyle = "rgba(0,0,0,0.7)";
    c.fillRect(0, 0, CW, CH);
  }
  /** Строка-шкала: подпись, «−», деления, «+». */
  slider(y, label, k, value) {
    const g = this.game;
    g.text(label, 40, y + 12, 12);
    g.button(SET_MINUS(y), "-", { size: 16 });
    g.button(SET_PLUS(y), "+", { size: 16 });
    const segs = 10, x0 = 352, w = 196, sw = w / segs;
    for (let i = 0; i < segs; i++) {
      g.rect([x0 + i * sw + 1, y + 8, sw - 3, 20], i < Math.round(k * segs) ? COL.gold : "rgb(50,36,40)");
    }
    const tw = value.length * 12 + 12; // подложка, чтобы значение читалось поверх делений
    g.rect([x0 + w / 2 - tw / 2, y + 6, tw, 24], "rgba(10,6,14,0.92)");
    g.text(value, x0 + w / 2, y + 12, 12, COL.gold, "center");
  }
  drawUi() {
    const g = this.game, st = g.settings;
    g.text("НАСТРОЙКИ", W / 2, 16, 24, COL.gold, "center");
    this.slider(SET_ROWS[0], "Громкость", st.volume, `${Math.round(st.volume * 100)}%`);
    const al = ALERT_LEVELS.find(([v]) => v === st.alert) || ALERT_LEVELS[2];
    this.slider(SET_ROWS[1], "Сигнал «приседай»", st.alert / 1.5, al[1]);
    g.text("Вибрация (Android)", 40, SET_ROWS[2] + 12, 12);
    g.button([300, SET_ROWS[2], 300, 36], st.vibrate ? "ВКЛ" : "ВЫКЛ", { size: 12, selected: st.vibrate });
    g.button(SET_TEST, "ПРОВЕРИТЬ СИГНАЛ", { size: 12 });
    g.text("Сигнал звучит, когда враг замахнулся", 316, SET_TEST[1] + 13, 8, COL.dim);
    g.button(SET_CAMERA, "Камера и советы", { size: 12 });
    g.button(SET_SUPPORT, "Поддержать проект", { size: 12, color: "rgb(255,150,150)" });
    g.button(SET_BACK, "НАЗАД", { size: 12 });
  }
}

// ------------------------------------------------------------------ Поддержать проект
const TIP_RECTS = TIPS.map((_, i) => [40, 150 + i * 46, 560, 40]);
const TIP_BACK = [W / 2 - 90, 314, 180, 32];
const HEART = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"];

class SupportScene extends Scene {
  constructor(game) {
    super(game);
    this.msgT = 0;
    this.busy = false;
  }
  handle() {
    const g = this.game;
    TIP_RECTS.forEach((r, i) => {
      if (!this.busy && g.tapped(r)) {
        this.busy = true;
        g.store.tip(TIPS[i]).then((ok) => {
          this.busy = false;
          if (!ok) return;
          sfx.fanfare();
          this.msgT = 4;
          this.burst = 1.2;
        });
      }
    });
    if (g.key("Escape") || g.tapped(TIP_BACK)) g.change(new SettingsScene(g));
  }
  update(dt) {
    this.msgT -= dt;
    this.burst = Math.max(0, (this.burst || 0) - dt);
  }
  draw(c) {
    c.drawImage(IMG.title_bg, 0, 0);
    c.fillStyle = "rgba(0,0,0,0.65)";
    c.fillRect(0, 0, CW, CH);
  }
  drawUi() {
    const g = this.game, t = g.time;
    g.text("ПОДДЕРЖАТЬ ПРОЕКТ", W / 2, 14, 24, COL.gold, "center");
    // пиксельное сердце, бьётся сильнее после поддержки
    const px = 6 + Math.round((Math.sin(t * 4) + 1) * 0.5 + (this.burst || 0) * 2);
    const hx = W / 2 - 3.5 * px, hy = 48;
    HEART.forEach((row, y) => [...row].forEach((v, x) => {
      if (v === "1") g.rect([hx + x * px, hy + y * px, px, px], y < 2 && x > 0 && x < 3 ? "rgb(255,150,150)" : "rgb(200,40,50)");
    }));
    const text = "Игра бесплатна: без рекламы и без платной силы. Если Ash & Iron помогает вам тренироваться, поддержите разработку.";
    g.wrap(text, 70).forEach((l, i) => g.text(l, W / 2, 98 + i * 14, 8, COL.text, "center"));
    TIPS.forEach((tip, i) => {
      const r = TIP_RECTS[i];
      g.button(r, "", { selected: i === 0 });
      g.text(tip.name, r[0] + 16, r[1] + 8, 12, COL.gold);
      g.text(tip.desc, r[0] + 16, r[1] + 26, 8, COL.dim);
      g.text(tip.price, r[0] + r[2] - 16, r[1] + 14, 12, "rgb(120,220,255)", "right");
    });
    if (this.msgT > 0) g.text("Спасибо, рыцарь! Костёр горит ярче.", W / 2, 292, 8, COL.gold, "center");
    else if (g.store.tips > 0) g.text(`Вы поддержали проект: ${g.store.tips} раз. Спасибо!`, W / 2, 292, 8, "rgb(255,150,150)", "center");
    g.button(TIP_BACK, "НАЗАД", { size: 12 });
  }
}

// ------------------------------------------------------------------ Запуск
export async function boot() {
  const canvas = document.getElementById("game");
  const gate = document.getElementById("gate");
  const gateStatus = document.getElementById("gate-status");
  try {
    await Promise.all([loadImages(), document.fonts.load(`16px ${FONT}`, "АБВ")]);
  } catch (e) {
    gateStatus.textContent = "Не удалось загрузить графику. Обновите страницу.";
    return;
  }
  gateStatus.textContent = "";
  gate.classList.add("ready");

  const start = async (useCamera) => {
    gate.hidden = true;
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    } catch (e) { /* iOS Safari не умеет — не страшно */ }
    initAudio();
    // Экран не гаснет на тренировке; после сворачивания блокировку нужно взять заново
    const lockScreen = async () => {
      try {
        if (navigator.wakeLock && document.visibilityState === "visible") await navigator.wakeLock.request("screen");
      } catch (e) { /* не поддерживается */ }
    };
    lockScreen();
    document.addEventListener("visibilitychange", lockScreen);
    const game = new Game(canvas, useCamera);
    window.game = game; // для отладки и автотестов
    game.change(new TitleScene(game));
    if (useCamera) game.motion.start();
    else game.motion.status = "камера выключена: используйте кнопки";
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.max(0, Math.min((now - last) / 1000, 0.05)); // первый кадр rAF бывает «из прошлого»
      last = now;
      game.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };
  document.getElementById("start-camera").onclick = () => start(true);
  document.getElementById("start-manual").onclick = () => start(false);
}

export { BattleScene, BonfireScene, CameraScene, CosmeticsScene, LeaderboardScene, SettingsScene, ShopScene, SupportScene, TitleScene };
