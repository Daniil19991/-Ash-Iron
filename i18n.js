// Язык интерфейса: русский (исходный) и английский.
// Текст переводится в момент вывода (Game.text / Game.wrap), поэтому логика игры, которая сравнивает
// русские значения (позы, статусы камеры), не меняется. Ключ словаря — русская строка; числа в ней
// заменяются на {#} (например «Пепел: {#}»), а строки с названиями собираются через tf().

const SETTINGS_KEY = "ash-and-iron-settings";

function detect() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}").lang;
    if (saved === "ru" || saved === "en") return saved;
  } catch (e) { /* нет хранилища */ }
  const nav = typeof navigator !== "undefined" ? (navigator.language || "") : "";
  return nav.toLowerCase().startsWith("ru") || !nav ? "ru" : "en";
}

let lang = detect();
const cache = new Map();

export const getLang = () => lang;
export const LANGS = { ru: "Русский", en: "English" };

export function setLang(value) {
  if (value !== "ru" && value !== "en") return;
  lang = value;
  cache.clear();
  if (typeof document !== "undefined") document.documentElement.lang = value;
}

const NUM = /\d+(?:[.,]\d+)?/g;

/** Перевод строки на текущий язык (без перевода — как есть). */
export function tr(s) {
  if (lang === "ru" || typeof s !== "string" || !s) return s;
  if (cache.has(s)) return cache.get(s);
  let out = EN[s];
  if (out === undefined) {
    const nums = [];
    const key = s.replace(NUM, (m) => (nums.push(m), "{#}"));
    const t = nums.length ? EN[key] : undefined;
    if (t !== undefined) {
      let i = 0;
      out = t.replace(/\{#\}/g, () => nums[i++]);
    } else if (/^Рыцарь-[0-9A-F]{4}$/.test(s)) out = `Knight-${s.slice(7)}`; // имя игрока по умолчанию
    else out = s;
  }
  if (cache.size > 2000) cache.clear();
  cache.set(s, out);
  return out;
}

/** Шаблон с именованными подстановками: tf("Куплено: {name}!", { name }) — значения переводятся. */
export function tf(template, vars = {}) {
  const t = lang === "ru" ? template : EN[template] ?? template;
  return t.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? tr(String(vars[k])) : `{${k}}`));
}

// prettier-ignore
const EN = {
  // --- стартовый экран и окна
  "Фитнес-RPG: отжимания, приседания и «звёздочка» управляют боем и прокачкой.": "Fitness RPG: push-ups, squats and jumping jacks drive combat and leveling.",
  "ИГРАТЬ С КАМЕРОЙ": "PLAY WITH CAMERA",
  "БЕЗ КАМЕРЫ (КНОПКИ)": "NO CAMERA (BUTTONS)",
  "Загрузка…": "Loading…",
  "Совет: поставьте телефон на пол у стены и отойдите на 2–3 м.": "Tip: put the phone on the floor against a wall and step back 2–3 m.",
  "Добавьте игру на главный экран: Safari → «Поделиться» → «На экран Домой»; Chrome → ⋮ → «Установить приложение».": "Add the game to your home screen: Safari → Share → Add to Home Screen; Chrome → ⋮ → Install app.",
  "Не удалось загрузить графику. Обновите страницу.": "Could not load graphics. Please reload the page.",
  "ОТМЕНА": "CANCEL",
  "СОХРАНИТЬ": "SAVE",

  // --- главный экран
  "Продолжить путь": "Continue",
  "Костёр: прокачка": "Bonfire: level up",
  "Лавка образов": "Cosmetics shop",
  "Рейтинг": "Leaderboard",
  "Настройки": "Settings",
  "Новая игра": "New game",
  "Стереть? Ещё раз": "Erase? Tap again",
  "фитнес-RPG: тренируй тело, чтобы выжить во тьме": "fitness RPG: train your body to survive the dark",
  "Ур.{lv} Пепел:{ash}": "Lv.{lv} Ash:{ash}",
  "ПК: J K L, тест F2-F4": "PC: J K L, test F2-F4",
  "БОСС": "BOSS",

  // --- локации и враги
  "Склеп": "Crypt",
  "Подступы к замку": "Castle approach",
  "Кладбище": "Graveyard",
  "Скелет-страж": "Skeleton guard",
  "Разбойник": "Bandit",
  "Костяной Рыцарь": "Bone Knight",
  "Глава разбойников": "Bandit Chief",
  "Зомби": "Zombie",
  "Летучая мышь": "Bat",
  "Король-Призрак": "Wraith King",
  "НОВАЯ ЗЕМЛЯ": "NEW LAND",

  // --- упражнения и характеристики
  "Отжимания": "Push-ups",
  "Приседания": "Squats",
  "Звёздочка": "Jumping jacks",
  "нет человека": "nobody in frame",
  "стоя": "standing",
  "планка": "plank",
  "переход": "moving",
  "СИЛА": "STRENGTH",
  "ЖИВУЧЕСТЬ": "VITALITY",
  "ВЫНОСЛИВОСТЬ": "ENDURANCE",
  "СИЛА {#}": "STRENGTH {#}",
  "ЖИВУЧЕСТЬ {#}": "VITALITY {#}",
  "ВЫНОСЛИВОСТЬ {#}": "ENDURANCE {#}",
  "урон атаки": "attack damage",
  "здоровье": "health",
  "запас сил": "stamina",
  "Отжимания x{#}": "Push-ups x{#}",
  "Приседания x{#}": "Squats x{#}",
  "Звёздочка x{#}": "Jumping jacks x{#}",
  "Отжимания x{#}: урон атаки": "Push-ups x{#}: attack damage",
  "Приседания x{#}: здоровье": "Squats x{#}: health",
  "Звёздочка x{#}: запас сил": "Jumping jacks x{#}: stamina",
  "Отжимания: {#} / {#}": "Push-ups: {#} / {#}",
  "Приседания: {#} / {#}": "Squats: {#} / {#}",
  "Звёздочка: {#} / {#}": "Jumping jacks: {#} / {#}",
  "Отжимания: {#}": "Push-ups: {#}",
  "Приседания: {#}": "Squats: {#}",
  "Звёздочка: {#}": "Jumping jacks: {#}",

  // --- камера
  "КАМЕРА": "CAMERA",
  "камера выключена": "camera off",
  "камера выключена: используйте кнопки": "camera off: use the buttons",
  "камера активна": "camera on",
  "браузер не даёт камеру (нужен https)": "browser blocks the camera (https needed)",
  "доступ к камере…": "asking for camera…",
  "нет доступа к камере": "no camera access",
  "загрузка модели позы…": "loading pose model…",
  "модель не загрузилась (нет сети?)": "model failed to load (offline?)",
  "камера отключена: нажмите «Камера и советы»": "camera stopped: open “Camera & tips”",
  "Поставьте телефон на пол у стены, отойдите на 2–3 м, чтобы тело было целиком в кадре.": "Put the phone on the floor against a wall and step back 2–3 m so your whole body is in frame.",
  "Отжим {#}  Присед {#}  Звезда {#}": "Push {#}  Squat {#}  Jack {#}",
  "ОТЖИМ": "PUSH-UP",
  "ПРИСЕД": "SQUAT",
  "ЗВЕЗДА": "JACK",
  "ОТЖИМ [J]": "PUSH-UP [J]",
  "ПРИСЕД [K]": "SQUAT [K]",
  "ЗВЕЗДА [L]": "JACK [L]",
  "КАМЕРА И СОВЕТЫ": "CAMERA & TIPS",
  "Статус: {status}": "Status: {status}",
  "Поза: {pose}": "Pose: {pose}",
  "Колени {knee}  Локти {elbow}  Наклон {tilt}": "Knees {knee}  Elbows {elbow}  Tilt {tilt}",
  "Поставьте телефон на пол, прислонив к стене, и отойдите на 2-3 м.": "Put the phone on the floor against a wall and step back 2-3 m.",
  "Отжимания и приседания: встаньте к телефону БОКОМ.": "Push-ups and squats: stand SIDEWAYS to the phone.",
  "Звёздочка: встаньте ЛИЦОМ, руки поднимайте над головой.": "Jumping jacks: FACE the phone, raise your arms overhead.",
  "Всё тело должно быть в кадре. Экран не гаснет во время игры.": "Keep your whole body in frame. The screen stays on while you play.",
  "Без камеры жмите кнопки ОТЖИМ / ПРИСЕД / ЗВЕЗДА.": "Without a camera, tap PUSH-UP / SQUAT / JACK.",
  "РАЗРЕШИТЬ В НАСТРОЙКАХ": "ALLOW IN SETTINGS",
  "ВКЛЮЧИТЬ КАМЕРУ": "TURN ON CAMERA",

  // --- костёр
  "КОСТЁР": "BONFIRE",
  "В БОЙ": "FIGHT",
  "КУЗНИЦА": "FORGE",
  "МЕНЮ": "MENU",
  "Костёр зажжён. Здоровье и зелья восстановлены.": "The bonfire is lit. Health and potions restored.",
  "Нужно {#} пепла, у вас {#}. Победите скелетов!": "You need {#} ash, you have {#}. Defeat skeletons!",
  "Ритуал прерван. Пепел не потрачен.": "Ritual stopped. No ash spent.",
  "{stat} повышена до {n}!": "{stat} raised to {n}!",
  "Уровень {#}": "Level {#}",
  "Пепел: {#}": "Ash: {#}",
  "Цена уровня: {#} пепла": "Level cost: {#} ash",
  "Нажмите на навык:": "Tap a skill:",
  "Урон {#}  Здоровье {#}  Силы {#}": "Damage {#}  Health {#}  Stamina {#}",
  "Урон {#}  Здор. {#}  Силы {#}": "Damage {#}  HP {#}  Stamina {#}",
  "Всего: отжим {#} присед {#} звезда {#}": "Total: push {#} squat {#} jack {#}",
  "Ритуал: {stat}": "Ritual: {stat}",
  "ПРЕРВАТЬ": "STOP",
  "Ур. {#}  Пепел: {#}": "Lv. {#}  Ash: {#}",

  // --- бой
  "НЕУЯЗВИМ": "IMMUNE",
  "Нет сил!": "No stamina!",
  "{#} КРИТ!": "{#} CRIT!",
  "{#} БРОНЯ": "{#} ARMOR",
  "ПРЕРВАН!": "INTERRUPTED!",
  "ЗЕЛЬЕ ВЫБИТО!": "POTION SMASHED!",
  "ЯРОСТЬ!": "RAGE!",
  "ПЬЁТ ЗЕЛЬЕ!": "DRINKING POTION!",
  "ОШЕЛОМЛЁН!": "STUNNED!",
  "Зелья кончились": "Out of potions",
  "Здоровье и силы полные": "Health and stamina full",
  "+СИЛЫ": "+STAMINA",
  "ВОЗРОЖДЕНИЕ!": "REINCARNATION!",
  "ЕЩЁ УДАР!": "ANOTHER HIT!",
  "+{#} ЗЕЛЬЕ": "+{#} POTION",
  "УВОРОТ!": "DODGE!",
  "-{#} пепла": "-{#} ash",
  " - ЗЕЛЬЕ {#}/{#}": " - POTION {#}/{#}",
  " - ВОССТАЁТ": " - RISING",
  " - ЯРОСТЬ": " - RAGE",
  "< КОСТЁР": "< BONFIRE",
  "ОТЖИМАНИЕ": "PUSH-UP",
  "удар": "attack",
  "ПРИСЕД/ВНИЗ": "SQUAT/DOWN",
  "уворот": "dodge",
  "ЗВЕЗДОЧКА": "JUMPING JACK",
  "зелье": "potion",
  "K держать: остаться внизу": "Hold K: stay low",
  "ПАУЗА: ВСТАНЬТЕ В КАДР": "PAUSED: STEP INTO FRAME",
  "Камера не видит вас, скелет ждёт": "The camera can't see you, the enemy waits",
  "Латы держат удары: бей в окно уязвимости": "Armor blocks hits: strike when he is open",
  "Крадёт пепел. На половине здоровья пьёт зелье: выбей 3 ударами": "Steals ash. At half health he drinks a potion: smash it with 3 hits",
  "Быстрый удар и крадёт пепел: не пропускай": "Fast strikes that steal ash: don't get hit",
  "Медленный, но живучий": "Slow, but tough",
  "Хрупкая, но кусает сериями": "Fragile, but bites in combos",
  "Один раз восстанет из мёртвых: добей дважды": "Rises from the dead once: kill him twice",
  "ПРИГОТОВЬТЕСЬ": "GET READY",
  "Отойдите, чтобы тело было в кадре": "Step back so your body is in frame",
  "ОПУСТИСЬ!": "GET DOWN!",
  "ПРИСЕДАЙ!": "SQUAT!",
  "Окно для удара: ОТЖИМАЙСЯ!": "Opening: DO A PUSH-UP!",
  "ВЫБЕЙ ЗЕЛЬЕ! {#}/{#}": "SMASH THE POTION! {#}/{#}",
  "БОСС ПОВЕРЖЕН": "BOSS DEFEATED",
  "ВРАГ ПОВЕРЖЕН": "ENEMY DEFEATED",
  "+{#} пепла  +{#} алых": "+{#} ash  +{#} red",
  "+{#} пепла  +{#} алых  +{#} синий": "+{#} ash  +{#} red  +{#} blue",
  "Звёздочка: следующий бой. Касание: к костру": "Jumping jack: next fight. Tap: bonfire",
  "ВЫ ПОГИБЛИ": "YOU DIED",
  "Пепел остался на месте гибели: победите": "Your ash stayed where you fell: defeat",
  "этого скелета, чтобы вернуть его. Касание: к костру": "this enemy to get it back. Tap: bonfire",

  // --- кузница и снаряжение
  "Алые камни дают за каждого врага, синие за боссов.": "Red gems drop from every enemy, blue gems from bosses.",
  "Куплено: {name}! Оружие надето.": "Bought: {name}! Weapon equipped.",
  "Надет: {name}": "Equipped: {name}",
  "{name} уже действует": "{name} is already active",
  "Куплено: {name}!": "Bought: {name}!",
  "Куплено: {name}! Меч надет.": "Bought: {name}! Sword equipped.",
  "Не хватает камней: нужно {#} синих": "Not enough gems: need {#} blue",
  "Не хватает камней: нужно {#} алых": "Not enough gems: need {#} red",
  "НАДЕТ": "EQUIPPED",
  "ВЗЯТЬ": "EQUIP",
  "ЕСТЬ": "OWNED",
  "ПРИМЕРКА": "TRY-ON",
  "урон {#}  крит x{#}  удар {#} сил": "dmg {#}  crit x{#}  {#} stam/hit",
  "урон {#} крит x{#}": "damage {#} crit x{#}",
  "удар {#} сил": "attack {#} stamina",
  "НАЗАД К КОСТРУ": "BACK TO BONFIRE",
  "{#} син.": "{#} blue",
  "{#} ал.": "{#} red",
  "Ржавый меч": "Rusty sword",
  "старый, но свой": "old, but yours",
  "Стальной клинок": "Steel blade",
  "+{#} урона": "+{#} dmg",
  "Двуручный меч": "Greatsword",
  "+{#} урона, крит x{#}, удар {#} сил": "+{#} dmg, crit x{#}, {#} stam/hit",
  "Пепельный клинок": "Ash blade",
  "+{#} урона, крит x{#}, удар лечит {#}": "+{#} dmg, crit x{#}, heals {#}/hit",
  "Гигантский меч": "Giant sword",
  "+{#} урона, иногда ошеломляет": "+{#} dmg, may stun",
  "Радиатор": "Radiator",
  "+{#} урона, жар: {#} урона в секунду": "+{#} dmg, heat {#} dmg/sec",
  "Гриф от штанги": "Barbell",
  "Доспех Костяного Рыцаря": "Bone Knight armor",
  "получаемый урон -{#}%": "damage taken -{#}%",
  "Амулет Углей": "Ember amulet",
  "+{#} зелье лечения": "+{#} healing potion",
  "Доспех Короля-Призрака": "Wraith King armor",

  // --- лавка образов
  "ЛАВКА ОБРАЗОВ": "COSMETICS SHOP",
  "{desc} · только облик": "{desc} · looks only",
  "Только облик: сила героя не меняется": "Looks only, no stat change",
  "Куплено и надето: {name}": "Bought and equipped: {name}",
  "Снято: {name}": "Removed: {name}",
  "Надето: {name}": "Equipped: {name}",
  "Покупки восстановлены: {#}": "Purchases restored: {#}",
  "Покупок пока нет": "No purchases yet",
  "НАДЕТО": "EQUIPPED",
  "КУПИТЬ ЗА {#} $": "BUY FOR {#} $",
  "СНЯТЬ": "REMOVE",
  "НАДЕТЬ": "EQUIP",
  "ВОССТАНОВИТЬ ПОКУПКИ": "RESTORE PURCHASES",
  "НАЗАД": "BACK",
  "ОБЛИК МЕЧА": "SWORD SKIN",
  "ЭФФЕКТ УДАРА": "HIT EFFECT",
  "ОФОРМЛЕНИЕ ПОБЕДЫ": "VICTORY STYLE",
  "Клинок Бездны": "Abyss Blade",
  "обсидиан, живые руны, шлейф тьмы": "obsidian, runes, dark trail",
  "Клинок Рассвета": "Dawn Blade",
  "золото, сияние и искры": "gold, glow and sparks",
  "Ледяной Клык": "Frost Fang",
  "кристалл, иней и снегопад": "crystal, frost, snow",
  "Гнев грозы": "Storm's Wrath",
  "молния в каждый удар": "lightning on every hit",
  "Призраки павших": "Ghosts of the Fallen",
  "души вырываются из врага": "souls burst from foes",
  "Королевский триумф": "Royal Triumph",
  "корона, лучи и золото": "crown, rays, gold",
  "Синее пламя": "Blue Flame",
  "костёр душ и рой искр": "soul pyre and sparks",

  // --- покупки
  "ТЕСТ: RevenueCat Test Store": "TEST: RevenueCat Test Store",
  "ТЕСТ: оплата не списывается": "TEST: no real payment",
  "Товар пока недоступен в магазине": "This item is not available in the store yet",
  "Покупка не прошла. Попробуйте позже": "Purchase failed. Please try again later",
  "Не удалось связаться с магазином": "Could not reach the store",
  "ТЕСТОВАЯ ПОКУПКА": "TEST PURCHASE",
  "ТЕСТОВАЯ ПОДДЕРЖКА": "TEST SUPPORT",
  "«{name}» за {price}": "“{name}” for {price}",
  "Тестовый режим: деньги не списываются. В версии для App Store покупка пройдёт через Apple.": "Test mode: no money is charged. In the App Store version the purchase goes through Apple.",
  "Тестовый режим: деньги не списываются. В версии для App Store платёж пройдёт через Apple.": "Test mode: no money is charged. In the App Store version the payment goes through Apple.",
  "КУПИТЬ {price}": "BUY {price}",
  "ПОДДЕРЖАТЬ {price}": "SUPPORT {price}",

  // --- рейтинг
  "ИМЯ В РЕЙТИНГЕ": "LEADERBOARD NAME",
  "2-16 символов: буквы, цифры, пробел. Имя видят другие игроки.": "2-16 characters: letters, digits, spaces. Other players see this name.",
  "Такое имя не подходит": "This name is not allowed",
  "РЕЙТИНГ": "LEADERBOARD",
  "по побеждённым боссам, затем по уровню": "by bosses defeated, then by level",
  "{#} место": "#{#}",
  "место: ...": "rank: ...",
  "Боссы {#}  Ур. {#}  Раунд {#}": "Bosses {#}  Lv. {#}  Round {#}",
  "Загрузка...": "Loading...",
  "Онлайн": "Online",
  "Нет сети: сохранённая таблица {when}": "Offline: saved table {when}",
  "Онлайн-рейтинг появится в следующей версии: показан ваш результат": "Online leaderboard comes in the next version: showing your result",
  "Сервер рейтинга не подключён: показан ваш результат": "Leaderboard server not connected: showing your result",
  " · ваш результат отправится при появлении сети": " · your result will be sent when you're online",
  "ИМЯ": "NAME",
  "БОССЫ": "BOSSES",
  "УР.": "LV.",
  "РАУНД": "ROUND",
  "ИМЯ: {name}": "NAME: {name}",
  "ОБНОВИТЬ": "REFRESH",

  // --- настройки и поддержка
  "НАСТРОЙКИ": "SETTINGS",
  "Громкость": "Volume",
  "Сигнал «приседай»": "“Squat” alert",
  "Вибрация": "Vibration",
  "Вибрация (Android)": "Vibration (Android)",
  "Язык": "Language",
  "ВЫКЛ": "OFF",
  "ВКЛ": "ON",
  "ТИХО": "QUIET",
  "НОРМА": "NORMAL",
  "ГРОМКО": "LOUD",
  "ПРОВЕРИТЬ СИГНАЛ": "TEST ALERT",
  "Наш Telegram": "Our Telegram",
  "Камера и советы": "Camera & tips",
  "Поддержать проект": "Support the project",
  "ПОДДЕРЖАТЬ ПРОЕКТ": "SUPPORT THE PROJECT",
  "Игра бесплатна: без рекламы и без платной силы. Если Ash & Iron помогает вам тренироваться, поддержите разработку.": "The game is free: no ads and no pay-to-win. If Ash & Iron helps you train, please support its development.",
  "Спасибо, рыцарь! Костёр горит ярче.": "Thank you, knight! The bonfire burns brighter.",
  "Вы поддержали проект: {#} раз. Спасибо!": "You supported the project {#} times. Thank you!",
  "Кружка эля": "Mug of ale",
  "на кофе разработчику": "coffee for the dev",
  "Факел для костра": "Bonfire torch",
  "на новые локации и врагов": "new lands and foes",
  "Меч в кузню": "Forge sword",
  "на большое обновление": "a big update",

  // --- тестовые клавиши
  "Тест: +10 алых, +1 синий, +300 пепла": "Test: +10 red, +1 blue, +300 ash",
  "Тест: следующий бой - босс (#{#})": "Test: next fight is a boss (#{#})",
  "Тест: {loc} (#{n})": "Test: {loc} (#{n})",
};

export const EN_KEYS = Object.keys(EN); // для тестов
