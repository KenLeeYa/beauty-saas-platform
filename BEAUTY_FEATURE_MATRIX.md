# Beauty requirement / implementation / evidence matrix

All paths are repository-relative. Provider mocks and local identities do not prove real OAuth.

| Requirement | Implementation | Current evidence / boundary |
| --- | --- | --- |
| Tenant and location scope | `src/server/authorization/context.ts`, `src/server/mobile/context.ts` | `tests/tenant-isolation.integration.test.ts`, `tests/operations-access.integration.test.ts` |
| LINE verified linking, approval and revocation | `src/server/auth/line-oauth.ts`, `line-linking.ts`, `line-mobile-session-store.ts` | Employee/mobile/desktop/customer linking integration suites; real LINE remains pending |
| Google cannot merge by matching email | `src/server/auth/profile.ts` | `tests/google-profile-linking.integration.test.ts`; real redirect/sign-in pending |
| Core module gates, existing obligations retained | `src/server/entitlements/module-visibility.ts`, `src/server/members/policy.ts` | Module guard and member policy suites |
| Shared online, manual and walk-in booking core | `src/server/public-booking/booking.ts`, `src/server/mobile/booking.ts` | Public mobile core and reception workflow suites |
| Skills, leave, dispatch, resource contention | `src/server/staff/service-capability.ts`, `src/server/booking/dispatch.ts`, `reassignment.ts` | Staff capability, walk-in dispatch, reassignment suites |
| Customer VIP, restrictions and consent | `src/modules/crm/server/customer-status.ts`, `src/server/merchant/marketing-consent.ts` | Customer status suite and merchant browser consent readback |
| Birthday fields | `src/server/merchant/management.ts` | Existing field support; automatic birthday campaign issuance is not established |
| Paid and bonus funds separated, immutable ledger | `src/server/members/ledger.ts` | Redemption races, QR retry and refund integration cases; synthetic value only |
| Benefits, promotions and checkout | `src/server/members/benefits.ts`, `checkout.ts`, `policy.ts` | Benefits, policy and promotion checkout suites |
| Commission examples, rules, allocations | `src/server/payroll/commission-quote.ts`, `segment-allocation.ts` | Unit examples and payroll-period integration suite |
| Attendance, corrections and payroll locking | `src/server/staff/attendance.ts`, `src/server/payroll/calculation.ts`, `approval.ts` | Attendance and payroll suites; no bank transfer |
| Mobile date replacement and desktop operations | `src/app/line-booking/[store]/booking-experience.tsx`, `src/app/merchant/operations/review.tsx` | Live local browser tests; widths 360/390/430/768/1280 |
| Local LAN test entry | `src/server/mobile/local-trial-policy.ts`, `scripts/msi-local.mjs` | Origin allowlist tests; local synthetic sessions only |
| Privacy export/deletion retaining accounting audit | Existing CRM/privacy contracts | Complete end-user export/deletion flow not established |
| Waitlist refill | Existing dispatch exception queue | Full waitlist/notification dry-run flow not established |
| LINE OA/Mini Shop/MINI App release | Existing channel contracts | No new OA publish, MINI App registration or production exposure performed |

Integration suites verify selected invariants. They do not establish every edge case listed in the continuation prompt; inspect `BEAUTY_TEST_RESULTS.md` for the precise executed scope.
