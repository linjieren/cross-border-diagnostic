import { useTranslation } from "react-i18next";

const LANG_LABELS: Record<string, string> = {
  "zh-CN": "中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
};

export default function LangSwitcher() {
  const { i18n } = useTranslation();
  const supported = i18n.options.supportedLngs;
  const langs = Array.isArray(supported) ? supported : [];

  return (
    <select
      value={i18n.language}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      className="text-sm bg-transparent border border-gray-300 rounded px-2 py-1 text-gray-700 hover:border-gray-400 transition cursor-pointer"
    >
      {langs
        .filter((l) => l !== "cimode")
        .map((lng) => (
          <option key={lng} value={lng}>
            {LANG_LABELS[lng] || lng}
          </option>
        ))}
    </select>
  );
}
