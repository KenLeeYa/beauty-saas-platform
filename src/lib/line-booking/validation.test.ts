import {describe,it,expect} from 'vitest';
import {message,changeInput} from './validation';

describe('booking API error boundary',()=>{
  it('does not expose database implementation details',()=>{
    expect(message(new Error('relation line_booking.bookings does not exist'))).toBe('request failed');
  });
  it('reports a resource conflict without SQL details',()=>{
    expect(message({code:'23P01',message:'conflicting key value violates exclusion constraint'})).toBe('unavailable');
  });
  it('requires a target time for rescheduling',()=>{
    expect(changeInput.safeParse({store:'demo',action:'reschedule'}).success).toBe(false);
  });
});
