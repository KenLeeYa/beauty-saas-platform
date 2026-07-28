# Booking Payments

Booking Payment 是顧客對店家的交易；不得與平台向店家收取的 SaaS Invoice 混用。

## 支援範圍

- 服務全額、訂金與取消費由 server 依 Booking 快照及 Location policy 計算。
- 店家可登錄手動付款，並保存 method、amount、currency、reference 與 actor。
- Payment 與 Refund 使用不同資料表及狀態。
- 金額使用 integer minor units，禁止由顧客端提交最終應付金額。
- 每次操作寫入 audit 及 Booking payment 狀態。

## 訂金

Location policy 可設定固定額或比例。確認預約時建立應付快照；後續服務改價不影響既有 Booking。正式金流 provider 尚未接入時，`PAYMENT_PROVIDER=disabled`，介面明確顯示手動流程。

## 取消費

是否收費及金額依預約時保存的 cancellation policy snapshot 計算。取消原因、actor 與狀態事件必須保存。

## 退款

資料模型已支援部分或全額 refund；正式 UI 與 provider webhook 尚未交付。啟用線上付款前必須補齊 provider idempotency、webhook signature、金額比對與 refund E2E。
