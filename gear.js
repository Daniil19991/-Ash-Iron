// Снаряжение: мечи за алые камни и уникальные вещи за синие (с боссов).
// Порт game/gear.py — значения должны совпадать.

// price: [алые, синие]; unique — только за синие камни с боссов
export const SWORDS = {
  rusty: { name: "Ржавый меч", desc: "старый, но свой", dmg: 0, cost: 20, crit: 1.5, lifesteal: 0, price: [0, 0] },
  steel: { name: "Стальной клинок", desc: "+5 урона", dmg: 5, cost: 20, crit: 1.5, lifesteal: 0, price: [6, 0] },
  great: { name: "Двуручный меч", desc: "+12 урона, крит x1.75, удар 28 сил", dmg: 12, cost: 28, crit: 1.75, lifesteal: 0, price: [15, 0] },
  ash: { name: "Пепельный клинок", desc: "+16 урона, крит x2, удар лечит 4", dmg: 16, cost: 20, crit: 2.0, lifesteal: 4, price: [0, 3], unique: true },
};

// Реликвии работают сразу после покупки
export const RELICS = {
  armor: { name: "Доспех Костяного Рыцаря", desc: "получаемый урон -25%", price: [0, 1], unique: true },
  amulet: { name: "Амулет Углей", desc: "+1 зелье лечения", price: [0, 2], unique: true },
};

export const SHOP_ORDER = ["rusty", "steel", "great", "ash", "armor", "amulet"];

export const item = (key) => SWORDS[key] || RELICS[key];

export function priceText(key) {
  const [red, blue] = item(key).price;
  if (blue) return `${blue} син.`;
  return red ? `${red} ал.` : "-";
}

// --- Враги и награды ---
export const BOSS_EVERY = 5;
export const isBossWave = (wave) => wave % BOSS_EVERY === 0;

/** [пепел, алые, синие] за победу над врагом этой волны. */
export function rewards(wave) {
  if (isBossWave(wave)) return [2 * (80 + 40 * wave), 4 + Math.floor(wave / BOSS_EVERY), 1];
  return [80 + 40 * wave, 2 + Math.floor((wave - 1) / BOSS_EVERY), 0];
}

// --- Локации ---
// После 3-го Костяного Рыцаря (раунд 15) открываются подступы к замку
export const LOCATIONS = { 1: { name: "Склеп", bg: "arena_bg" }, 2: { name: "Подступы к замку", bg: "castle_bg" } };
export const CASTLE_FROM_WAVE = 16;
export const locationFor = (wave) => (wave >= CASTLE_FROM_WAVE ? 2 : 1);

/** Кто ждёт на этой волне: skeleton / bandit / knight (босс склепа) / chief (босс замка). */
export function enemyKind(wave) {
  if (locationFor(wave) === 1) return isBossWave(wave) ? "knight" : "skeleton";
  if (isBossWave(wave)) return "chief";
  return wave % 2 === 0 ? "bandit" : "skeleton";
}
