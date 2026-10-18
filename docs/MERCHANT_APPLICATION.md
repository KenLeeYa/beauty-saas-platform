# Merchant Application

## 路由

- `/onboarding`：新申請。
- `/onboarding/edit`：補件或修改草稿。
- `/onboarding/status`：查看審核狀態。
- `/admin/merchant-applications`：PlatformAdmin 審核。

## 狀態

`DRAFT -> SUBMITTED -> UNDER_REVIEW -> APPROVED`

審核可改為 `NEEDS_INFO` 或 `REJECTED`。狀態轉換集中於 `src/server/onboarding/state-machine.ts`，不接受前端任意覆寫。

## 申請人權限

- 只能建立及讀取自己的申請。
- 只有 DRAFT / NEEDS_INFO 可修改商家欄位。
- request schema 不包含 status、reviewer、internal note、organizationId 或 trial 欄位。
- 提交後使用 version 防止覆蓋較新的資料。

## 平台審核

PlatformAdmin 可開始審核、要求補件、拒絕或核准。核准在單一 serializable transaction 中建立：

- Trialing Organization。
- 關閉公開預約的第一間 Location。
- Owner Membership。
- 目前 Trial Subscription。
- MerchantSetupProgress。
- BillingNotice、ApplicationEvent 與 AuditLog。

核准只建立一次；重送或競爭審核不得產生第二個 Organization。
