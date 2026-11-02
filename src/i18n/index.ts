import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { detectLanguage, LANGUAGE_STORAGE_KEY, type Language } from './detect';
import de from './locales/de.json';
import en from './locales/en.json';

function readStoredLanguage(): string | null {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function changeLanguage(language: Language) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    /* storage unavailable (private mode) – choice lasts for this visit */
  }
  void i18n.changeLanguage(language);
}

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

void i18n.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: detectLanguage(readStoredLanguage(), navigator.languages?.length ? navigator.languages : [navigator.language]),
  fallbackLng: 'en',
  supportedLngs: ['de', 'en'],
  interpolation: { escapeValue: false },
});

export default i18n;
