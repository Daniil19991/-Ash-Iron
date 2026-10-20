// Захват движения в браузере телефона: фронтальная камера + MediaPipe PoseLandmarker.
// Библиотека и модель берутся из ./vendor (кладёт tools/fetch_web_vendor.sh / CI),
// а если их там нет — с CDN.
import { ExerciseDetector } from "./exercises.js";

const MP_VERSION = "1.1.1";
const LOCAL_BASE = new URL("./", import.meta.url).href;
const CDN_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/`;
const LOCAL_WASM = LOCAL_BASE.replace(/\/$/, "");
const LOCAL_MODEL = new URL("./pose_landmarker_lite.task", import.meta.url).href;
const CDN_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

export const POSE_LINKS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24],
  [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];

async function exists(url) {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok;
  } catch (e) {
    return false;
  }
}

async function loadVision() {
  try {
    return { vision: await import(LOCAL_BASE + "vision_bundle.mjs"), wasm: LOCAL_WASM };
  } catch (e) {
    return { vision: await import(CDN_BASE + "vision_bundle.mjs"), wasm: CDN_BASE + "wasm" };
  }
}

export class Motion {
  constructor() {
    this.events = [];
    this.detector = new ExerciseDetector();
    this.status = "камера выключена";
    this.ok = false;
    this.landmarks = null;
    this.video = document.createElement("video");
    this.video.setAttribute("playsinline", "");  // iOS: без этого видео уходит в полноэкранный плеер
    this.video.muted = true;
    this.lastVideoTime = -1;
  }

  /** Вызывать из обработчика нажатия: iOS даёт камеру только по жесту пользователя. */
  async start() {
    if (this.ok || this.starting) return; // повторное касание, пока камера включается
    this.starting = true;
    try {
      await this._start();
    } finally {
      this.starting = false;
    }
  }

  async _start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.status = "браузер не даёт камеру (нужен https)";
      return;
    }
    try {
      this.status = "доступ к камере…";
      await this._openStream();
    } catch (e) {
      this.denied = !!e && (e.name === "NotAllowedError" || e.name === "SecurityError");
      this.status = "нет доступа к камере";
      return;
    }
    try {
      this.status = "загрузка модели позы…";
      const { vision, wasm } = await loadVision();
      const fileset = await vision.FilesetResolver.forVisionTasks(wasm);
      const model = (await exists(LOCAL_MODEL)) ? LOCAL_MODEL : CDN_MODEL;
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: model, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      try {
        this.landmarker = await vision.PoseLandmarker.createFromOptions(fileset, opts("GPU"));
      } catch (e) {
        this.landmarker = await vision.PoseLandmarker.createFromOptions(fileset, opts("CPU"));
      }
    } catch (e) {
      console.error(e);
      this.status = "модель не загрузилась (нет сети?)";
      return;
    }
    this.ok = true;
    this.status = "камера активна";
    // iOS выключает камеру, когда приложение свёрнуто, — после возврата включаем снова
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.resume();
    });
    const loop = () => {
      this._detect();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  async _openStream() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();
  }

  /** Камера отключена системой (сворачивание, звонок) — открыть поток заново. */
  async resume() {
    if (!this.ok || this.resuming) return;
    const s = this.video.srcObject;
    const live = s && s.getVideoTracks().some((t) => t.readyState === "live");
    if (live && !this.video.paused) return;
    this.resuming = true;
    try {
      if (live) await this.video.play();
      else {
        if (s) s.getTracks().forEach((t) => t.stop());
        await this._openStream();
      }
      this.status = "камера активна";
    } catch (e) {
      this.status = "камера отключена: нажмите «Камера и советы»";
    } finally {
      this.resuming = false;
    }
  }

  _detect() {
    const v = this.video;
    if (v.readyState < 2 || v.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = v.currentTime;
    const now = performance.now();
    const res = this.landmarker.detectForVideo(v, now);
    const pose = res.landmarks && res.landmarks[0];
    this.landmarks = pose ? pose.map((p) => [p.x, p.y, p.visibility ?? 1]) : null;
    for (const ev of this.detector.update(this.landmarks, now / 1000)) this.events.push(ev);
  }

  poll() {
    return this.events.splice(0);
  }

  /** Кадр камеры (зеркально, с обрезкой под прямоугольник) и скелет позы поверх. */
  drawPreview(ctx, x, y, w, h) {
    const v = this.video;
    if (!this.ok || v.readyState < 2) return false;
    const vw = v.videoWidth, vh = v.videoHeight;
    const scale = Math.max(w / vw, h / vh);
    const sw = w / scale, sh = h / scale;
    const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, w, h);
    const lm = this.landmarks;
    if (lm) {
      const px = (i) => [((lm[i][0] * vw - sx) * w) / sw, ((lm[i][1] * vh - sy) * h) / sh];
      ctx.strokeStyle = "rgb(255,170,60)";
      ctx.lineWidth = 2;
      for (const [a, b] of POSE_LINKS) {
        if (lm[a][2] > 0.5 && lm[b][2] > 0.5) {
          const [ax, ay] = px(a), [bx, by] = px(b);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }
      ctx.fillStyle = "rgb(255,60,40)";
      for (const i of new Set(POSE_LINKS.flat())) {
        if (lm[i][2] > 0.5) {
          const [cx, cy] = px(i);
          ctx.fillRect(cx - 2, cy - 2, 4, 4);
        }
      }
    }
    ctx.restore();
    return true;
  }
}
