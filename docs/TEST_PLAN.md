# Test Plan

## 必跑 Gate

```bash
npm run lint
npm run typecheck
npm test
npm run db:test
npm run db:lint -- --level error --fail-on error
npm run build
npm run test:e2e
```

## 測試層

| 層級 | 必測內容 |
| --- | --- |
| Unit | capability、狀態機、時段、價格、timezone、strict schema、通知呈現 |
| pgTAP | RLS、租戶/分店一致性、重疊防護、current subscription、domain constraints |
| Integration | 申請核准原子性、Setup gate、booking idempotency、付款與功能覆寫 |
| Playwright | 各角色登入導向、公開預約、店家後台、平台審核與商家開通 |
| Production smoke | health、登入頁、公開預約、角色路由、Cron auth、停權商家 |

## 2026-07-28 本機紀錄

| 指令 | 結果 |
| --- | --- |
| `npm run typecheck` | 通過 |
| `npm run lint` | 通過 |
| `npm test -- --reporter=dot` | 11 files / 37 tests 通過 |
| `npm run db:test` | 2 files / 16 pgTAP tests 通過 |
| `npm run db:lint -- --level error --fail-on error` | 無 error |
| `npm run build` | Next.js production build 通過 |
| `npm run test:e2e` | 8 passed / 8 production-only tests skipped |

完整商家流程在 Desktop Chrome 與 Pixel 7 尺寸均通過：申請、平台審核、Trial provisioning、Setup、服務、人員、資源、測試預約、Go-Live、公開預約、多商家選擇及多分店選擇。

## 必要負面測試

- 跨 Organization / Location 存取。
- request 注入 organizationId、locationId、status、price 或 reviewer 欄位。
- 過期 Session、CSRF 錯誤、Turnstile 失敗、超量請求。
- 兩個請求競搶相同 Staff / Resource 時段。
- 重送 hold confirm、merchant approval、付款確認。
- Trial entitlement 不足、Setup 未完成、測試預約不存在時 Go-Live。
- 停權 Organization 仍嘗試公開預約。
