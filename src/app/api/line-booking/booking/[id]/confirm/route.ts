import {withDb} from '@/lib/line-booking/db';
import {actor} from '@/lib/line-booking/auth';
import {requireSameOrigin} from '@/lib/line-booking/request-security';
import {message} from '@/lib/line-booking/validation';
import {requirePrototype} from '@/lib/line-booking/prototype-guard';
import {z} from 'zod';

export async function POST(request:Request,{params}: {params:Promise<{id:string}>}) {
  try {
    requirePrototype(request);
    requireSameOrigin(request);
    const {id}=await params;
    const input=z.object({store:z.string().min(1).max(100)}).parse(await request.json() as unknown);
    const result=await withDb(async client=>{
      await client.query('BEGIN');
      try {
        const {rows:[store]}=await client.query('select id from line_booking.stores where slug=$1',[input.store]);
        if(!store) throw Error('store not found');
        const subject=actor(request,store);
        const {rows:[booking]}=await client.query('select * from line_booking.confirm_hold($1,$2,$3)',[store.id,id,subject]);
        await client.query('COMMIT');return {id:booking.id,status:booking.status};
      } catch(error) {await client.query('ROLLBACK');throw error;}
    });
    return Response.json(result);
  } catch(error) {const detail=message(error);return Response.json({error:detail},{status:/authentication|session/.test(detail)?401:/forbidden/.test(detail)?403:400});}
}
