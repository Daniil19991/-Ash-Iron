// Покупки косметики. Одна точка входа для игры: buy / restore / owns / price.
// Сейчас работает тестовый режим (оплата не списывается) — для проверки на сайте.
// В приложении App Store на втором этапе сюда подключается StoreKit через Capacitor.
import { STORE } from "./config.js";
import { loadJSON, saveJSON } from "./storage.js";

const OWNED_KEY = "ash-and-iron-purchases";

export const productId = (id) => `${STORE.bundleId}.${id}`;

export class Store {
  /** confirm — функция-диалог ({title, text, note, ok}) => Promise<boolean>. */
  constructor(confirm) {
    this.confirm = confirm;
    this.mode = "test";
    this.owned = new Set(loadJSON(OWNED_KEY, []));
  }

  owns(id) {
    return this.owned.has(id);
  }

  price() {
    return "1 $"; // в App Store — тариф Tier 1 (0,99 $ / локальная цена Apple)
  }

  grant(id) {
    this.owned.add(id);
    saveJSON(OWNED_KEY, [...this.owned]);
  }

  /** Покупка. true — вещь теперь куплена. */
  async buy(item) {
    if (this.owns(item.id)) return true;
    const ok = await this.confirm({
      title: "ТЕСТОВАЯ ПОКУПКА",
      text: `«${item.name}» за ${this.price()}`,
      note: "Тестовый режим: деньги не списываются. В версии для App Store покупка пройдёт через Apple.",
      ok: `КУПИТЬ ${this.price()}`,
    });
    if (ok) this.grant(item.id);
    return ok;
  }

  /** Восстановление покупок (обязательно для App Store). */
  async restore() {
    return [...this.owned];
  }
}
