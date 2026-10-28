# LINE mobile booking and the public booking core

Status: implementation contract, 2026-10-05. The current `line_booking` routes remain a local prototype until the delegation below is complete. No live store entry should target them.

## Authority

`public` organization, location, service, service variant, staff assignment, booking policy, booking, segment, allocation, hold and notification tables are the single booking authority. The existing merchant calendar and public booking page already use them. A mobile request must resolve an organization and location from a configured store entry, then derive authorization from a verified session; a slug or client-provided role is never authorization. Never dual-write a booking or allocation to `line_booking`.

The candidate schema has its own store, service, staff, availability and booking records. IDs and semantics differ: `public` supports variants, pre/post buffers, alternative resource types and quantities, day schedules, cancellation policy and multi-segment booking. Copying a candidate ID into the public core is invalid. Preserve candidate rows as trial data and do not migrate by destructive drop.

## Route mapping

| Mobile route | Delegated public operation | Transition rule |
| --- | --- | --- |
| `GET /api/line-booking/catalog` | `getPublicCatalog` / `/api/public/catalog` | Return public service variant and staff IDs after configured organization/location lookup. |
| `GET /api/line-booking/availability` | `getPublicAvailability` / `/api/public/availability` | Derive a public session and reuse policy, leave and resource checks. |
| `POST /api/line-booking/booking` | `createBookingHold`, then `confirmPublicBooking` | Require verified customer or staff actor, public IDs and idempotency key. Manual phone/personal-LINE source requires staff capability. |
| `POST /api/line-booking/booking/[id]/confirm` | `confirmPublicBooking` | Confirm the public hold; retire the candidate hold confirmation. |
| `PATCH /api/line-booking/booking/[id]` | `reschedulePublicBooking` | Reuse tracking/session authorization, policy and atomic reallocation. |
| `DELETE /api/line-booking/booking/[id]` | `cancelPublicBooking` | Reuse cancellation policy and audit. |
| `GET /api/line-booking/my-bookings` | Public booking read scoped to a verified customer link | Never search by client supplied phone/name or raw LINE subject. |
| `GET /api/line-booking/calendar` | Merchant/staff calendar read over public bookings | Owner sees location detail; assigned staff see their customers; other staff see busy time only. |
| `GET /api/line-booking/login`, callback | Per-store channel configuration and verified LINE identity | Provider/channel subject, nonce, state and revocable server session; no guessed identity merge. |

`/api/public/holds`, `/api/public/bookings/confirm`, `/api/public/bookings/cancel` and `/api/public/bookings/reschedule` remain their existing public entry routes. The merchant manual booking API must call the same booking allocation transaction and retain the original source label. Existing `notification_outbox` is the notification authority; delivery failure cannot roll back an already confirmed booking. The current candidate `line_booking` write routes must be retired or changed to delegate before any real rich-menu or share link is enabled.

## Invariants and acceptance

One public allocation transaction must reserve qualified staff and resource capacity across customer, front desk, owner and mobile paths. Retried idempotency keys produce one booking and one outbox event. Holds expire without blocking future capacity. Changes follow public cancellation/reschedule policy and preserve audit history. Each read and mutation checks organization and location scope on the server.

Baseline focused tests on 2026-10-05: `npm test -- src/server/authorization/capabilities.test.ts src/server/booking/pricing.test.ts src/server/booking/state-machine.test.ts` passed, 3 files and 11 tests. The public booking services currently have no direct `*.test.ts` files under `src/server/public-booking`; integration coverage and a cross-interface race test are required before activation.
