import i18next from "i18next";
import FsBackend from "i18next-fs-backend";

const i18n = i18next.createInstance();

i18n
  .use(FsBackend)
  .init({
    fallbackLng: "en",
    supportedLngs: ["en", "ar"],
    backend: { loadPath: "locales/{{lng}}/{{ns}}.json" },
    interpolation: { escapeValue: false }
  });

export default i18n;