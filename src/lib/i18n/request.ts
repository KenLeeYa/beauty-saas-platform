import { NextRequest } from 'next/server';
import { languageCookie, resolveLocale, type Locale } from './locale';

export function requestLocale(request?: Request): Locale {
  if (!request) return 'zh-TW';
  const cookies = new NextRequest(request.url, { headers: request.headers }).cookies;
  return resolveLocale(cookies.get(languageCookie)?.value, request.headers.get('accept-language'));
}
