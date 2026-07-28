# Beauty SaaS Platform

多租戶美業預約 SaaS，服務美容、美體、美睫、美甲、按摩、SPA 與其他預約型店家。系統採用與 StallOrder 一致的安全與營運原則，但使用獨立的程式庫、Supabase 專案、資料庫、Auth、Secrets 與部署。

## 目前功能

- 顧客：月曆式空檔查詢、時段保留、預約確認、查詢、改期與取消。
- 店家：預約行事曆、服務、員工、資源、顧客、營業設定、付款與帳務。
- 入駐：商家申請、平台審核、Trial 開通、設定精靈、測試預約與正式營業。
- 平台：商家管理、方案檢視、功能權益覆寫、手動 SaaS 發票與停復權。
- 通知：站內通知，並保留 LINE、Resend Email 的可替換 adapter。
- 安全：Supabase Auth、獨立應用 Session、CSRF、Turnstile、Rate Limit、RLS 與 Audit Log。

## 技術架構

- Next.js 16 App Router、React 19、TypeScript strict mode。
- PostgreSQL / Supabase、Prisma Client 與 SQL migrations。
- Zod strict schemas、Vitest、pgTAP、Playwright。
- 單一部署、模組化單體；資料存取一律由伺服器驗證組織與分店範圍。

## 本機啟動

需求：Node.js 24、Docker Desktop、Supabase CLI。

```bash
npm install
npm run local:setup
npm run local:start
```

開啟：

- 電腦：`http://127.0.0.1:3100`
- 同網路手機：執行 `npm run local:status` 取得 LAN URL

本機測試密碼皆為 `Beauty123!`：

| 身分 | 帳號 |
| --- | --- |
| 店家 Owner | `merchant@lumi.test` |
| 服務人員 | `provider@lumi.test` |
| 平台管理員 | `platform@beauty.test` |
| 顧客 | `customer@beauty.test` |
| 商家申請人 | `applicant@beauty.test` |

## 驗證

```bash
npm run lint
npm run typecheck
npm test
npm run db:test
npm run db:lint -- --level error --fail-on error
npm run build
npm run test:e2e
```

## 多租戶規則

- 不信任 request body、query 或 hidden input 內的 `organization_id` / `location_id`。
- 組織、分店與角色由已驗證 Session 及 Membership 在伺服器端解析。
- 組織資料必須有 RLS；分店資料同時驗證組織與分店關聯。
- 商業時間以 UTC 儲存，介面依分店 timezone 顯示。
- 金額使用整數最小貨幣單位，預約保留不可繞過資料庫排他限制。

## 文件

從 [架構](docs/ARCHITECTURE.md)、[資料庫](docs/DATABASE_SCHEMA.md)、[安全](docs/SECURITY.md)、[測試計畫](docs/TEST_PLAN.md) 與 [正式上線檢查表](docs/GO_LIVE_CHECKLIST.md) 開始。
