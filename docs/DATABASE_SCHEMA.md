# Database Schema

## 邊界

`Organization` 是租戶、帳務與資料隔離邊界；`Location` 是營運分店邊界。所有分店資料必須同時屬於同一個 Organization，不接受客戶端自行宣告租戶。

## 主要資料群組

| 領域 | 主要資料 |
| --- | --- |
| 身份與租戶 | profiles、organizations、locations、organization_memberships、location_memberships、auth_sessions |
| 入駐與設定 | merchant_applications、merchant_application_events、merchant_setup_progress |
| 方案與帳務 | plans、plan_versions、plan_features、subscriptions、organization_feature_overrides、invoices、invoice_lines、billing_notices |
| 服務目錄 | services、service_variants、location_services |
| 人員與資源 | staff_profiles、staff_locations、staff_skills、resources、staff_schedules、time_off |
| 顧客 CRM | customers、customer_consents、customer_notes、customer_tags、customer_media |
| 預約 | bookings、booking_segments、booking_allocations、booking_holds、booking_idempotency_keys、booking_status_events |
| 付款 | booking_payments、booking_refunds |
| 通知與報表 | notification_channels、notification_jobs、operational_events、daily_location_summaries |
| 稽核 | audit_logs |

Prisma model 定義位於 `prisma/schema.prisma`；權威 DDL、constraint、index、function、trigger、grant 與 RLS 位於 `supabase/migrations/`。

## 不變量

- 所有主鍵使用 UUID；商業時間以 `timestamptz` / UTC 儲存。
- 金額使用 integer minor units，並保存 currency。
- Booking 與 BookingSegment 保存服務名稱、價格、時長與政策快照。
- BookingAllocation 的資源或員工時段由 PostgreSQL exclusion constraint 防止重疊。
- Hold、Session、Tracking token 與冪等鍵只保存雜湊或不可逆衍生值。
- Trial 與付費訂閱由不可重疊的有效期間及 current subscription 規則約束。
- Setup 與 Go-Live 不直接覆寫既有正式資料。

## Migration 規則

1. 使用 `npx supabase migration new <name>` 建立 migration。
2. 先在本機執行 `npx supabase migration up --local`。
3. 執行 `npm run db:test` 與 `npm run db:lint -- --level error --fail-on error`。
4. 確認 linked project ref 後，才可推送正式資料庫。
5. migration 必須可增量套用，不得清空或覆蓋正式資料。

## 效能

租戶、分店、狀態、時間區間、外鍵與通知排程欄位均應有對應 index。Dashboard 優先讀取 `daily_location_summaries`；即時事件只作為重新抓取資料的訊號，不作為權威狀態。
