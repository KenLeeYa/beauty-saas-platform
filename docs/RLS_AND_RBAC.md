# RLS and RBAC

## 授權來源

應用先驗證 Supabase 身份，再建立獨立的 `beauty_session`。伺服器由 Session、Profile、OrganizationMembership 與 LocationMembership 解析作用範圍，永遠不信任 request 內的租戶或分店 ID。

## 角色

| 角色 | 範圍 |
| --- | --- |
| PlatformAdmin | 平台營運、商家審核、方案、權益與 SaaS 帳務 |
| Owner | 組織及所屬分店完整管理 |
| Manager | 經授權分店的營運管理 |
| FrontDesk | 預約、顧客、付款與現場操作 |
| ServiceProvider | 本人班表與所屬預約 |
| Customer | 自己的公開預約與個人資料 |

Capability mapping 位於 `src/server/authorization/capabilities.ts`；受保護的 server context 位於 `src/server/authorization/context.ts` 與 `src/server/merchant/context.ts`。

## RLS

- exposed schema 的 business tables 啟用並強制 RLS。
- policies 以目前登入者 membership 與 organization/location 關聯判斷。
- service role 僅在可信 server runtime 使用，不傳到瀏覽器。
- database grants 與 RLS 同時存在；不能以「API 已驗證」取代資料庫隔離。
- PlatformAdmin 的跨租戶操作必須有明確 capability 與 audit log。

## 防止越權

- Zod schemas 使用 strict object，未知欄位直接拒絕。
- API 不接受可改變租戶範圍的 `organizationId` 或 `locationId` body 欄位。
- 路由參數只用來定位候選資源，最終仍須與 server-resolved context 比對。
- 更新使用 version / transaction 防止遺失更新。
- Feature override、商家審核、停權與付款確認只允許 PlatformAdmin。

## 驗證

`src/server/authorization/capabilities.test.ts` 驗證 capability；`supabase/tests/` 驗證 RLS 與關鍵 domain invariant。資料存取變更必須新增租戶及分店隔離測試。
