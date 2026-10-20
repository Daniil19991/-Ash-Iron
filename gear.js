// Снаряжение: мечи за алые камни и уникальные вещи за синие (с боссов).
// Основа — порт game/gear.py; кладбище и новое оружие пока есть только в веб-версии.

// price: [алые, синие]; unique — только за синие камни с боссов
export const SWORDS = {
  rusty: { name: "Ржавый меч", desc: "старый, но свой", dmg: 0, cost: 20, crit: 1.5, lifesteal: 0, price: [0, 0] },
  steel: { name: "Стальной клинок", desc: "+5 урона", dmg: 5, cost: 20, crit: 1.5, lifesteal: 0, price: [6, 0] },
  great: { name: "Двуручный меч", desc: "+12 урона, крит x1.75, удар 28 сил", dmg: 12, cost: 28, crit: 1.75, lifesteal: 0, price: [15, 0] },
  ash: { name: "Пепельный клинок", desc: "+16 урона, крит x2, удар лечит 4", dmg: 16, cost: 20, crit: 2.0, lifesteal: 4, price: [0, 3], unique: true },
  // носится на плече; stun — шанс ошеломить врага ударом
  giant: { name: "Гигантский меч", desc: "+20 урона, иногда ошеломляет", dmg: 20, cost: 32, crit: 1.75, lifesteal: 0, stun: 0.15, price: [25, 0] },
  // burn — урон врагу каждую секунду боя
  radiator: { name: "Радиатор", desc: "+6 урона, жар: 6 урона в секунду", dmg: 6, cost: 20, crit: 1.5, lifesteal: 0, burn: 6, price: [0, 4], unique: true },
  // paid — покупается за деньги (поддержка проекта); productId — товар магазина
  barbell: { name: "Гриф от штанги", desc: "+18 урона, крит x2, удар 24 сил", dmg: 18, cost: 24, crit: 2.0, lifesteal: 0, price: [0, 0], paid: "10 $", productId: "weapon_barbell" },
};

// Реликвии работают сразу после покупки
export const RELICS = {
  armor: { name: "Доспех Костяного Рыцаря", desc: "получаемый урон -25%", price: [0, 1], unique: true },
  amulet: { name: "Амулет Углей", desc: "+1 зелье лечения", price: [0, 2], unique: true },
  kingarmor: { name: "Доспех Короля-Призрака", desc: "получаемый урон -35%", price: [0, 7], unique: true },
};

export const SHOP_ORDER = ["rusty", "steel", "great", "giant", "ash", "radiator", "barbell", "armor", "kingarmor", "amulet"];

export const item = (key) => SWORDS[key] || RELICS[key];

export function priceText(key) {
  const it = item(key);
  if (it.paid) return it.paid;
  const [red, blue] = it.price;
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
// После 3-го Костяного Рыцаря (раунд 15) открываются подступы к замку,
// после 3-го Главы разбойников (раунд 30) — кладбище
export const LOCATIONS = {
  1: { name: "Склеп", bg: "arena_bg" },
  2: { name: "Подступы к замку", bg: "castle_bg" },
  3: { name: "Кладбище", bg: "graveyard_bg" },
};
export const CASTLE_FROM_WAVE = 16;
export const GRAVEYARD_FROM_WAVE = 31;
export const locationFor = (wave) => (wave >= GRAVEYARD_FROM_WAVE ? 3 : wave >= CASTLE_FROM_WAVE ? 2 : 1);
/** Первая волна локации. */
export const locationStart = (loc) => ({ 1: 1, 2: CASTLE_FROM_WAVE, 3: GRAVEYARD_FROM_WAVE })[loc];

/**
 * Кто ждёт на этой волне: skeleton / bandit / zombie / bat и боссы локаций —
 * knight (склеп), chief (замок), wraith (кладбище: Король-Призрак).
 */
export function enemyKind(wave) {
  const loc = locationFor(wave);
  if (loc === 1) return isBossWave(wave) ? "knight" : "skeleton";
  if (loc === 2) {
    if (isBossWave(wave)) return "chief";
    return wave % 2 === 0 ? "bandit" : "skeleton";
  }
  if (isBossWave(wave)) return "wraith";
  return ["zombie", "bat", "skeleton"][wave % 3];
}
