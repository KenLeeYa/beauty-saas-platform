# Backend Parity Matrix

## Scope

Beauty 與 StallOrder 共用架構和安全不變量，不共用正式 runtime data。兩個產品各自擁有 repository、Supabase project、database、Auth、Storage、secrets、migrations、backups 與 deployment。

| StallOrder component | Beauty component | Shared invariant | Beauty-specific difference | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| Organization | Organization | Tenant、billing、entitlement、isolation boundary | 擁有 Location 與 Customer CRM | Complete | `prisma/schema.prisma`, foundation migration |
| Stall | Location | Parent-child scope consistency | Salon、studio、branch 與 timezone | Complete | foundation migration, RLS pgTAP |
| Product | Service / Variant / LocationService | Server-owned catalog、交易快照 | Duration、buffer、skills、resources、deposit | Complete | catalog migration, merchant APIs |
| Order | Booking / Segment | State machine、snapshot、atomic transition | Time ranges、allocation、cancel、reschedule | Complete | booking migration, unit + pgTAP |
| OrderSession | PublicBookingSession | 高熵 token、hash at rest、短效期限 | Booking policy 與 device scope | Complete | public booking server modules |
| QR ordering | Public booking | Turnstile、Origin、rate limit、idempotency | Catalog、availability、hold、confirm、manage | Complete | `/api/public/*`, public booking UI |
| StallMembership | LocationMembership | Membership 是授權依據，client scope 不可信 | FrontDesk 與 ServiceProvider | Complete | authorization modules + tests |
| AuthSession | AuthSession | 256-bit token、SHA-256 at rest、revoke、expiry | `beauty_session` + session-bound CSRF | Complete | auth modules + role E2E |
| Plan / Subscription | PlanVersion / Subscription | Versioned contract、server entitlement | Beauty staff/service/resource/CRM limits | Complete | plan migrations + resolver tests |
| AdditionalStallApproval | OrganizationFeatureOverride | PlatformAdmin、audit、expiry | ALLOW、DENY、LIMIT by Beauty feature key | Complete | admin feature service/API/UI |
| Payment | BookingPayment / Refund | Minor units、server calculation、audit | Deposit、cancel fee、manual payment | Partial | Payment 可用；Refund UI/provider 尚未完成 |
| Invoice | SaaS Invoice | 與顧客交易分離 | Phase 1 手動帳務 | Complete | admin billing service/API/UI |
| Merchant onboarding | MerchantApplication / Setup | State machine、atomic provisioning、audit | Trial、test booking、Go-Live gate | Complete | onboarding/setup services + tests |
| OperationalEvent | OperationalEvent | Event 只觸發 authoritative refetch | Booking、setup、notification events | Partial | schema/event 可用；Realtime 訂閱待補 |
| DailyStallSummary | DailyLocationSummary | Bounded rebuild、dashboard summary | 利用率、服務組合、no-show、revisit | Partial | schema/function 可用；dashboard 尚未全面切換 |
| Google OAuth | Google OAuth callback | Supabase PKCE + application session | 依申請/商家/顧客角色導向 | Partial | 程式完成；正式 provider 憑證待設定 |
| RLS inventory | Beauty RLS inventory | exposed business tables 強制 RLS | CRM 與 staff/resource overlap | Complete locally | security migration、pgTAP、db lint |

## Source Decisions

1. 附件 master prompt 控制 domain 與完成條件。
2. StallOrder 提供安全、租戶、授權、交易與部署模式，不形成 runtime coupling。
3. `massage-booking-manager` 僅提供產品行為參考，不沿用 Cloudflare D1 / Hono / Drizzle runtime。
4. Root npm / Next.js application 是 Beauty 的正式 runtime。

## Status 定義

- `Complete`：程式、migration 與對應自動測試已存在，且本機 gate 通過。
- `Complete locally`：本機已驗證，正式環境 migration/advisor 尚待本輪部署確認。
- `Partial`：基礎模型或後端已完成，但文件 Evidence 欄所列使用者流程或外部整合仍未完成。

驗證指令與結果記錄於 `docs/TEST_PLAN.md`。
