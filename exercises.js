// Распознавание упражнений по ключевым точкам MediaPipe Pose.
// Порт game/exercises.py: те же пороги и события, чтобы ПК- и мобильная версии вели себя одинаково.
//   "pushup"     — засчитано отжимание (атака / прокачка Силы)
//   "squat_down" — игрок присел (мгновенный уворот в бою)
//   "squat"      — засчитан полный присед (прокачка Живучести)
//   "pushup_down"— игрок опустился в нижнюю точку отжимания (уворот из планки)
//   "jack"       — засчитан прыжок «звёздочка» (эстус / прокачка Выносливости)

export const NOSE = 0;
export const L_SHOULDER = 11, R_SHOULDER = 12;
export const L_ELBOW = 13, R_ELBOW = 14;
export const L_WRIST = 15, R_WRIST = 16;
export const L_HIP = 23, R_HIP = 24;
export const L_KNEE = 25, R_KNEE = 26;
export const L_ANKLE = 27, R_ANKLE = 28;

export const EXERCISES = ["pushup", "squat", "jack"];
export const NAMES = { pushup: "Отжимания", squat: "Приседания", jack: "Звёздочка" };

const MIN_VIS = 0.5;
const MIN_REP_INTERVAL = 0.35; // сек, защита от дребезга

const SQUAT_DOWN_KNEE = 110;
const SQUAT_UP_KNEE = 155;
const PUSHUP_DOWN_ELBOW = 100;
const PUSHUP_UP_ELBOW = 150;
const UPRIGHT_MAX_TILT = 45;
const HORIZONTAL_MIN_TILT = 55;

const deg = (r) => (r * 180) / Math.PI;

export function angle(a, b, c) {
  const v1x = a[0] - b[0], v1y = a[1] - b[1];
  const v2x = c[0] - b[0], v2y = c[1] - b[1];
  const n1 = Math.hypot(v1x, v1y), n2 = Math.hypot(v2x, v2y);
  if (n1 === 0 || n2 === 0) return 180;
  const cos = (v1x * v2x + v1y * v2y) / (n1 * n2);
  return deg(Math.acos(Math.max(-1, Math.min(1, cos))));
}

const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
const visible = (lm, ...idx) => idx.every((i) => lm[i][2] >= MIN_VIS);

function sideAngle(lm, left, right) {
  const vals = [left, right].filter((t) => visible(lm, ...t)).map(([a, b, c]) => angle(lm[a], lm[b], lm[c]));
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

export class ExerciseDetector {
  constructor() {
    this.squatDown = false;
    this.pushupDown = false;
    this.jackOpen = false;
    this.lastRep = { pushup: -1e9, squat: -1e9, jack: -1e9 };
    this.counts = { pushup: 0, squat: 0, jack: 0 };
    this.posture = "нет человека";
    this.knee = this.elbow = this.tilt = null;
  }

  /** Игрок сейчас «внизу» (присед или нижняя точка отжимания) — пригнулся под удар. */
  get low() {
    return this.squatDown || this.pushupDown;
  }

  _rep(name, t, events) {
    if (t - this.lastRep[name] >= MIN_REP_INTERVAL) {
      this.lastRep[name] = t;
      this.counts[name] += 1;
      events.push(name);
    }
  }

  /** lm — массив из 33 [x, y, vis] или null; t — время в секундах. */
  update(lm, t) {
    const events = [];
    if (!lm || (!visible(lm, L_SHOULDER, R_SHOULDER) && !visible(lm, L_HIP, R_HIP))) {
      this.posture = "нет человека";
      return events;
    }
    const sh = mid(lm[L_SHOULDER], lm[R_SHOULDER]);
    const hip = mid(lm[L_HIP], lm[R_HIP]);
    const dx = sh[0] - hip[0], dy = sh[1] - hip[1];
    this.tilt = deg(Math.atan2(Math.abs(dx), Math.abs(dy) + 1e-6));
    this.knee = sideAngle(lm, [L_HIP, L_KNEE, L_ANKLE], [R_HIP, R_KNEE, R_ANKLE]);
    this.elbow = sideAngle(lm, [L_SHOULDER, L_ELBOW, L_WRIST], [R_SHOULDER, R_ELBOW, R_WRIST]);

    if (this.tilt <= UPRIGHT_MAX_TILT) {
      this.posture = "стоя";
      this.pushupDown = false;
      this._squat(t, events);
      this._jack(lm, t, events);
    } else if (this.tilt >= HORIZONTAL_MIN_TILT) {
      this.posture = "планка";
      this.squatDown = false;
      this.jackOpen = false;
      this._pushup(t, events);
    } else {
      this.posture = "переход";
    }
    return events;
  }

  _squat(t, events) {
    if (this.knee == null) return;
    if (!this.squatDown && this.knee < SQUAT_DOWN_KNEE) {
      this.squatDown = true;
      events.push("squat_down");
    } else if (this.squatDown && this.knee > SQUAT_UP_KNEE) {
      this.squatDown = false;
      this._rep("squat", t, events);
    }
  }

  _pushup(t, events) {
    if (this.elbow == null) return;
    if (!this.pushupDown && this.elbow < PUSHUP_DOWN_ELBOW) {
      this.pushupDown = true;
      events.push("pushup_down");
    } else if (this.pushupDown && this.elbow > PUSHUP_UP_ELBOW) {
      this.pushupDown = false;
      this._rep("pushup", t, events);
    }
  }

  _jack(lm, t, events) {
    if (!visible(lm, L_WRIST, R_WRIST, L_SHOULDER, R_SHOULDER)) return;
    const shoulderW = Math.abs(lm[L_SHOULDER][0] - lm[R_SHOULDER][0]) || 1e-3;
    const headY = visible(lm, NOSE) ? lm[NOSE][1] : Math.min(lm[L_SHOULDER][1], lm[R_SHOULDER][1]);
    const armsUp = lm[L_WRIST][1] < headY && lm[R_WRIST][1] < headY;
    const armsDown = lm[L_WRIST][1] > lm[L_SHOULDER][1] && lm[R_WRIST][1] > lm[R_SHOULDER][1];
    let legsOpen = true, legsClosed = true; // ноги не в кадре — считаем только по рукам
    if (visible(lm, L_ANKLE, R_ANKLE)) {
      const feet = Math.abs(lm[L_ANKLE][0] - lm[R_ANKLE][0]) / shoulderW;
      legsOpen = feet > 1.3;
      legsClosed = feet < 1.25;
    }
    if (!this.jackOpen && armsUp && legsOpen) {
      this.jackOpen = true;
    } else if (this.jackOpen && armsDown && legsClosed) {
      this.jackOpen = false;
      this._rep("jack", t, events);
    }
  }
}
