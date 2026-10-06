import {expect,it} from 'vitest';
import {resolveModuleVisibility} from './module-visibility-policy';

it('keeps booking core available and hides optional modules when plan or store disables them',()=>{
  expect(resolveModuleVisibility('ONLINE_BOOKING',false,false)).toBe(true);
  expect(resolveModuleVisibility('CUSTOMER_CRM',false,true)).toBe(false);
  expect(resolveModuleVisibility('CUSTOMER_CRM',true,false)).toBe(false);
  expect(resolveModuleVisibility('CUSTOMER_CRM',true,null)).toBe(true);
  expect(resolveModuleVisibility('MEMBERSHIPS_PACKAGES',true,null)).toBe(false);
});
