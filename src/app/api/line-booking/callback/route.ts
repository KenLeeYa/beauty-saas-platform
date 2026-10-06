import {message} from '@/lib/line-booking/validation';
import {withDb} from '@/lib/line-booking/db';
import {verifyLine} from '@/lib/line-booking/identity';
import {open,seal,cookie} from '@/lib/line-booking/session';
import {z} from 'zod';
import {localDemoEnabled} from '@/lib/line-booking/local-demo';
import {finishMobileLineLogin} from '@/server/auth/line-oauth';
import {AppError} from '@/server/http/errors';

export async function GET(request: Request) {
  try {
    if (!localDemoEnabled(request.headers.get('host'))) return finishMobileLineLogin(request);
    const url=new URL(request.url);
    const oauthToken=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('line_booking_oauth='))?.slice('line_booking_oauth='.length);
    const oauth=open(oauthToken);
    const code=url.searchParams.get('code');
    if(!oauth.state || !oauth.nonce || url.searchParams.get('state')!==oauth.state || !code) throw Error('invalid OAuth state');
    const {rows:[store]}=await withDb(c=>c.query('select id,slug,line_provider_id,line_channel_id from line_booking.stores where id=$1',[oauth.store]));
    if(!store || store.slug!==oauth.slug) throw Error('store not found');
    const secrets=z.record(z.string(),z.string()).parse(JSON.parse(process.env.LINE_BOOKING_CHANNEL_SECRETS_JSON||'{}') as unknown);
    const secret=secrets[store.line_channel_id];
    if(!secret) throw Error('LINE channel secret not configured');
    const body=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:new URL('/api/line-booking/callback',request.url).toString(),client_id:store.line_channel_id,client_secret:secret});
    const response=await fetch('https://api.line.me/oauth2/v2.1/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,cache:'no-store'});
    if(!response.ok) throw Error('LINE token exchange failed');
    const tokens=await response.json();
    const subject=await verifyLine(store,`Bearer ${tokens.id_token}`,oauth.nonce);
    const session=seal({store:store.id,subject,exp:Date.now()+8*3600000});
    const headers=new Headers({location:`/line-booking/${encodeURIComponent(store.slug)}`});
    headers.append('set-cookie',cookie('line_booking_session',session,8*3600));
    headers.append('set-cookie',cookie('line_booking_oauth','',0));
    return new Response(null,{status:302,headers});
  } catch(error) {if(error instanceof AppError)return Response.json({error:error.message},{status:error.status});return Response.json({error:message(error)},{status:400});}
}
