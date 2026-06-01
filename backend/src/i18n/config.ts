import i18next from "i18next";
import { handle, LanguageDetector } from "i18next-http-middleware";
import zhCN from "./locales/zh-CN.json";
import en from "./locales/en.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";

const resources = {
  "zh-CN": { common: zhCN },
  zh: { common: zhCN },
  en: { common: en },
  ja: { common: ja },
  ko: { common: ko },
};

export async function initI18n(): Promise<typeof i18next> {
  await i18next.use(LanguageDetector).init({
    resources,
    lng: "zh-CN",
    fallbackLng: "zh-CN",
    supportedLngs: ["zh-CN", "en", "ja", "ko"],
    ns: ["common"],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    detection: {
      order: ["querystring", "cookie", "header"],
      lookupQuerystring: "lang",
      lookupCookie: "i18n_lang",
      caches: ["cookie"],
    },
  });
  return i18next;
}

export { i18next };
export const i18nMiddleware = handle(i18next);
