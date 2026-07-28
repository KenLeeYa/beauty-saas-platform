# Commercial Billing

此文件描述平台向商家收取的 SaaS 訂閱費，與顧客 Booking Payment 完全分離。

## 方案與權益

- PlanVersion 保存不可變的價格與條款版本。
- PlanFeature 定義 feature key、allow/deny 或 limit。
- Subscription 綁定 Organization、PlanVersion、有效期間與狀態。
- OrganizationFeatureOverride 由 PlatformAdmin 設定，可 ALLOW、DENY 或 LIMIT，並可設定到期日。
- server 以 Plan、Subscription、Override 解析最終 entitlement；前端隱藏按鈕不是授權。

## Phase 1 手動帳務

平台後台 `/admin/billing` 支援：

1. 對 Organization 開立手動 Invoice。
2. 記錄帳期、到期日、金額、currency 與說明。
3. 確認手動收款。
4. 全額付款後啟用 Subscription / Organization。
5. 逾期或營運事件可停權；補款後可復權。

上述操作在 transaction 內寫入 Invoice、Subscription、Organization、BillingNotice 與 AuditLog。

## 停權

停權後停止公開預約並保留資料，不刪除商家交易紀錄。復權必須由 PlatformAdmin 明確操作。自動扣款、稅務發票與 payment gateway webhook 不在 Phase 1 範圍。
