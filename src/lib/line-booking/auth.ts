import {open} from './session';

export function actor(request: Request,store: {id:string}): string {
  const header=request.headers.get('cookie')||'';
  const value=header.split(';').map(x=>x.trim()).find(x=>x.startsWith('line_booking_session='))?.slice('line_booking_session='.length);
  const session=open(value);
  if(session.store!==store.id||!session.subject) throw Error('forbidden');
  return session.subject;
}
