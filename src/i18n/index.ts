import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import trCommon from "../locales/tr/common.json";
import trConnection from "../locales/tr/connection.json";
import trDatabase from "../locales/tr/database.json";
import trBackup from "../locales/tr/backup.json";
import trAi from "../locales/tr/ai.json";

import enCommon from "../locales/en/common.json";
import enConnection from "../locales/en/connection.json";
import enDatabase from "../locales/en/database.json";
import enBackup from "../locales/en/backup.json";
import enAi from "../locales/en/ai.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      tr: {
        common: trCommon,
        connection: trConnection,
        database: trDatabase,
        backup: trBackup,
        ai: trAi,
      },
      en: {
        common: enCommon,
        connection: enConnection,
        database: enDatabase,
        backup: enBackup,
        ai: enAi,
      },
    },
    fallbackLng: "en",
    defaultNS: "common",
    ns: ["common", "connection", "database", "backup", "ai"],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "pg-manager-lang",
      caches: ["localStorage"],
    },
  });

export default i18n;

export const LANGUAGES = [
  { code: "tr", name: "Türkçe" },
  { code: "en", name: "English" },
  { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" },
  { code: "es", name: "Español" },
  { code: "ja", name: "日本語" },
  { code: "zh", name: "中文" },
  { code: "ru", name: "Русский" },
  { code: "pt", name: "Português" },
  { code: "ko", name: "한국어" },
  { code: "ar", name: "العربية" },
] as const;
