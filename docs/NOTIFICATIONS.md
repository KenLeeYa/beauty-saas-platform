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
