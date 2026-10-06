import {expect,it} from 'vitest';
import {maskMobileAgenda} from './calendar-mapper';

const entries=[
  {id:'booking-1',staffId:'staff-1',start:'2030-01-01T10:00:00.000Z',finish:'2030-01-01T11:00:00.000Z',customerName:'Alice',phone:'0912345678',serviceName:'Massage',staffName:'A',source:'PHONE'},
  {id:'booking-2',staffId:'staff-2',start:'2030-01-01T12:00:00.000Z',finish:'2030-01-01T13:00:00.000Z',customerName:'Bob',phone:'0987654321',serviceName:'Facial',staffName:'B',source:'LINE'},
];

it('shows a provider only their own customer and other staff busy time',()=>{
  const result=maskMobileAgenda(entries,false,'staff-1');
  expect(result[0].customer_name).toBe('Alice');
  expect(result[1]).toEqual({id:'busy:staff-2:2030-01-01T12:00:00.000Z',staff_id:'staff-2',start:entries[1].start,finish:entries[1].finish,busy:true});
  expect(JSON.stringify(result[1])).not.toContain('Bob');
});

it('shows authorized owner the full location calendar',()=>{
  expect(maskMobileAgenda(entries,true,null).map(entry=>entry.customer_name)).toEqual(['Alice','Bob']);
});
