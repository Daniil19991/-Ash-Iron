// Косметика за 1 $: облик меча с анимацией, эффекты удара и оформление побед.
// Только внешний вид — на силу персонажа не влияет (честный free-to-play).

export const COSMETICS = [
  { id: "sword_void", kind: "sword", skin: "void", name: "Клинок Бездны", desc: "обсидиан, живые руны, шлейф тьмы", color: [180, 90, 255] },
  { id: "sword_sun", kind: "sword", skin: "sun", name: "Клинок Рассвета", desc: "золото, сияние и искры", color: [255, 214, 96] },
  { id: "sword_frost", kind: "sword", skin: "frost", name: "Ледяной Клык", desc: "кристалл, иней и снегопад", color: [150, 220, 255] },
  { id: "hit_storm", kind: "hit", name: "Гнев грозы", desc: "молния в каждый удар", color: [150, 230, 255] },
  { id: "hit_souls", kind: "hit", name: "Призраки павших", desc: "души вырываются из врага", color: [190, 170, 255] },
  { id: "win_crown", kind: "victory", name: "Королевский триумф", desc: "корона, лучи и золото", color: [255, 200, 90] },
  { id: "win_pyre", kind: "victory", name: "Синее пламя", desc: "костёр душ и рой искр", color: [120, 180, 255] },
];
export const COSMETIC = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
export const KIND_TITLES = { sword: "ОБЛИК МЕЧА", hit: "ЭФФЕКТ УДАРА", victory: "ОФОРМЛЕНИЕ ПОБЕДЫ" };

const rand = (a, b) => a + Math.random() * (b - a);
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

// ------------------------------------------------------------------ Облик меча
// Геометрия клинка на спрайте героя 32×32 (см. art.compose_hero): в стойке клинок вертикален
// по x=20, в выпаде — горизонтален по y=13. Длины — по картам мечей в game/art.py.
const BLADE_LEN = { void: 17, sun: 17, frost: 16 };
const SKIN = {
  void: { glow: [170, 80, 255], hi: [240, 200, 255], parts: [[190, 100, 255], [120, 50, 200], [50, 20, 80]] },
  sun: { glow: [255, 200, 80], hi: [255, 255, 230], parts: [[255, 240, 170], [255, 200, 80], [230, 130, 40]] },
  frost: { glow: [130, 210, 255], hi: [255, 255, 255], parts: [[255, 255, 255], [200, 235, 255], [140, 200, 255]] },
};

export function bladePoints(skin, pose, hx, hy) {
  const len = BLADE_LEN[skin];
  const pts = [];
  if (pose === "attack") for (let i = 5; i <= len - 2; i++) pts.push([hx + 20 + i, hy + 13]);
  else for (let i = 5; i <= len - 2; i++) pts.push([hx + 20, hy + 13 + i]);
  return pts;
}

/** Живое свечение, бегущий блик и частицы вокруг клинка-облика. */
export class SwordAura {
  constructor() {
    this.parts = [];
    this.acc = 0;
    this.twinkle = null;
  }

  update(dt, skin, pose, hx, hy) {
    for (const p of this.parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (skin === "frost") p.vx += Math.sin((p.life + p.x) * 6) * 8 * dt; // снежинки покачиваются
      p.life -= dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    if (!skin || !SKIN[skin] || (pose !== "idle" && pose !== "attack")) return;
    const pts = bladePoints(skin, pose, hx, hy);
    const rate = { void: 20, sun: 16, frost: 9 }[skin];
    this.acc += dt * rate;
    while (this.acc >= 1) {
      this.acc -= 1;
      const [x, y] = pts[Math.floor(Math.random() * pts.length)];
      const life = rand(0.6, 1.3);
      const col = SKIN[skin].parts[Math.floor(Math.random() * 3)];
      if (skin === "frost") this.parts.push({ x: x + rand(-3, 3), y, vx: rand(-3, 3), vy: rand(5, 11), life, max: life, col });
      else this.parts.push({ x: x + rand(-1, 1), y, vx: rand(-4, 4), vy: rand(-18, -7), life, max: life, col });
    }
    if (skin === "sun" && (!this.twinkle || this.twinkle.life <= 0) && Math.random() < dt * 1.6) {
      const [x, y] = pts[Math.floor(Math.random() * pts.length)];
      this.twinkle = { x, y, life: 0.35 };
    }
    if (this.twinkle) this.twinkle.life -= dt;
  }

  draw(c, skin, pose, hx, hy, t) {
    if (skin && SKIN[skin] && (pose === "idle" || pose === "attack")) {
      const s = SKIN[skin];
      const pts = bladePoints(skin, pose, hx, hy);
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      const vertical = pose !== "attack";
      // мягкое двойное свечение
      for (const [x, y] of pts) {
        c.fillStyle = rgba(s.glow, 0.10 + 0.08 * pulse);
        if (vertical) c.fillRect(x - 3, y, 7, 1);
        else c.fillRect(x, y - 3, 1, 7);
        c.fillStyle = rgba(s.glow, 0.22 + 0.18 * pulse);
        if (vertical) c.fillRect(x - 2, y, 5, 1);
        else c.fillRect(x, y - 2, 1, 5);
      }
      // блик, бегущий от рукояти к острию
      const head = ((t * 0.9) % 1.4) * pts.length;
      for (let i = 0; i < pts.length; i++) {
        const d = Math.abs(i - head);
        if (d < 2.5) {
          c.fillStyle = rgba(s.hi, 0.9 - d * 0.3);
          c.fillRect(pts[i][0], pts[i][1], 1, 1);
        }
      }
      // руны Бездны вспыхивают по очереди
      if (skin === "void") {
        const rune = Math.floor(t * 3) % pts.length;
        c.fillStyle = rgba([255, 230, 255], 0.9);
        c.fillRect(pts[rune][0], pts[rune][1], 1, 1);
      }
      if (skin === "sun" && this.twinkle && this.twinkle.life > 0) {
        const k = this.twinkle.life / 0.35, { x, y } = this.twinkle;
        c.fillStyle = rgba([255, 255, 230], k);
        c.fillRect(x - 2, y, 5, 1);
        c.fillRect(x, y - 2, 1, 5);
        c.fillStyle = rgba([255, 220, 120], k * 0.6);
        c.fillRect(x - 1, y - 1, 3, 3);
      }
    }
    for (const p of this.parts) {
      const k = p.life / p.max;
      c.fillStyle = rgba(p.col, Math.min(1, k * 1.5));
      c.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
  }
}

/** След удара для клинка-облика: свечение, тёмное ядро Бездны, лучи Рассвета, осколки Инея. */
export function drawSkinSlash(c, x, y, skin, k) {
  const s = SKIN[skin];
  const radius = 18;
  const fade = Math.max(0, 1 - k);
  const sweep = -75 + 150 * Math.min(1, k * 2.5);
  const arc = (r, w, col, a) => {
    c.fillStyle = rgba(col, a * fade);
    for (let deg = -75; deg <= sweep; deg += 4) {
      const rad = (deg * Math.PI) / 180;
      c.fillRect(Math.floor(x + Math.cos(rad) * r * 0.55 - w / 2), Math.floor(y + Math.sin(rad) * r - w / 2), w, w);
    }
  };
  arc(radius + 2, 5, s.glow, 0.25);
  arc(radius, 3, s.glow, 0.9);
  arc(radius - 3, 1, s.hi, 1);
  if (skin === "void") arc(radius - 5, 2, [30, 0, 50], 0.9);
  for (let deg = -75; deg <= sweep; deg += 25) {
    const rad = (deg * Math.PI) / 180;
    const ax = x + Math.cos(rad) * radius * 0.55, ay = y + Math.sin(rad) * radius;
    if (skin === "sun") { // лучи
      c.fillStyle = rgba([255, 230, 140], 0.8 * fade);
      for (let i = 2; i < 7; i++) c.fillRect(Math.floor(ax + Math.cos(rad) * i), Math.floor(ay + Math.sin(rad) * i), 1, 1);
    } else if (skin === "frost") { // осколки льда
      c.fillStyle = rgba([220, 245, 255], fade);
      const fx = Math.floor(ax + Math.cos(rad) * 5 * k * 3), fy = Math.floor(ay + Math.sin(rad) * 5 * k * 3);
      c.fillRect(fx, fy - 1, 1, 3);
      c.fillRect(fx - 1, fy, 3, 1);
    } else { // мотыльки тьмы
      c.fillStyle = rgba([210, 140, 255], 0.9 * fade);
      c.fillRect(Math.floor(ax + rand(-2, 2)), Math.floor(ay + rand(-2, 2)), 1, 1);
    }
  }
}

// ------------------------------------------------------------------ Эффекты удара
const GHOST = [".www.", "wwwww", "wkwkw", "wwwww", "wwwww", "w.w.w"];

export class HitFx {
  constructor() {
    this.items = [];
    this.flash = 0;
    this.flashColor = [255, 255, 255];
  }

  spawn(kind, x, y) {
    if (kind === "hit_storm") {
      this.items.push({ type: "bolt", x, y, sx: x + rand(-40, 40), life: 0.24, max: 0.24, pts: null, jitter: 0 });
      for (let i = 0; i < 18; i++) {
        const a = rand(0, Math.PI * 2), v = rand(20, 70);
        this.items.push({ type: "spark", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, life: rand(0.25, 0.6), max: 0.6, col: Math.random() < 0.5 ? [255, 255, 255] : [140, 220, 255] });
      }
      this.flash = 0.35;
      this.flashColor = [200, 235, 255];
    } else if (kind === "hit_souls") {
      for (let i = 0; i < 5; i++) {
        this.items.push({ type: "ghost", x, y, a: (i / 5) * Math.PI * 2 + rand(-0.3, 0.3), r: 2, life: 1.1, max: 1.1, spin: rand(2.5, 3.5) * (i % 2 ? 1 : -1) });
      }
      this.items.push({ type: "ring", x, y, life: 0.5, max: 0.5 });
      this.flash = 0.22;
      this.flashColor = [150, 110, 255];
    }
  }

  update(dt) {
    this.flash = Math.max(0, this.flash - dt * 1.8);
    for (const it of this.items) {
      it.life -= dt;
      if (it.type === "spark") {
        it.x += it.vx * dt;
        it.y += it.vy * dt;
        it.vy += 120 * dt;
      } else if (it.type === "ghost") {
        it.a += it.spin * dt;
        it.r += 26 * dt;
        it.y -= 10 * dt;
      } else if (it.type === "bolt") {
        it.jitter -= dt;
        if (it.jitter <= 0 || !it.pts) { // молния «дрожит»: ломаная перестраивается
          it.jitter = 0.06;
          const n = 8, pts = [];
          for (let i = 0; i <= n; i++) {
            const k = i / n;
            pts.push([it.sx + (it.x - it.sx) * k + (i && i < n ? rand(-5, 5) : 0), -4 + (it.y + 4) * k]);
          }
          it.pts = pts;
          const m = pts[4];
          it.branch = [m, [m[0] + rand(-14, 14), m[1] + rand(6, 14)], [m[0] + rand(-20, 20), m[1] + rand(14, 24)]];
        }
      }
    }
    this.items = this.items.filter((it) => it.life > 0);
  }

  draw(c) {
    for (const it of this.items) {
      const k = it.life / it.max;
      if (it.type === "bolt" && it.pts) {
        const line = (pts, w, col, a) => {
          c.fillStyle = rgba(col, a);
          for (let i = 0; i < pts.length - 1; i++) {
            const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
            const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
            for (let s = 0; s <= steps; s++) {
              const px = x0 + ((x1 - x0) * s) / steps, py = y0 + ((y1 - y0) * s) / steps;
              c.fillRect(Math.floor(px - w / 2), Math.floor(py), w, 1);
            }
          }
        };
        line(it.pts, 5, [90, 170, 255], 0.35 * k);
        line(it.pts, 3, [150, 220, 255], 0.8 * k);
        line(it.pts, 1, [255, 255, 255], k);
        line(it.branch, 1, [190, 235, 255], 0.8 * k);
        c.fillStyle = rgba([200, 240, 255], 0.6 * k); // ожог на месте удара
        c.fillRect(Math.floor(it.x) - 3, Math.floor(it.y) - 1, 7, 3);
      } else if (it.type === "spark") {
        c.fillStyle = rgba(it.col, k * 1.4);
        c.fillRect(Math.floor(it.x), Math.floor(it.y), 1, 1);
      } else if (it.type === "ghost") {
        const gx = Math.floor(it.x + Math.cos(it.a) * it.r) - 2, gy = Math.floor(it.y + Math.sin(it.a) * it.r * 0.6) - 3;
        for (let y = 0; y < GHOST.length; y++) {
          for (let x = 0; x < 5; x++) {
            const ch = GHOST[y][x];
            if (ch === ".") continue;
            c.fillStyle = ch === "k" ? rgba([60, 30, 120], k) : rgba([210, 220, 255], k * 0.85);
            c.fillRect(gx + x, gy + y, 1, 1);
          }
        }
        c.fillStyle = rgba([150, 120, 255], k * 0.5); // шлейф
        c.fillRect(gx + 2, gy + 6, 1, 2);
      } else if (it.type === "ring") {
        const r = (1 - k) * 22 + 2;
        c.fillStyle = rgba([170, 130, 255], k);
        for (let a = 0; a < Math.PI * 2; a += 0.2) c.fillRect(Math.floor(it.x + Math.cos(a) * r), Math.floor(it.y + Math.sin(a) * r * 0.6), 1, 1);
      }
    }
  }

  drawFlash(ctx, w, h) {
    if (this.flash <= 0) return;
    ctx.fillStyle = rgba(this.flashColor, this.flash * 0.5);
    ctx.fillRect(0, 0, w, h);
  }
}

// ------------------------------------------------------------------ Оформление побед
const CROWN = [
  "..y.....y.....y..",
  ".yRy...yBy...yRy.",
  "..y.....y.....y..",
  "..yy...yyy...yy..",
  "..yyy.yyyyy.yyy..",
  "..yyyyyyyyyyyyy..",
  "..yYyYyYyYyYyYy..",
  "..yyyyyyyyyyyyy..",
  "..ddddddddddddd..",
];
const SKULL = [
  "...wwwwwww...",
  "..wwwwwwwww..",
  ".wwwwwwwwwww.",
  ".wwbbwwwbbww.",
  ".wwbBwwwBbww.",
  ".wwwwwkwwwww.",
  "..wwwkkkwww..",
  "...wwwwwww...",
  "...w.w.w.w...",
];
const PIX = {
  y: [240, 190, 70], Y: [255, 235, 150], R: [220, 40, 50], B: [80, 140, 255], d: [150, 100, 30],
  w: [220, 230, 255], b: [20, 30, 70], k: [30, 40, 80],
};

function drawPixelMap(ctx, map, cx, cy, scale, override = {}) {
  const w = map[0].length;
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < w; x++) {
      const ch = map[y][x];
      if (ch === ".") continue;
      ctx.fillStyle = override[ch] || `rgb(${PIX[ch].join(",")})`;
      ctx.fillRect(Math.round(cx - (w * scale) / 2 + x * scale), Math.round(cy + y * scale), scale, scale);
    }
  }
}

/** Праздничное оформление победы. text(ctx, s, x, y, size, color, align) — пиксельный текст игры. */
export class VictoryFx {
  constructor(style) {
    this.style = style;
    this.t = 0;
    this.parts = [];
    this.acc = 0;
  }

  update(dt) {
    this.t += dt;
    for (const p of this.parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.spin += dt * 8;
    }
    this.parts = this.parts.filter((p) => p.life > 0 && p.y < 380 && p.y > -20);
    this.acc += dt * (this.style === "win_crown" ? 26 : 60);
    while (this.acc >= 1) {
      this.acc -= 1;
      if (this.style === "win_crown") { // монеты сыплются сверху
        this.parts.push({ x: rand(10, 630), y: -8, vx: rand(-10, 10), vy: rand(60, 110), life: 6, spin: rand(0, 6), kind: "coin" });
      } else { // рой синих искр поднимается снизу
        this.parts.push({ x: rand(0, 640), y: 368, vx: rand(-14, 14), vy: rand(-140, -60), life: rand(1.5, 3), spin: 0, kind: "ember", c: Math.random() < 0.3 ? [255, 255, 255] : [120, 190, 255] });
      }
    }
  }

  draw(ctx, text, info) {
    const t = this.t, fadeIn = Math.min(1, t * 2.5);
    const cy = 180, top = 92, bot = 268;
    if (this.style === "win_crown") {
      ctx.fillStyle = rgba([12, 8, 4], 0.9 * fadeIn);
      ctx.fillRect(0, top, 640, bot - top);
      // вращающиеся лучи за надписью
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, 640, bot - top);
      ctx.clip();
      ctx.translate(320, cy - 20);
      ctx.rotate(t * 0.25);
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = rgba([255, 200, 90], (i % 2 ? 0.05 : 0.13) * fadeIn);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 420, (i / 16) * Math.PI * 2, ((i + 1) / 16) * Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // золотая рамка с ромбами
      for (const y of [top, bot - 4]) {
        ctx.fillStyle = rgba([232, 190, 92], fadeIn);
        ctx.fillRect(0, y, 640, 2);
        ctx.fillStyle = rgba([120, 80, 20], fadeIn);
        ctx.fillRect(0, y + 2, 640, 2);
        for (let x = 8; x < 640; x += 24) {
          ctx.fillStyle = rgba([255, 230, 140], fadeIn);
          ctx.fillRect(x, y - 2, 2, 2);
          ctx.fillRect(x - 2, y, 6, 2);
          ctx.fillRect(x, y + 2, 2, 2);
        }
      }
      drawPixelMap(ctx, CROWN, 320, top + 10 + Math.sin(t * 2) * 2, 3);
      this.title(ctx, text, info.title, cy - 18, [232, 190, 92], [255, 250, 220]);
    } else {
      ctx.fillStyle = rgba([4, 8, 22], 0.92 * fadeIn);
      ctx.fillRect(0, top, 640, bot - top);
      // языки синего пламени по краям
      for (let x = 0; x < 640; x += 4) {
        const edge = Math.min(x, 640 - x);
        if (edge > 170) continue;
        const k = 1 - edge / 170;
        const h = (20 + 70 * k) * (0.6 + 0.4 * Math.sin(x * 0.37 + t * 9) * Math.sin(x * 0.11 - t * 5));
        const layers = [[[30, 60, 180], 1], [[90, 160, 255], 0.65], [[220, 240, 255], 0.3]];
        for (const [col, f] of layers) {
          ctx.fillStyle = rgba(col, (0.35 + 0.5 * k) * fadeIn);
          ctx.fillRect(x, bot - h * f, 4, h * f);
        }
      }
      const eyes = 0.5 + 0.5 * Math.sin(t * 6);
      drawPixelMap(ctx, SKULL, 320, top + 8, 3, { B: `rgb(${Math.floor(80 + 160 * eyes)},${Math.floor(160 + 80 * eyes)},255)` });
      ctx.fillStyle = rgba([90, 160, 255], fadeIn);
      ctx.fillRect(0, top, 640, 2);
      ctx.fillRect(0, bot - 2, 640, 2);
      const flicker = 0.75 + 0.25 * Math.sin(t * 17) * Math.sin(t * 7);
      this.title(ctx, text, info.title, cy - 14, [Math.floor(150 * flicker + 60), Math.floor(200 * flicker + 40), 255], [255, 255, 255]);
    }
    // частицы
    for (const p of this.parts) {
      if (p.kind === "coin") {
        const w = Math.max(1, Math.round(Math.abs(Math.cos(p.spin)) * 5));
        ctx.fillStyle = "rgb(150,100,20)";
        ctx.fillRect(Math.round(p.x - w / 2) + 1, Math.round(p.y) + 1, w, 5);
        ctx.fillStyle = "rgb(240,190,70)";
        ctx.fillRect(Math.round(p.x - w / 2), Math.round(p.y), w, 5);
        if (w > 2) {
          ctx.fillStyle = "rgb(255,245,190)";
          ctx.fillRect(Math.round(p.x - w / 2) + 1, Math.round(p.y) + 1, 1, 2);
        }
      } else {
        ctx.fillStyle = rgba(p.c, Math.min(1, p.life));
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
    }
    text(ctx, info.loot, 320, cy + 30, 8, this.style === "win_crown" ? "rgb(255,220,120)" : "rgb(170,210,255)", "center");
    if (info.hint) text(ctx, info.hint, 320, cy + 48, 8, "rgb(226,214,190)", "center");
  }

  /** Заголовок с бликом, пробегающим по буквам. */
  title(ctx, text, s, y, base, shine) {
    const scale = Math.min(1, 0.4 + this.t * 2); // надпись «вырастает»
    const size = Math.round(32 * scale / 8) * 8 || 8;
    text(ctx, s, 320, y, size, `rgb(${base.join(",")})`, "center");
    const sx = ((this.t * 260) % 900) - 130;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sx, y - 4);
    ctx.lineTo(sx + 22, y - 4);
    ctx.lineTo(sx + 6, y + size + 4);
    ctx.lineTo(sx - 16, y + size + 4);
    ctx.closePath();
    ctx.clip();
    text(ctx, s, 320, y, size, `rgb(${shine.join(",")})`, "center", false);
    ctx.restore();
  }
}
