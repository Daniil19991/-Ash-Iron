// Персонаж игрока: характеристики, прокачка, сохранение в памяти телефона (localStorage).
// Порт game/player.py.

import { RELICS, SWORDS, item } from "./gear.js";
import { loadJSON, saveJSON } from "./storage.js";

const SAVE_KEY = "ash-and-iron-save";

export const STATS = {
  strength: ["СИЛА", "pushup", "урон атаки"],
  vigor: ["ЖИВУЧЕСТЬ", "squat", "здоровье"],
  endurance: ["ВЫНОСЛИВОСТЬ", "jack", "запас сил"],
};

export const ESTUS_MAX = 3; // без Амулета Углей

export class Player {
  constructor(data = {}) {
    this.strength = 1;
    this.vigor = 1;
    this.endurance = 1;
    this.souls = 100; // пепел — валюта прокачки (поле зовётся souls ради старых сохранений)
    this.wave = 1;
    this.lostSouls = 0;
    this.lostAtWave = 0;
    this.totalReps = { pushup: 0, squat: 0, jack: 0 };
    this.bossesDefeated = 0; // для рейтинга
    this.redGems = 0; // алые камни — за каждого врага, тратятся в кузнице
    this.blueGems = 0; // синие камни — за боссов, на уникальное снаряжение
    this.owned = ["rusty"];
    this.sword = "rusty";
    for (const k of Object.keys(data)) if (k in this) this[k] = data[k];
    // старые или испорченные сохранения
    this.owned = Array.isArray(this.owned) ? this.owned.filter((k) => SWORDS[k] || RELICS[k]) : [];
    if (!this.owned.includes("rusty")) this.owned.unshift("rusty");
    if (!SWORDS[this.sword] || !this.owned.includes(this.sword)) this.sword = "rusty";
  }

  get level() { return this.strength + this.vigor + this.endurance - 2; }
  get maxHp() { return 80 + 12 * this.vigor; }
  get maxStamina() { return 60 + 8 * this.endurance; }
  get staminaRegen() { return 10 + 2 * this.endurance; }
  get weapon() { return SWORDS[this.sword]; }
  get damage() { return 10 + 3 * this.strength + this.weapon.dmg; }
  get attackCost() { return this.weapon.cost; }
  get critMult() { return this.weapon.crit; }
  get lifesteal() { return this.weapon.lifesteal; }
  get damageTakenMult() { return this.owned.includes("kingarmor") ? 0.65 : this.owned.includes("armor") ? 0.75 : 1; }
  get estusMax() { return ESTUS_MAX + (this.owned.includes("amulet") ? 1 : 0); }

  // --- Кузница ---
  canAfford(key) {
    const [red, blue] = item(key).price;
    return this.redGems >= red && this.blueGems >= blue;
  }

  /** Покупает вещь (меч сразу надевается). false — уже есть или не хватает камней. */
  buy(key) {
    if (item(key).paid) return false; // платные вещи выдаёт только магазин (grantPaid)
    if (this.owned.includes(key) || !this.canAfford(key)) return false;
    const [red, blue] = item(key).price;
    this.redGems -= red;
    this.blueGems -= blue;
    this.owned.push(key);
    if (SWORDS[key]) this.sword = key;
    return true;
  }

  /** Вещь, оплаченная в магазине (поддержка проекта): выдаётся без камней и сразу надевается. */
  grantPaid(key, equip = true) {
    if (!item(key) || !item(key).paid) return false;
    if (!this.owned.includes(key)) this.owned.push(key);
    if (equip && SWORDS[key]) this.sword = key;
    return true;
  }

  equip(key) {
    if (SWORDS[key] && this.owned.includes(key)) this.sword = key;
  }

  levelCost() { return 60 + 30 * (this.level - 1); }
  repsNeeded(stat) { return Math.min(4 + this[stat], 20); }
  canLevel() { return this.souls >= this.levelCost(); }

  levelUp(stat) {
    this.souls -= this.levelCost();
    this[stat] += 1;
  }

  addRep(ex) {
    if (ex in this.totalReps) this.totalReps[ex] += 1;
  }

  save() {
    saveJSON(SAVE_KEY, this); // в приватном режиме браузера — играем без сохранения
  }

  static load() {
    try {
      return new Player(loadJSON(SAVE_KEY, {}));
    } catch (e) {
      return new Player();
    }
  }
}
