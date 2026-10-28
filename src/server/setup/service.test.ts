import {beforeEach, expect, it, vi} from "vitest";
import type {OrganizationContext} from "../authorization/context";

const mocks=vi.hoisted(()=>({
  entitlement:vi.fn(), transaction:vi.fn(), bookingPolicy:vi.fn(),
  depositFind:vi.fn(), depositUpdate:vi.fn(), cancellationFind:vi.fn(), cancellationUpdate:vi.fn(),
  progressUpdate:vi.fn(), progressFind:vi.fn(), audit:vi.fn(),
}));
vi.mock("../entitlements/service",()=>({requireEntitlement:mocks.entitlement}));
vi.mock("../database/prisma",()=>({prisma:{
  $transaction:mocks.transaction,
  merchant_setup_progress:{findUnique:mocks.progressFind},
}}));
import {runMerchantSetupAction} from "./service";

const context:OrganizationContext={
  session:{id:"session",profileId:"owner",email:"owner@example.test",displayName:"Owner",platformRole:null,expiresAt:new Date("2099-01-01"),csrfTokenHash:"test"},
  organization:{id:"organization-a",slug:"a",name:"A",status:"ACTIVE"},
  location:{id:"branch-a",slug:"a",name:"A",timezone:"Asia/Taipei"},
  roles:new Set(["ORGANIZATION_OWNER"]),allLocations:true,accessibleLocationIds:new Set(["branch-a"]),linkedStaffProfileId:null,
};
const payload={action:"POLICIES",slotIntervalMinutes:30,minimumLeadMinutes:60,maximumAdvanceDays:60,holdMinutes:10,cancellationCutoffHours:24,depositMode:"FIXED",depositAmountMinor:50000,depositPercentage:20} as const;

beforeEach(()=>{
  vi.resetAllMocks();
  mocks.entitlement.mockResolvedValue({enabled:true});
  mocks.depositFind.mockResolvedValue({id:"deposit-a"});
  mocks.cancellationFind.mockResolvedValue({id:"cancellation-a"});
  mocks.progressFind.mockResolvedValue({policies_completed_at:new Date()});
  mocks.transaction.mockImplementation(async (callback:(tx:unknown)=>Promise<unknown>)=>callback({
    location_booking_policies:{upsert:mocks.bookingPolicy},
    deposit_policies:{findFirst:mocks.depositFind,update:mocks.depositUpdate},
    cancellation_policies:{findFirst:mocks.cancellationFind,update:mocks.cancellationUpdate},
    merchant_setup_progress:{update:mocks.progressUpdate},audit_logs:{create:mocks.audit},
  }));
});

it("clears incompatible fee amounts and percentages when setup switches cancellation to deposit forfeiture",async()=>{
  await runMerchantSetupAction({context,payload,requestId:"setup-qa"});
  expect(mocks.cancellationUpdate).toHaveBeenCalledWith({where:{id:"cancellation-a"},data:expect.objectContaining({
    late_fee_mode:"DEPOSIT_FORFEIT",late_fee_fixed_minor:null,late_fee_percentage:null,
    no_show_fee_mode:"DEPOSIT_FORFEIT",no_show_fee_fixed_minor:null,no_show_fee_percentage:null,
  })});
  for(const lookup of [mocks.depositFind,mocks.cancellationFind]) expect(lookup).toHaveBeenCalledWith(expect.objectContaining({where:{organization_id:"organization-a",location_id:"branch-a",service_variant_id:null}}));
  expect(mocks.bookingPolicy).toHaveBeenCalledWith(expect.objectContaining({where:{location_id:"branch-a"},create:expect.objectContaining({organization_id:"organization-a",location_id:"branch-a"})}));
  expect(mocks.audit).toHaveBeenCalledWith({data:expect.objectContaining({organization_id:"organization-a",location_id:"branch-a",actor_profile_id:"owner",action:"MERCHANT_SETUP_POLICIES"})});
});

it("denies setup policy writes for service providers before starting a transaction",async()=>{
  await expect(runMerchantSetupAction({context:{...context,roles:new Set(["SERVICE_PROVIDER"])},payload,requestId:"denied"})).rejects.toMatchObject({code:"FORBIDDEN"});
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("keeps setup entitlement checks ahead of all policy writes",async()=>{
  mocks.entitlement.mockRejectedValue(new Error("disabled"));
  await expect(runMerchantSetupAction({context,payload,requestId:"disabled"})).rejects.toThrow("disabled");
  expect(mocks.transaction).not.toHaveBeenCalled();
});
