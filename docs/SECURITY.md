# Security

## 驗收基線

本專案以 OWASP Top 10、租戶隔離、最小權限與可稽核營運為驗收基線。

## 控制

- Broken Access Control：server-resolved Membership、capability、RLS、租戶及分店測試。
- Cryptographic Failures：Session、CSRF、abuse、token 使用獨立 32+ 字元 secrets；token at rest 只保存 hash。
- Injection：Prisma parameterization、固定 SQL migrations、Zod strict schemas。
- Insecure Design：Booking / Application 狀態機、transaction、idempotency、DB exclusion constraints。
- Security Misconfiguration：production env schema、local auth stub 禁用、Turnstile 正式 key、CORS allowlist。
- Vulnerable Components：lockfile、CI audit、保守升級，不使用破壞性 forced downgrade。
- Authentication Failures：Supabase Auth、獨立可撤銷 Session、8 小時期限、Google PKCE callback。
- Integrity Failures：server 計價、immutable snapshots、signed webhook、migration review。
- Logging Failures：request ID、AuditLog、OperationalEvent、NotificationJob 狀態，不記錄 secrets。
- SSRF：外部 adapter 使用固定 provider endpoint，不接受任意 callback URL。

## Secret 管理

`.env*` 不提交；service-role key、database URL、Session secret、Turnstile、LINE、Resend、Cron secret 只存部署平台 secret store。正式憑證不得用於 local seed 或測試截圖。

## 回報

發現弱點時先保存最少重現資料、評估租戶外洩範圍並停用受影響功能。事故處理參考 `docs/operations/incident-response.md`。
