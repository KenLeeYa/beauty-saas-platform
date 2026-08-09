# P0-P2 模組化單體演進

## 決策

現階段維持單一部署、單一 PostgreSQL 與同一個 Next.js 應用，不拆微服務。業務功能依模組擁有資料與規則，HTTP route 只處理 session、CSRF、scope、schema 與 response mapping。

```text
route/UI
  -> command/query schema
  -> module application service
  -> scoped repository or provider interface
  -> PostgreSQL / ObjectStorageProvider / JobQueue
```

`OrganizationContext` 是所有商家 command/query 的必要輸入；分店資料另要求 verified location。Request body 不接受 `organization_id` 或 `location_id` 作為授權依據。

## 模組邊界

| 模組 | 擁有責任 | 不可直接承擔 |
| --- | --- | --- |
| `organizations` | 租戶、分店、會員、角色、entitlement | 預約狀態與付款交易 |
| `catalog` | 服務、規格、人員資格、資源需求、分店覆寫 | 顧客 CRM 與收款 |
| `booking` | availability、hold、booking lifecycle、取消改期 | 同步呼叫通知供應商 |
| `crm` | 顧客主檔、標籤、備註、同意書與敏感權限 | 直接改寫 booking 歷史 |
| `payments` | intent、訂金、退款、對帳與不可變交易紀錄 | 由前端決定應付金額 |
| `notifications` | template、outbox、job、delivery、重試 | 在預約 HTTP transaction 內發送外部訊息 |

允許同一資料庫 transaction 內由 application service 協調模組；跨模組後續工作以 outbox 事件銜接，不先引入網路型服務間通訊。

## P0 狀態

| 項目 | 狀態 | 本機成果 / 下一步 |
| --- | --- | --- |
| CRM 標籤與備註 | 已完成此階段 | 標籤建立/指派/篩選、一般與敏感備註、audit、tenant 測試與手機 UI |
| 通知健康度 | 已完成此階段 | job 狀態彙總、attempt、last error、dead-letter 手動重送與 location scope 測試 |
| 取消政策編輯器 | 部分完成 | 分店自助取消/改期與期限已可設定；服務覆寫層級 UI 尚待補上 |
| 日曆效率 | 部分完成 | 月曆與單日自訂開放區段已有；週/日人員欄、快速新增與拖曳改期尚待補上 |
| 付款閉環 | 尚未完成 | 需 payment intent、webhook idempotency、退款/扣留訂金與對帳狀態 |

P0 下一個開發順序為付款領域契約、服務取消政策覆寫、日/週行事曆。付款 provider 必須透過介面注入，不把 booking domain 綁定單一金流。

## P1 契約

1. 候補名單由 `booking` 擁有，記錄日期範圍、服務、人員偏好與通知期限；釋位只建立 offer，不先鎖住正式時段。
2. 可信顧客分數由 `crm` 產生唯讀決策資料，`payments` 依規則決定訂金豁免；不得由 UI 直接寫入最終風險分數。
3. 表單與同意書由 `crm` 版本化，簽署內容保存版本、時間、actor 與證據摘要，敏感讀取寫 audit。
4. 生日與回訪自動化只建立 outbox/job；行銷同意與交易通知同意分開判斷。
5. 顧客自助中心以公開顧客 session 讀取自己的預約、票券與申請，不共用商家後台 context。

## P2 契約

1. 品牌服務模板屬 organization，分店只存覆寫欄位；解析後的有效價格、時長、訂金、人員與資源規則必須可追溯來源。
2. 會員、套票、儲值與點數採 append-only ledger；餘額是投影，不是唯一真相，沖正以反向交易處理。
3. 跨店顧客主檔屬 organization，服務紀錄與可見性仍受 location role 控制；合併顧客需保留來源與 audit。
4. 多店報表使用固定 KPI 字典，營收、實收、退款、訂金與取消費分欄，時區先轉分店營業日再彙總。

## 前端演進

本階段已將 CRM 與通知健康度從大型商家工作區抽為 feature component，新增角色入口、手機堆疊清單、可收合顧客紀錄、44px 控制與橫向溢位回歸。後續依序拆出 booking calendar、catalog、settings；server data 也要按 view 查詢，避免每個後台頁都載入完整工作區資料。

每一階段的完成條件包含 strict schema、tenant/location isolation test、桌機與 Pixel 7 E2E、無水平捲動、production build，以及本機問題紀錄；未通過前不標示為完成。
