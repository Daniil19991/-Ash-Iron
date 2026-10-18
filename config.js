// Настройки сервера рейтинга (Supabase). Пока поля пустые, рейтинг работает только на устройстве:
// игра полностью играбельна без сети, а результаты отправятся, когда сервер появится.
// Как получить значения — см. README_DEPLOY.md, раздел «Рейтинг».
export const LEADERBOARD = {
  url: "", // например "https://abcdefgh.supabase.co"
  anonKey: "", // публичный anon-ключ проекта (не service_role!)
  table: "leaderboard",
};

// Покупки. На сайте и в тестовых сборках — тестовый режим: оплата не списывается.
// В приложении для App Store здесь включится StoreKit (второй этап).
export const STORE = {
  bundleId: "com.ashandiron.fitnessrpg",
};
