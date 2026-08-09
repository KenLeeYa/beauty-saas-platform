# 美業預約平台改善計畫

## 研究範圍與限制

- 研究來源以官方產品頁與官方技術文件為主，功能比較只描述公開能力，不推測競品內部實作。
- 使用 AnySearch 盤點 Hotcake、Booksy、Fresha、Vagaro、Square Appointments 與 Mindbody 的常見流程。
- 依 `code-engineering` 與 `goal-verification` 的方式，從 Prisma schema、API schema、tenant/location context、商家工作區與公開預約流程交叉檢查。
- 專案已於 2026-08-09 建立 `.codegraph/` 本機索引，並以 `codegraph_explore` 追查 CRM、通知、角色導流與商家資料載入的符號及呼叫路徑。

## 商用平台的共同模式

| 領域 | 市場常見能力 | 對本平台的意義 |
| --- | --- | --- |
| 預約防呆 | 服務前後緩衝、資源占用、訂金、取消費、提醒 | 必須由同一個可用時段引擎計算，不能只在 UI 擋選擇 |
| 降低爽約 | 訂金、card-on-file、可信顧客豁免、黑名單、候補名單 | 現有訂金與黑名單可先用；候補名單需獨立工作流 |
| 顧客 CRM | 標籤、備註、生日、表單、同意書、療程照片 | 現有資料表已具基礎，下一步是店家介面與權限分級 |
| 多分店營運 | 分店日曆、人員/資源排程、跨店報表、品牌共用資料 | 品牌、分店、服務與顧客資料須明確分層，不可用前端參數決定 tenant |
| 顧客體驗 | 服務先選、月曆選日、只顯示有效時段、送出前揭露規則 | 現有流程方向正確，應持續維持漸進揭露與手機優先 |
| 通知 | 預約完成、付款、改期、取消、24/3/1 小時提醒 | 應由 outbox + JobQueue 發送，不應綁在 HTTP request 內同步送出 |

參考來源：

- [Hotcake 預約管理](https://hotcake.app/feature/reservation)
- [Hotcake 會員管理](https://hotcake.app/feature/member)
- [Booksy 候補名單](https://support.booksy.com/hc/en-us/articles/16463469277714-How-does-the-waitlist-work)
- [Fresha for Business](https://www.fresha.com/for-business)
- [Vagaro Forms](https://support.vagaro.com/hc/en-us/articles/360000294894-Create-and-Manage-Forms)

## 現況判讀

### 已具備且應保留

1. `OrganizationContext` 先驗證 organization/location，再把 context 傳入 repository/service。
2. 公開預約使用 session、hold、idempotency key 與交易鎖，價格由 server 重算。
3. availability 已同時考慮服務時長、前後緩衝、人員、資源、營業時間與當日例外。
4. booking state machine、事件紀錄、audit log、notification outbox 與取消政策快照已存在。
5. 顧客生日、訂金例外、黑名單、標籤、備註與媒體資料模型已存在。
6. 品牌與分店資料、圖片、個體戶/企業戶、多分店 scope 已分開。

### 目前主要缺口

1. 服務前後緩衝存在於資料庫與引擎，但商家先前無法設定。
2. 顧客自行取消/改期與免費取消期限存在於資料庫，但設定頁先前無法管理。
3. 公開預約頁先前只顯示訂金，未在送出前揭露取消與改期規則。
4. 顧客標籤與備註尚未形成可操作 CRM 工作區。
5. 尚無候補名單、自動遞補、會員票券/儲值與服務表單工作流。
6. `merchant-workspace.tsx` 承擔太多畫面責任，長期會提高回歸與多人協作成本。

## 本次本機改善

1. 服務新增與既有服務卡可設定前置/後置緩衝，更新時同時驗證 tenant 與 location scope。
2. 設定頁可開關顧客自行取消、自行改期，並設定免費取消期限。
3. 更新免費取消期限時，同步分店 booking policy 與預設 cancellation policy，避免兩套規則漂移。
4. 公開預約摘要顯示有效取消費、自助取消與改期規則。
5. 服務與設定異動後主動失效公開 catalog cache，避免店家更新後仍看到舊資料。
6. CRM 新增顧客搜尋、標籤篩選、標籤指派、標準/敏感備註與 audit；受限角色不回傳顧客手機或敏感備註。
7. 通知設定新增 pending/processing/failed/dead-letter 健康度、重試次數與手動重送。
8. 員工測試帳號導向個人班表，直接進入商家後台時會回到員工工作區。
9. 顧客管理與通知紀錄採手機堆疊版面、44px 操作控制與可收合細節，桌機保留掃描效率。

P0-P2 的完成狀態、模組責任與後續依賴順序見 `docs/architecture/modular-monolith-p0-p2.md`；本機角色測試與問題紀錄見 `docs/operations/local-role-qa-log.md`。

## 建議優先順序

### P0：正式營運前

1. 顧客標籤與備註 UI：支援標籤篩選、標準/敏感備註權限、異動 audit。
2. 取消政策編輯器：支援分店預設與服務覆寫，並在 UI 明確顯示套用層級。
3. 通知健康度：顯示 outbox pending/failed、重試次數、最後錯誤與手動重送。
4. 日曆效率：週/日檢視、人員欄、快速新增預約、拖曳改期前的衝突再驗證。
5. 付款閉環：payment intent、webhook idempotency、退款/扣留訂金與對帳狀態。

### P1：提高轉換與降低爽約

1. 候補名單：顧客選日期或日期範圍；時段釋出後通知，先搶先得，不預先鎖位。
2. 可信顧客規則：依完成率、爽約率與店家指定，決定訂金豁免或優先預約。
3. 服務前表單/同意書：版本化題目、簽署證據、服務關聯與敏感資料存取紀錄。
4. 生日與回訪自動化：透過 JobQueue 排程，模板與行銷同意分開管理。
5. 顧客自助中心：歷史預約、票券、儲值、付款、同意書與個資匯出/刪除申請。

### P2：企業與多分店

1. 品牌服務模板與分店覆寫：價格、時長、人員資格、資源需求、訂金可分層繼承。
2. 會員、套票、儲值與點數 ledger：不可只存餘額，須保留不可變動交易明細。
3. 跨店顧客主檔：organization 層級識別，location 層級保留服務紀錄與權限。
4. 多店報表：統一 KPI 定義，將營收、收款、退款、取消費與訂金分開計算。

## 整體架構建議

### 維持模組化單體

Phase 1 不需要拆微服務。建議把目前 root Next.js app 依業務邊界拆成模組：

```text
src/modules/
  booking/       availability, holds, booking lifecycle
  catalog/       services, variants, staff, resources
  crm/           customers, tags, notes, consents
  payments/      deposits, intents, refunds, reconciliation
  notifications/ templates, outbox, delivery status
  organizations/ tenant, locations, memberships, entitlements
```

每個模組維持 `schema -> application service -> repository/provider -> route/UI`，route 只負責 session、CSRF、輸入驗證與 response mapping。

### 多租戶與資料安全

1. 在 request 入口建立不可變 `OrganizationContext`，永遠不接受 body 內的 `tenant_id`。
2. organization-owned 與 location-owned repository 分開，branch-owned query 必須同時帶 organization/location。
3. PostgreSQL RLS 搭配 `FORCE ROW LEVEL SECURITY`，背景工作也需明確設定 tenant context。
4. Object Storage key 使用 organization/location 前綴，簽名 URL 需重新驗證資源擁有權。

參考：[OWASP Multi-Tenant Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)、[Microsoft 多租戶 SaaS 指引](https://learn.microsoft.com/en-us/azure/architecture/example-scenario/multi-saas/multitenant-saas)。

### 預約一致性

1. availability 是提示，hold/confirm 才是權威；兩者必須共用相同規則函式。
2. 所有產生副作用的 public API 使用 idempotency key，並保留 request/result 對應。
3. 資料庫層以 exclusion constraint 或等價鎖定策略避免人員、房間與設備重疊。
4. 改期建立新預約並標記舊預約，不覆寫歷史；取消費依 booking policy snapshot 計算。

參考：[Stripe Idempotent Requests](https://docs.stripe.com/api/idempotent_requests)、[PostgreSQL Exclusion Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-EXCLUSION)。

### 非同步與整合

1. 預約交易只寫 booking/event/outbox；LINE、Email、SMS 與 webhook 由 JobQueue 消費。
2. outbox 使用唯一 idempotency key、指數退避、dead-letter 狀態與人工重送。
3. vendor adapter 保持在 provider 層，避免業務流程直接依賴 Supabase、Cloudflare 或單一付款商。

### 前端拆分

1. 將 `merchant-workspace.tsx` 按 view 拆成 booking calendar、booking list、CRM、catalog、settings feature components。
2. server data 依 view 載入，避免進任何後台頁都抓完整 bookings/customers/services/report 資料。
3. mutation 採明確 command type，成功後局部更新或失效對應 cache tag。
4. 顧客預約維持漸進揭露：服務 -> 人員 -> 月曆 -> 時段 -> 資料 -> 摘要；手機保留固定操作區但不得遮住內容。

## 驗收指標

| 指標 | 建議目標 |
| --- | --- |
| 公開預約 API p95 | availability < 500 ms，catalog cache hit < 200 ms |
| 預約衝突 | confirm 後人員/資源重疊為 0 |
| 爽約率 | 依分店與服務追蹤，導入訂金/提醒後持續下降 |
| 預約轉換 | 開始選服務到完成預約的完成率與各步驟流失率 |
| 通知品質 | 發送成功率、延遲、重試率、永久失敗率 |
| 多租戶安全 | 每個 data-access 變更都有 tenant/branch isolation 測試 |
