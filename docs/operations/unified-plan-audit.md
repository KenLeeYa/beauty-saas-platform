# Unified operations plan audit

Checked against the 16 tasks in `docs/superpowers/plans/2026-10-05-unified-beauty-operations.md` on 2026-10-05. “Complete” means implemented and tested locally with synthetic data. “Partial” identifies an observable missing piece; it is not a claim of production readiness.

| Task | Local state | Evidence and remaining work |
| --- | --- | --- |
| 1. Freeze authority | Complete | `docs/architecture/line-public-core-contract.md` maps mobile routes to the existing `public` schema; old prototype entry routes were retired and local-only files archived. |
| 2. LINE identity links | Partial | Provider-scoped verified token, explicit customer link, employee proof/approval/revocation and cross-tenant tests exist. Real LINE provider callback and store credentials remain untested. |
| 3. One catalog/policy | Complete | Mobile catalog and availability call existing public booking services, including staff capability and resource availability. |
| 4. Book/change/calendar | Complete | Shared public booking IDs, holds, allocations, outbox, manual phone entry, customer change/cancel, owner/staff masked calendars and race tests. Receptionist/beautician/customer integration test covers the sequence. |
| 5. Per-store channel/module | Partial | Per-store channel references, fail-closed messaging, module visibility and webhook scope are implemented; real LINE rich menus, messages and secrets were not configured. |
| 6. Staff capability | Complete | Effective dates, online/walk-in eligibility and audit, enforced by availability and hold transactions; integration test passes. |
| 7. Rotation/capacity | Complete | Fair unspecified-staff claims and same-capacity race tests pass. A merchant-versioned walk-in policy controls earliest start, setup buffer and online advance time. Immediate dispatch fails closed until configured. Owner-only immediate reassignment requires a reason, records an override event, and event-replay assertions check compensation of the original staff member and allocation to the replacement. |
| 8. Reassignment | Complete | Future booking ID is preserved and conflicts/leave/role checks plus audit and notification are tested. The merchant operations page supports reassignment. Reception can now view failed dispatch and pending-payment exceptions and acknowledge failed claims with an audited reason; the staff phone agenda remains available. |
| 9. CRM status | Complete | Scoped VIP/blacklist with expiry, booking block and audit is implemented and tested. Merchant operations has status controls and a read-only marketing consent history. Marketing is separate from transactional notices, and no marketing send path is activated. |
| 10. Promotion policies | Partial | Versioned quote, caps, attestation, exclusive stacking, birthday use, draft/publish controls and synthetic checkout price snapshot are tested. Real checkout is not connected. |
| 11. Member ledgers | Partial | Synthetic wallet principal/bonus, QR retry, partial refund, coupon/package issue/reserve/redeem/release/cancel/refund, immutable issued terms, automatic cancellation release and append-only event tests pass. External settlement and liability contract remain. |
| 12. Commission rules | Complete | Effective version selection, calculation bases, refund negative quote and proportional multi-segment allocation are tested. A completed segment with multiple providers needs an explicit percent or fixed allocation, preview, audited immutable version, and full participant match before payroll draft. Approved payroll locks later allocation changes. Synthetic scope only. |
| 13. Member/module UI | Partial | Customer mobile balance/issued-rights display and merchant review controls exist, including module-off outstanding-rights test. The 390px browser checks cover labels and horizontal overflow. Four-role keyboard tab order, visible focus, accessibility-tree headings/links, customer booking validation alerts, and reschedule dialog Escape/focus restoration passed. A live screen-reader verification is unavailable here. Real payment is an external activation step, not a synthetic UI requirement. |
| 14. Attendance | Partial | Immutable multi-device events, corrections, overtime review, CSV export and mobile/desktop views are tested. Jurisdiction-specific retention policy needs review. |
| 15. Payroll | Complete | Test-only source-hashed drafts, manager approval, employee payslip, immutable lines and next-period refund adjustments are tested. The approved scope stops at simulation, approval and payslips; automatic bank transfers and actual wages are out of scope. Real-world rule reconciliation remains an optional activation review. |
| 16. Acceptance/release | Partial | Lint/typecheck/unit/build, synthetic PostgreSQL and mobile/desktop browser flows are local gates. The integrated `public` trial runs separately on loopback port 45144 with four synthetic role entry links; old port 45140 has been stopped and archived. Before retirement, all 31 migrations were rehearsed against an empty local database; the active candidate retains 29 files after removing two prototype migrations. A scrubbed production-shaped migration rehearsal, live LINE integration and release approval need separate access. |

## Gates kept closed

`APP_ENV=test` and `MEMBER_VALUE_TEST_ONLY=true` are required for synthetic value/benefit writes. `APP_ENV=test` and `PAYROLL_TEST_ONLY=true` are required for payroll writes. Publishing benefit and commission policy through the new merchant endpoint is also test gated. No real payment, LINE messaging, bank transfer or production database write was performed.

Walk-in timing has no seeded default. Each merchant must save a policy before using
immediate dispatch. Multi-provider commission allocation has no inferred default:
the manager publishes a version for the actual providers and booking segment before
payroll can be calculated. The percent method splits the published primary-provider
commission pool; fixed amounts must fit within that pool. The preview shows the
minor-unit amounts and the booking version used for publication. All financial
examples in tests are synthetic.
