export type Language = 'de' | 'en';

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'de', label: 'DE' },
  { code: 'en', label: 'EN' },
];

export const LANGUAGE_STORAGE_KEY = 'parkshare.language';

/** A saved manual choice wins; otherwise German browsers get German and everyone else English. */
export function detectLanguage(stored: string | null, browserLanguages: readonly string[]): Language {
  if (stored === 'de' || stored === 'en') return stored;
  return browserLanguages[0]?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export const localeFor = (language: string) => (language === 'de' ? 'de-DE' : 'en-GB');
