# Booking Engine

## 流程

1. 讀取 Location、Service、Staff、Resource、營業時間及政策。
2. 依分店 timezone 建立候選時段，轉為 UTC 計算。
3. 套用服務時長、前後 buffer、班表、休假、員工技能與資源需求。
4. 排除既有 BookingAllocation 與未逾期 BookingHold。
5. 建立短效 Hold。
6. 以 transaction、冪等鍵與資料庫排他 constraint 確認預約。

核心實作位於 `src/server/public-booking/availability.ts`、`hold.ts`、`booking.ts` 與 `src/server/availability/slots.ts`。

## 狀態機

Booking 狀態由 `src/server/booking/state-machine.ts` 控制。商家操作會保存 `booking_status_events` 與 audit；不允許任意跳轉或由 UI 直接覆寫狀態。

主要營運順序：

`PENDING -> CONFIRMED -> CHECKED_IN -> IN_SERVICE -> COMPLETED`

取消、拒絕與未到依政策及目前狀態進入對應終止狀態。改期不覆蓋歷史事件。

## 價格

- 服務價格、訂金、取消費與 currency 在 server 計算。
- Booking 保存交易當下快照，後續目錄改價不改寫歷史。
- 金額以 minor unit integer 儲存。
- 顧客付款與 SaaS 訂閱帳務分開。

## 競爭條件

應用層先計算可用時段；資料庫 exclusion constraint 是最後防線。兩個請求同時搶同一員工或資源時，只能一筆成功。冪等鍵讓重送確認不會產生第二筆預約。

## 測試

- `src/server/availability/slots.test.ts`
- `src/server/booking/state-machine.test.ts`
- `src/server/booking/pricing.test.ts`
- `supabase/tests/0002_domain_invariants.test.sql`
