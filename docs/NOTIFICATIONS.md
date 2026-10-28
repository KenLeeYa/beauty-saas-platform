# Notifications

## 架構

通知採 Outbox / Job 模式。商業事件建立 `notification_jobs`，排程端點鎖定到期工作，再透過 adapter 發送。核心位於 `src/server/notifications/dispatcher.ts` 與 `adapters.ts`。

## 通道

| 通道 | 現況 |
| --- | --- |
| In-app | 可用，商家可看到預約及系統事件 |
| Email / Resend | Adapter 已完成；無 API key 時 fail closed |
| LINE | Webhook 簽章與 adapter 已完成；無憑證時停用 |

`NOTIFICATION_PROVIDER=disabled` 是安全預設。正式啟用前需設定供應商憑證、寄件者與 webhook。

## 排程

`/api/cron/notifications` 只接受 `Authorization: Bearer <CRON_SECRET>`。正式環境由 Vercel Cron 每五分鐘觸發，包含預約完成通知與預約前一小時提醒。

## 可靠性

- Job 有狀態、attempt count、next attempt 與 provider response。
- Worker 使用 transaction / lock 避免重複搶工作。
- Provider timeout 或失敗不回滾原始 Booking。
- 可重試錯誤使用 bounded backoff；永久錯誤進入失敗狀態。
- 通知 payload 保存最小必要資訊，不保存明文 token 或完整敏感備註。

## 驗證

LINE 驗證與呈現測試位於 `src/server/notifications/*.test.ts`。正式 Email 與 LINE 的端對端發送仍需真實憑證後執行。

## 通知語系

- 12 種事件模板支援繁體中文、英文及越南語，包含主旨、純文字與跳脫後的 HTML。日期仍採分店時區，品牌、服務及顧客名稱保留原文。
- 每次派送及重試都重新讀取收件顧客的 `preferred_language`，不使用操作商家的畫面語系或舊的事件內容語系。不支援的語系回退繁體中文。
- 顧客在已驗證的行動預約頁或持有預約查詢憑證的頁面切換語言時，會先儲存其通知偏好，再更新瀏覽器偏好。更新限定已驗證的組織及有效顧客，不接受客戶端指定任意顧客 ID。
- 新建立的匿名預約顧客採用該次請求語系。僅手機號碼相同不足以覆寫既有顧客偏好；商家代訂或切換商家介面語言也不會覆寫顧客偏好。
- 「依裝置設定」會移除瀏覽器手動覆寫；在具備上述顧客身分的入口，同時將目前解析出的裝置語系儲存為通知偏好。尚未實作全帳號跨裝置偏好同步。
- 本機驗證包含模板、授權邊界、派送重試與顧客偏好資料庫讀回。供應商保持停用，測試不代表正式 Email 或 LINE 已發送。
