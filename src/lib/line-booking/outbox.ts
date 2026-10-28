// A single-iteration worker. The external sender is injected; the default is disabled.
import type {PoolClient} from 'pg';
type Job={id:string;event:string;attempts:number;customer_subject:string|null;booking_id:string};
type Result={id:string;state:'pending'|'delivered';error?:string}|null;
export async function processOneOutbox(client: PoolClient, sender: (job: Job)=>Promise<void>=async()=>{throw Error('LINE delivery not configured');}): Promise<Result> {
  await client.query('BEGIN');
  try {
    const {rows:[job]}=await client.query<Job>(`select o.id,o.event,o.attempts,b.customer_subject,b.id as booking_id
      from line_booking.outbox o join line_booking.bookings b on b.id=o.booking_id and b.store_id=o.store_id
      where o.state='pending' and o.next_attempt_at<=now()
      order by o.next_attempt_at for update of o skip locked limit 1`);
    if(!job){await client.query('COMMIT');return null;}
    try {
      await sender(job);
      await client.query("update line_booking.outbox set state='delivered',attempts=attempts+1 where id=$1",[job.id]);
      await client.query('COMMIT');return {id:job.id,state:'delivered'};
    } catch(error) {
      await client.query("update line_booking.outbox set attempts=attempts+1,next_attempt_at=now()+make_interval(mins => least(60,power(2,least(attempts,6))::int)) where id=$1",[job.id]);
      await client.query('COMMIT');return {id:job.id,state:'pending',error:error instanceof Error?error.message:'delivery failed'};
    }
  } catch(error) {await client.query('ROLLBACK');throw error;}
}
