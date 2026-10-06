import pg from 'pg';
import type {Pool,PoolClient} from 'pg';

let sharedPool: Pool | undefined;
export function pool(): Pool {
  if (!process.env.LINE_BOOKING_DATABASE_URL) throw Error('booking database is not configured');
  const hostname=new URL(process.env.LINE_BOOKING_DATABASE_URL).hostname;
  const ssl=process.env.LINE_BOOKING_DATABASE_SSL==='false'&&['127.0.0.1','localhost'].includes(hostname)?false:{rejectUnauthorized:true};
  sharedPool ??= new pg.Pool({connectionString:process.env.LINE_BOOKING_DATABASE_URL,ssl,max:3});
  return sharedPool;
}

export async function withDb<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client=await pool().connect();
  try { return await fn(client); } finally {client.release();}
}
