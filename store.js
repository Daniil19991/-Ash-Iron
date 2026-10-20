// Покупки косметики и поддержка проекта. Одна точка входа для игры: buy / tip / restore / owns / price.
// Режимы:
//   "test"           — сайт, Android и iOS без ключа: оплата не списывается, подтверждение — окно игры;
//   "revenuecat-test" — iOS с ключом RevenueCat Test Store: покупки симулирует RevenueCat;
//   "live"           — настоящие платежи App Store. Выключены, пока REVENUECAT.allowRealPayments = false.
import { REVENUECAT, STORE } from "./config.js";
import { COSMETICS } from "./cosmetics.js";
import { hasPlugin, isIOS, native } from "./platform.js";
import { loadJSON, saveJSON } from "./storage.js";
import { tf } from "./i18n.js";

const OWNED_KEY = "ash-and-iron-purchases";
const TIPS_KEY = "ash-and-iron-tips";

/** Поддержка проекта: расходуемые покупки без игровой выгоды (в App Store — consumable). */
export const TIPS = [
  { id: "support_ale", name: "Кружка эля", price: "1 $", desc: "на кофе разработчику" },
  { id: "support_torch", name: "Факел для костра", price: "3 $", desc: "на новые локации и врагов" },
  { id: "support_forge", name: "Меч в кузню", price: "5 $", desc: "на большое обновление" },
];

/** Платное снаряжение (поддержка проекта, но с игровой пользой): id товара -> цена по умолчанию. */
export const PAID_ITEMS = { weapon_barbell: "10 $" };

export const productId = (id) => `${STORE.bundleId}.${id}`;

/** Какой режим допустим для ключа (без ключа или для запрещённого ключа — тестовый режим игры). */
export function modeForKey(key, allowRealPayments = REVENUECAT.allowRealPayments) {
  if (!key) return "test";
  if (key.startsWith("test_")) return "revenuecat-test";
  return allowRealPayments ? "live" : "test";
}

const cancelled = (e) => !!(e && (e.userCancelled || e.code === "1" || e.code === 1 || /cancel/i.test(e.message || "")));

export class Store {
  /**
   * confirm — функция-диалог ({title, text, note, ok}) => Promise<boolean> для тестового режима;
   * call — вызов нативного плагина (для тестов подменяется).
   */
  constructor(confirm, { call = native, available = () => isIOS() && hasPlugin("Purchases") } = {}) {
    this.confirm = confirm;
    this.call = call;
    this.available = available;
    this.mode = "test";
    this.products = {}; // id игры -> продукт RevenueCat (цена в валюте магазина)
    this.lastError = "";
    this.owned = new Set(loadJSON(OWNED_KEY, []));
    this.tips = loadJSON(TIPS_KEY, 0); // сколько раз игрок поддержал проект
  }

  /** Подключение RevenueCat в iOS-приложении. На сайте и без ключа ничего не делает. */
  async init(apiKey = REVENUECAT.iosApiKey, allowRealPayments = REVENUECAT.allowRealPayments) {
    const mode = modeForKey(apiKey, allowRealPayments);
    if (mode === "test" || !this.available()) return this.mode;
    try {
      await this.call("Purchases", "configure", { apiKey });
      this.mode = mode;
      await this.loadProducts();
      await this.sync(await this.call("Purchases", "getCustomerInfo"));
    } catch (e) {
      console.warn("RevenueCat недоступен, тестовый режим игры", e);
      this.mode = "test";
    }
    return this.mode;
  }

  get viaRevenueCat() {
    return this.mode !== "test";
  }

  /** Надпись о тестовом режиме для витрины (null — настоящие платежи). */
  get badge() {
    return this.mode === "live" ? null : this.mode === "revenuecat-test" ? "ТЕСТ: RevenueCat Test Store" : "ТЕСТ: оплата не списывается";
  }

  async loadProducts(ids = null) {
    const all = ids || [...COSMETICS.map((c) => c.id), ...Object.keys(PAID_ITEMS), ...TIPS.map((t) => t.id)];
    const res = await this.call("Purchases", "getProducts", { productIdentifiers: all.map(productId), type: "NON_SUBSCRIPTION" });
    for (const p of (res && res.products) || []) {
      const id = p.identifier.startsWith(`${STORE.bundleId}.`) ? p.identifier.slice(STORE.bundleId.length + 1) : p.identifier;
      this.products[id] = p;
    }
  }

  /** Купленное по данным магазина (разовые покупки косметики; поддержка не «владеется»). */
  sync(res) {
    const info = res && (res.customerInfo || res);
    const tipIds = new Set(TIPS.map((t) => t.id));
    for (const t of (info && info.nonSubscriptionTransactions) || []) {
      const id = t.productIdentifier.replace(`${STORE.bundleId}.`, "");
      if (!tipIds.has(id)) this.owned.add(id);
    }
    saveJSON(OWNED_KEY, [...this.owned]);
  }

  owns(id) {
    return this.owned.has(id);
  }

  /** Цена: из магазина, если он подключён; иначе 1 $ (в App Store ближайшая — 0,99 $), гриф — 10 $. */
  price(id) {
    const p = this.products[id];
    return p && p.priceString ? p.priceString : PAID_ITEMS[id] || "1 $";
  }

  tipPrice(tip) {
    const p = this.products[tip.id];
    return p && p.priceString ? p.priceString : tip.price;
  }

  grant(id) {
    this.owned.add(id);
    saveJSON(OWNED_KEY, [...this.owned]);
  }

  /** Покупка через RevenueCat (окно покупки показывает магазин). true — прошла. */
  async purchase(id) {
    this.lastError = "";
    const product = this.products[id];
    if (!product) {
      this.lastError = "Товар пока недоступен в магазине";
      return false;
    }
    try {
      await this.call("Purchases", "purchaseStoreProduct", { product });
      return true;
    } catch (e) {
      if (!cancelled(e)) this.lastError = "Покупка не прошла. Попробуйте позже";
      return false;
    }
  }

  /** Покупка косметики. true — вещь теперь куплена. */
  async buy(item) {
    if (this.owns(item.id)) return true;
    if (this.viaRevenueCat) {
      const ok = await this.purchase(item.id);
      if (ok) this.grant(item.id);
      return ok;
    }
    const ok = await this.confirm({
      title: "ТЕСТОВАЯ ПОКУПКА",
      text: tf("«{name}» за {price}", { name: item.name, price: this.price(item.id) }),
      note: "Тестовый режим: деньги не списываются. В версии для App Store покупка пройдёт через Apple.",
      ok: tf("КУПИТЬ {price}", { price: this.price(item.id) }),
    });
    if (ok) this.grant(item.id);
    return ok;
  }

  /** Поддержать проект. true — платёж прошёл. */
  async tip(t) {
    let ok;
    if (this.viaRevenueCat) ok = await this.purchase(t.id);
    else {
      ok = await this.confirm({
        title: "ТЕСТОВАЯ ПОДДЕРЖКА",
        text: tf("«{name}» за {price}", { name: t.name, price: this.tipPrice(t) }),
        note: "Тестовый режим: деньги не списываются. В версии для App Store платёж пройдёт через Apple.",
        ok: tf("ПОДДЕРЖАТЬ {price}", { price: this.tipPrice(t) }),
      });
    }
    if (ok) {
      this.tips += 1;
      saveJSON(TIPS_KEY, this.tips);
    }
    return ok;
  }

  /** Восстановление покупок (обязательно для App Store). */
  async restore() {
    if (this.viaRevenueCat) {
      try {
        this.sync(await this.call("Purchases", "restorePurchases"));
      } catch (e) {
        this.lastError = "Не удалось связаться с магазином";
      }
    }
    return [...this.owned];
  }
}
