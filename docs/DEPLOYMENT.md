# Deployment

## 環境

Beauty 正式環境獨立部署於 KuanGuard 的 Supabase 與 Vercel；不與 StallOrder 共用 production database、Auth、Storage、Secrets 或 migration history。本專案目前只建立正式環境，尚未建立獨立 staging。

## 正式部署順序

1. 確認 Git worktree 與目標 commit。
2. 執行 `npm run lint`、`npm run typecheck`、`npm test`、`npm run build`。
3. 本機執行 pgTAP 與 database lint。
4. 檢查 `supabase migration list --linked` 的 project ref。
5. 將 migration 推送到 Beauty 專案，重新執行 Supabase advisors。
6. 將相同 commit 部署到 Vercel Production。
7. 執行 `npm run production:check` 與 `npm run production:smoke`。
8. 驗證角色路由、公開預約、Cron auth 與資料庫連線。

## 必要環境變數

完整範本見 `.env.example`。正式環境至少需要：

- App URL / allowed origins。
- pooled `DATABASE_URL` 與 direct `DIRECT_URL`。
- Supabase URL、publishable key、service role key。
- Session、CSRF、abuse、token derivation、Cron secrets。
- Turnstile site key、secret、hostname。
- Google OAuth、LINE、Resend 依啟用功能設定。

`ENABLE_LOCAL_AUTH_STUB=false`、`TURNSTILE_ALLOW_TEST_KEYS=false`。未提供外部 provider 憑證時保持 `disabled`，不可降級為假成功。

## 回滾

應用回滾到前一個已驗證 Vercel deployment。資料庫 migration 採 forward fix，不以破壞性 rollback 清除正式資料。部署與復原細節另見 `docs/deployment/production.md` 與 `docs/operations/restore.md`。
