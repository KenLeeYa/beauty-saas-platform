import {z} from 'zod';
import {contactSchema} from './contact-schema';

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
