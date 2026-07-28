# Reporting and Realtime

## 資料來源

- `operational_events`：預約、設定、通知與營運變更事件。
- `daily_location_summaries`：依 Location 與當地日期彙總的營收、預約、完成、取消、未到與利用率指標。
- Booking / Payment：明細查詢及調查用途，不應成為長區間 dashboard 的永久掃描來源。

資料庫 function 可重建指定日期範圍的 daily summary，避免每次開啟報表都掃描完整交易表。

## Realtime 原則

Realtime event 只通知前端「資料可能已改變」，前端收到後重新呼叫受授權的 server query。event payload 不作為權威資料，也不應包含顧客敏感內容。

## 現況

- 店家 dashboard 已有預約、金額及基礎統計。
- Daily summary schema、更新 function 與 operational event 已建立。
- Supabase Realtime 訂閱、斷線 polling fallback、CSV 匯出及正式 dashboard 全面改讀 summary 尚未完成。

完成前應維持 bounded date range，避免無界查詢；不可將「資料表已存在」宣稱為完整即時報表功能。
