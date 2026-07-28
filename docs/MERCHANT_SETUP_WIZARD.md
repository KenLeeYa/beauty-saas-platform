# Merchant Setup Wizard

核准後 Owner 進入 `/merchant/setup`。新商家預設不可公開預約，完成設定與測試後才可 Go-Live。

## 必要步驟

1. 商家與分店基本資料。
2. 營業時間。
3. 服務與價格。
4. 人員與技能。
5. 場地或設備資源。
6. 訂金與取消政策。
7. 通知通道確認。
8. 一筆完整測試預約。
9. Owner 正式啟用。

服務、人員與資源建立成功時會同步標記對應步驟。測試預約必須使用正式 availability、hold、confirm、allocation、payment 與狀態機流程，並標記 `is_test=true`；不得以布林欄位假裝通過。

## Go-Live Gate

`src/server/setup/service.ts` 在 serializable transaction 重新驗證：

- 目前操作者具備 Owner 權限。
- Organization 與主 Location 可啟用。
- 有有效 current Subscription。
- 九個 setup steps 已完成。
- 資料庫存在一筆已完成的測試預約。

通過後才會開啟 Organization public profile、Location online booking 與 OPEN 狀態，並寫入 operational event 及 audit。

## 外部整合

LINE 與 Email 可先選擇「暫不啟用」完成設定；系統不得在缺少憑證時假裝已成功連線。
