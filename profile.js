// Профиль устройства: имя в рейтинге, лучший результат и выбранный облик.
// Хранится отдельно от персонажа, поэтому «Новая игра» не стирает рекорд, покупки и облик.
import { loadJSON, saveJSON } from "./storage.js";

const KEY = "ash-and-iron-profile";

function newId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Имена в общем рейтинге видят все: только буквы, цифры, пробел, _ и -, без грубостей
const BANNED = ["хуй", "хуе", "пизд", "ебл", "ебат", "бляд", "сука", "fuck", "shit", "nigg", "cunt", "whore"];

export function cleanName(raw) {
  const name = String(raw || "").replace(/[^\p{L}\p{N} _-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 16);
  if (name.length < 2) return null;
  const low = name.toLowerCase().replace(/[\s_-]/g, "");
  if (BANNED.some((w) => low.includes(w))) return null;
  return name;
}

export class Profile {
  constructor(data = {}) {
    this.id = data.id || newId();
    this.name = cleanName(data.name) || `Рыцарь-${this.id.slice(0, 4).toUpperCase()}`;
    this.best = { bosses: 0, level: 1, wave: 1, ...(data.best || {}) };
    // выбранный облик: меч, эффект удара, оформление победы (null — стандартный)
    this.style = { sword: null, hit: null, victory: null, ...(data.style || {}) };
  }

  /** Обновляет рекорд из текущего персонажа. true — если рекорд вырос. */
  record(player) {
    const b = this.best;
    const next = {
      bosses: Math.max(b.bosses, player.bossesDefeated || 0),
      level: Math.max(b.level, player.level),
      wave: Math.max(b.wave, player.wave),
    };
    const improved = next.bosses !== b.bosses || next.level !== b.level || next.wave !== b.wave;
    this.best = next;
    return improved;
  }

  rename(raw) {
    const name = cleanName(raw);
    if (name) this.name = name;
    return name;
  }

  save() {
    saveJSON(KEY, { id: this.id, name: this.name, best: this.best, style: this.style });
  }

  static load() {
    return new Profile(loadJSON(KEY, {}));
  }
}
