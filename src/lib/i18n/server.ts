import 'server-only';
import {cache} from 'react';
import {cookies, headers} from 'next/headers';
import {isLanguagePreference, languageCookie, resolveLocale} from './locale';
import {translate, type MessageKey} from './messages';

export const getLanguage = cache(async () => {
  const cookie = (await cookies()).get(languageCookie)?.value;
  const preference = isLanguagePreference(cookie) ? cookie : 'auto';
  const locale = resolveLocale(preference, (await headers()).get('accept-language'));
  return {locale, preference, t: (key: MessageKey) => translate(locale, key)};
});
