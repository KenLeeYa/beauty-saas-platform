import {z} from 'zod';
import {contactSchema} from './contact-schema';
import {AppError} from '@/server/http/errors';
import {translateError} from '@/lib/i18n/messages';
import {requestLocale} from '@/lib/i18n/request';

export const bookingInput=z.object({
  store:z.string().min(1).max(100),serviceId:z.string().uuid(),staffId:z.string().uuid().optional(),
  start:z.string().datetime({offset:true}),name:contactSchema.shape.name,
  phone:contactSchema.shape.phone,source:z.enum(['line','phone','personal-line']),
  idempotencyKey:z.string().uuid(),hold:z.boolean().optional(),
  dispatchMode:z.enum(['immediate','future']).optional()
});
export const storeQuery=z.object({store:z.string().min(1).max(100)});
export const availabilityQuery=storeQuery.extend({service:z.string().uuid(),staff:z.string().uuid().optional(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)});
export const changeInput=z.object({store:z.string().min(1).max(100),action:z.enum(['cancel','reschedule']),start:z.string().datetime({offset:true}).optional()}).refine(x=>x.action==='cancel'||Boolean(x.start));
export function message(error:unknown):string {
  if(error instanceof z.ZodError) return 'invalid input';
  if(error && typeof error==='object' && 'code' in error && error.code==='23P01') return 'unavailable';
  const detail=error instanceof Error?error.message:'';
  const allowed=new Set([
    'authentication required','invalid session','session expired','forbidden','store not found',
    'store not configured','outside staff schedule','resource unavailable','invalid time',
    'booking not found','already cancelled','invalid action','idempotency key conflict',
    'LINE channel not configured','LINE channel secret not configured','LINE token exchange failed',
    'invalid LINE identity','invalid OAuth state','cross-origin request rejected','JSON required',
    'missing booking data','service unavailable','staff unavailable'
  ]);
  return allowed.has(detail)?detail:'request failed';
}

export function publicMessage(error: unknown, request?: Request): string {
  return translateError(requestLocale(request), publicSourceMessage(error));
}

function publicSourceMessage(error: unknown): string {
  if (error instanceof AppError) return error.publicMessage;
  const translations: Record<string, string> = {
    'invalid input': '請檢查輸入內容。', unavailable: '此時段已無法預約，請選擇其他時段。',
    'authentication required': '請先登入。', 'invalid session': '登入已失效，請重新登入。',
    'session expired': '登入已過期，請重新登入。', forbidden: '您目前沒有執行此操作的權限。',
    'store not found': '找不到此店家。', 'store not configured': '店家尚未完成設定。',
    'outside staff schedule': '此時段不在美容師的服務時間內。', 'resource unavailable': '此時段的設備已額滿。',
    'invalid time': '預約時間無效，請重新選擇。', 'booking not found': '找不到預約資料。',
    'already cancelled': '此預約已取消。', 'invalid action': '此操作目前無法執行。',
    'idempotency key conflict': '請求內容已變更，請重新確認預約。',
    'LINE channel not configured': '店家的 LINE 登入尚未設定完成。',
    'LINE channel secret not configured': '店家的 LINE 登入尚未設定完成。',
    'LINE token exchange failed': 'LINE 登入未完成，請重新登入。',
    'invalid LINE identity': 'LINE 身分驗證失敗，請重新登入。',
    'invalid OAuth state': '登入驗證已失效，請重新開始登入。',
    'cross-origin request rejected': '請從店家的連結重新開啟。', 'JSON required': '請求格式無效。',
    'missing booking data': '請填寫完整預約資料。', 'service unavailable': '此服務目前無法預約。',
    'staff unavailable': '此美容師目前無法預約，請選擇其他人員。',
  };
  return translations[message(error)] ?? '無法處理請求，請稍後再試。';
}
