# Public Booking Security

## 公開 API

公開流程包含 catalog、availability、session、hold、confirm、lookup、reschedule 與 cancel。公開路由只接受 strict schema 允許的欄位，價格、租戶、分店、權益與政策由 server 重新解析。

## 防護層

- Cloudflare Turnstile 驗證公開 Session。
- `PUBLIC_APP_ORIGINS` 執行 allowlist CORS / Origin 檢查。
- IP 與裝置識別只保存 keyed hash；可信 proxy header 必須明確設定。
- Rate limit 依 endpoint、來源與 Session 分桶。
- PublicBookingSession 使用高熵 token，資料庫只保存 hash 且有短效期限。
- Hold 有 expires-at；confirm 使用冪等鍵。
- Tracking token 不放置可猜測的流水號或顧客個資。
- Error response 不洩漏內部 ID、SQL、stack trace 或是否存在其他租戶資料。

## Turnstile

正式環境必須設定 site key、secret 與預期 hostname，且 `TURNSTILE_ALLOW_TEST_KEYS=false`。測試 key 僅允許 local/test。

## 資料最小化

公開行事曆只回傳可預約狀態，不顯示已預約顧客姓名、電話、服務內容或備註。查詢及管理預約需要 tracking token 與對應 Session，不可只靠 Booking ID。

## 上線驗證

正式上線前需測試跨 Origin、Turnstile 失敗、過期 Session、過期 Hold、重複 confirm、猜測 tracking token、超量請求與已停權商家不可公開預約。
