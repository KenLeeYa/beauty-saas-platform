import {message,storeQuery} from '@/lib/line-booking/validation';
import {withDb} from '@/lib/line-booking/db';
import {randomState,seal,cookie} from '@/lib/line-booking/session';
import {localDemoEnabled} from '@/lib/line-booking/local-demo';
import {startMobileLineLogin} from '@/server/auth/line-oauth';
import {AppError} from '@/server/http/errors';

export async function GET(request: Request) {
  try {
    const slug=storeQuery.parse(Object.fromEntries(new URL(request.url).searchParams)).store;
    if (!localDemoEnabled(request.headers.get('host'))) return startMobileLineLogin(request,slug);
    const {rows:[store]}=await withDb(c=>c.query('select id,line_channel_id from line_booking.stores where slug=$1',[slug]));
    if(!store?.line_channel_id) throw Error('store not configured');
    const state=randomState(),nonce=randomState();
    const redirect=new URL('/api/line-booking/callback',request.url).toString();
    const url=new URL('https://access.line.me/oauth2/v2.1/authorize');
    url.search=new URLSearchParams({response_type:'code',client_id:store.line_channel_id,redirect_uri:redirect,state,scope:'openid profile',nonce}).toString();
    return new Response(null,{status:302,headers:{location:url.toString(),'set-cookie':cookie('line_booking_oauth',seal({store:store.id,slug,state,nonce,exp:Date.now()+600000}),600)}});
  } catch(error) {if(error instanceof AppError)return Response.json({error:error.message},{status:error.status});return Response.json({error:message(error)},{status:400});}
}
