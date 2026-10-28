export type Locale = 'zh-TW' | 'en' | 'vi';
export type LanguagePreference = Locale | 'auto';
export const languageCookie = 'beauty_language';

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'auto' || value === 'zh-TW' || value === 'en' || value === 'vi';
}

export function resolveLocale(preference: unknown, acceptLanguage: string | null): Locale {
  if (isLanguagePreference(preference) && preference !== 'auto') return preference;
  const languages = (acceptLanguage ?? '').slice(0, 4096).split(',').map((part, order) => {
    const [tag, ...parameters] = part.trim().toLowerCase().split(';');
    const quality = parameters.find(value => value.trim().startsWith('q='));
    const weight = quality ? Number(quality.trim().slice(2)) : 1;
    return {tag, weight, order};
  }).filter(item => Number.isFinite(item.weight) && item.weight > 0 && item.weight <= 1)
    .sort((a, b) => b.weight - a.weight || a.order - b.order);
  for (const {tag} of languages) {
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
    if (tag === 'vi' || tag.startsWith('vi-')) return 'vi';
    if (tag === 'zh' || tag.startsWith('zh-')) return 'zh-TW';
  }
  return 'zh-TW';
}
