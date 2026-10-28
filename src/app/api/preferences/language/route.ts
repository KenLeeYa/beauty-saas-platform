import {NextRequest, NextResponse} from 'next/server';
import {z} from 'zod';
import {languageCookie, resolveLocale} from '@/lib/i18n/locale';
import {assertSameOrigin} from '@/server/security/request';
import {saveNotificationLanguage} from '@/server/notifications/language';

const schema = z.object({preference: z.enum(['auto', 'zh-TW', 'en', 'vi']),
  store: z.string().min(1).max(100).optional(), trackingToken: z.string().min(32).max(256).optional(),
}).strict().refine(value => !(value.store && value.trackingToken));

export async function POST(request: NextRequest) {
  try {assertSameOrigin(request);} catch {
    return NextResponse.json({error: 'FORBIDDEN'}, {status: 403});
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({error: 'BAD_REQUEST'}, {status: 400});
  const {preference} = parsed.data;
  const locale = resolveLocale(preference, request.headers.get('accept-language'));
  try {await saveNotificationLanguage(request, locale, parsed.data);} catch {
    return NextResponse.json({error: 'PREFERENCE_NOT_SAVED'}, {status: 409, headers: {'Cache-Control': 'no-store'}});
  }
  const response = NextResponse.json({
    preference, locale,
  }, {headers: {'Cache-Control': 'no-store'}});
  response.cookies.set(languageCookie, preference, {
    httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:',
    path: '/', maxAge: preference === 'auto' ? 0 : 60 * 60 * 24 * 365,
  });
  return response;
}
