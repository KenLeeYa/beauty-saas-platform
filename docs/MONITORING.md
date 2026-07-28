# Monitoring

## 健康檢查

`GET /api/health` 用於部署與 uptime probe，應檢查 Web runtime 與必要依賴，不回傳 secrets、connection string 或內部 stack。

## 觀測項目

- HTTP 5xx、p95 latency、rate-limit rejection。
- PostgreSQL connections、slow queries、deadlock、RLS/advisor 異常。
- Booking hold expiry、confirm conflict、idempotency hit。
- Notification queued / retry / failed 與最老待處理工作。
- Merchant application backlog、Trial 即將到期、Invoice 逾期。
- Cron 未執行、Daily summary 未更新。
- Vercel deployment / function error 與 Supabase availability。

## 日誌

每個 request 使用 request ID；重要寫入同時記錄 actor、organization、location、action、resource、結果與時間。禁止記錄密碼、Session token、CSRF token、Turnstile token、完整電話、Email 內容或 provider secret。

## 告警

正式營運前至少建立：

- health 連續失敗。
- 5xx 或資料庫錯誤率超標。
- 通知 queue 停滯超過 15 分鐘。
- Cron 超過兩個週期未執行。
- 異常大量登入、公開 Session 或 booking confirm。
- 備份或 restore drill 失敗。

目前 repository 已有 health、audit、operational event 與 notification 狀態；外部 uptime、log drain 與告警通道需在正式營運平台設定。
