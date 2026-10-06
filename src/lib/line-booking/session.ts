import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
export type SealedSession={store:string;exp:number;subject?:string;slug?:string;state?:string;nonce?:string};

const key=()=>{const value=process.env.LINE_BOOKING_SESSION_SECRET;if(!value||value.length<32) throw Error('session signing not configured');return value;};
export const randomState=()=>randomBytes(24).toString('base64url');
export function seal(payload: SealedSession): string {
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig=createHmac('sha256',key()).update(body).digest('base64url');
  return `${body}.${sig}`;
}
export function open(token: string | undefined): SealedSession {
  if(!token) throw Error('authentication required');
  const [body,sig,...extra]=token.split('.');
  if(!body||!sig||extra.length) throw Error('invalid session');
  const expected=createHmac('sha256',key()).update(body).digest();
  const actual=Buffer.from(sig,'base64url');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected)) throw Error('invalid session');
  const data: unknown=JSON.parse(Buffer.from(body,'base64url').toString());
  if(!data||typeof data!=='object'||!('exp' in data)||typeof data.exp!=='number'||data.exp<Date.now()||!('store' in data)||typeof data.store!=='string') throw Error('session expired');
  return data as SealedSession;
}
export function cookie(name: string,value: string,maxAge: number,secure=true): string {return `${name}=${value}; Path=/; HttpOnly; ${secure?'Secure; ':''}SameSite=Lax; Max-Age=${maxAge}`;}
