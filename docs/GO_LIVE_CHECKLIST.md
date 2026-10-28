# Go-Live Checklist

## 程式與資料庫

- [ ] GitHub commit、branch、PR 與 production deployment 指向相同 tree。
- [ ] lint、typecheck、unit、pgTAP、database lint、build、E2E 全部通過。
- [ ] linked Supabase project ref 已人工確認。
- [ ] 所有 migration 已套用，RLS / advisor 無 blocking finding。
- [ ] 備份、restore procedure 與 rollback owner 已確認。

## 安全

- [ ] local auth stub 與 Turnstile test key 已停用。
- [ ] secrets 皆為正式獨立值，未出現在 Git、log 或瀏覽器 bundle。
- [ ] CORS origins、Turnstile hostname、OAuth redirect URL 精確。
- [ ] PlatformAdmin、Owner、Manager、FrontDesk、Provider、Customer 越權測試通過。
- [ ] rate limit、CSRF、Session expiry、webhook signature 與 Cron auth 通過。

## 商業流程

- [ ] 商家申請、補件、拒絕、核准各一輪。
- [ ] Trial entitlement 與到期行為正確。
- [ ] 新商家在完成 Setup 前不可公開預約。
- [ ] 測試預約完整走過 hold、confirm、payment、status 與 notification。
- [ ] Go-Live 後公開預約可用；停權後立即不可用。
- [ ] SaaS Invoice 開立、收款、停權、復權有 audit。

## 營運

- [ ] health、uptime、5xx、database、Cron、notification queue 告警已建立。
- [ ] LINE / Email 未配置時顯示停用，不假成功。
- [ ] 隱私政策、商家條款、取消與退款政策已確認。
- [ ] 正式測試資料有 `is_test` 或 QA 標記，且不包含真實顧客個資。
- [ ] 客服、事故處理、資料匯出與刪除請求負責人已指定。

未完成的 checkbox 必須有 owner、風險、替代措施與期限；不得僅以「稍後補」放行。
