import type {NextRequest} from 'next/server';

import {AppError} from '@/server/http/errors';
import {jsonError,jsonSuccess} from '@/server/http/response';
import {processLineWebhook} from '@/server/notifications/line-webhook';
import {getRequestId} from '@/server/security/request';

const MAX_BODY_BYTES=256*1024;

export async function POST(request:NextRequest,{params}: {
  params:Promise<{organizationSlug:string;channelId:string}>}) {
  const requestId=getRequestId(request);
  try {
    const length=Number(request.headers.get('content-length')??'0');
    if(Number.isFinite(length)&&length>MAX_BODY_BYTES) throw new AppError('BAD_REQUEST','Webhook too large',413);
    const body=await request.text();
    if(Buffer.byteLength(body,'utf8')>MAX_BODY_BYTES) throw new AppError('BAD_REQUEST','Webhook too large',413);
    const route=await params;
    const result=await processLineWebhook({organizationSlug:route.organizationSlug,
      channelId:route.channelId,body,
      signature:request.headers.get('x-line-signature')??''});
    return jsonSuccess(result,{headers:{'x-request-id':requestId}});
  } catch(error) {return jsonError(error,requestId);}
}
