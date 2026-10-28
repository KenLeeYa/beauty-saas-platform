# 本機角色與行動裝置 QA 紀錄

日期：2026-08-09
範圍：本機正式架構的開發資料；未上傳 GitHub、未觸發 GitHub Actions、未操作 Production。

## 環境

- Web：`http://127.0.0.1:3100/`，監聽 `0.0.0.0:3100`
- 同網段：`http://192.168.1.102:3100/`
- Supabase：本機容器與 pgTAP 測試資料
- 響應式專案：Desktop Chrome、Pixel 7
- CodeGraph：237 files、2,600 nodes、5,543 edges，狀態 up to date

## 固定測試資料

`npm run db:seed` 只允許在 localhost 資料庫且 `ALLOW_DEMO_SEED=true` 時執行，已連續重跑驗證可重現。`npm run test:e2e:local` 完成後會再次 seed 並清除登入限流，保留可立即人工操作的基準狀態：

| 類型 | 本機資料 |
| --- | --- |
| 顧客 | QA 王小美（VIP 常客、免訂金）、QA 陳怡君（指定訂金）、QA 林雅婷（黑名單） |
| 預約 | `PENDING_PAYMENT` 2 筆、`CONFIRMED` 2 筆，以及 `CHECKED_IN`、`IN_SERVICE`、`COMPLETED`、`CANCELLED`、`NO_SHOW`、`EXPIRED` 各 1 筆 |
| 營運資料 | 服務分類與 3 項服務、Yuki/Mina、2 間療程室、分店與品牌、`LOCAL-QA-0001` 發票 |
| 通知 | LINE/Email 整合狀態，以及成功、失敗、dead-letter job/delivery，可實際測試手動重送 |

## 角色流程

| 角色 | 自動化內容 | 結果 |
| --- | --- | --- |
| 商家 | 逐頁巡覽總覽、行事曆、預約、CRM、服務、人員、資源、分店、團隊、報表、方案、帳務、Setup、設定；實際操作自訂時段、訂金確認、取消/失效、服務緩衝與上下架、分店暫停/恢復、通知重送、預約規則 | Desktop 寫入流程 / Pixel 7 全頁巡覽通過 |
| 員工 | 登入、分店與指派 scope、確認到報到/服務中/完成、未到店、阻擋商家後台；手機先顯示今日工作再顯示月曆 | Desktop 寫入流程 / Pixel 7 首屏通過 |
| 顧客 | 登入、服務/人員/月曆/時段、重新選取 held 時段、送出預約、安全連結改期與取消、登出與 session/CSRF cookie 清除 | Desktop 完整流程 / Pixel 7 首屏與重新選時段通過 |
| 商家申請 | 申請、審核、試用開通、Setup、公開預約 Go-Live | Desktop / Pixel 7 通過 |

以上角色頁均檢查 `scrollWidth <= clientWidth`，本輪沒有水平溢位。Pixel 7 另驗證商家月曆、美容師第一筆今日預約、顧客日期選擇均在首個 viewport 開始呈現。

## 驗證結果

| Gate | 結果 |
| --- | --- |
| `codegraph status . --json` | complete、pending changes 0 |
| `npm run typecheck` | 通過 |
| `npm test` | 17 files / 58 tests 通過 |
| 本輪 first-party ESLint | 通過 |
| `npm run lint` | 第一方無錯；因掃入 `vendor/awesome-llm-apps` 而有 38 errors / 9 warnings |
| `npm run db:test` | 3 files / 24 pgTAP tests 通過 |
| `npm run db:lint` | 無 schema error |
| `npm run build` | Next.js 16 production build 通過，35 個 app routes/pages 完成 |
| `npm run test:e2e:local` | Desktop 10 passed / 5 skipped；Pixel 7 8 passed / 7 skipped；合計 18 passed / 12 skipped |
| 本機/LAN smoke | `127.0.0.1:3100` 與 `192.168.1.102:3100` 的 health、登入頁、顧客預約頁皆為 200；未登入角色頁正確 307 |

## 發現與處理

| ID | 等級 | 問題 | 處理 |
| --- | --- | --- | --- |
| QA-001 | P1 | 3100 開發服務鎖住 Prisma Windows DLL，直接 build 會 `EPERM` | build 前停止本機服務，完成後再啟動；資料庫 volume 保留 |
| QA-002 | P1 | Next 16 同一目錄無法同時啟動 3100/3101 兩個 dev server | `test:e2e:local` 重用 3100，Desktop/Pixel 7 分段 seed 與清除本機限流；CI 仍使用隔離 webServer |
| QA-003 | P0 | 建立顧客後的背景 refresh 可能覆蓋緊接著建立的標籤與提示 | 改為使用 API ID 局部更新 CRM state，加入實際 CRUD E2E |
| QA-004 | P1 | 標籤 form 在 await 後直接讀取 event currentTarget，存在失效風險 | await 前保存 form element，桌機與手機 E2E 驗證 |
| QA-005 | P0 | 非敏感角色曾可能從完整商家資料取得顧客手機 | server data 依 `customer.sensitive.read` 遮蔽，敏感備註同樣分級 |
| QA-006 | P1 | root ESLint 將外部 `vendor/awesome-llm-apps` 納入第一方 gate | 本輪不修改 vendor；後續將 first-party 與 vendor lint ownership 分開 |
| QA-007 | P1 | LAN 服務正確忽略自報 IP，擴充到 30 項 E2E 後累積 22 次登入並正確觸發限流 | 每個裝置專案分段重置 localhost bucket 與固定資料；正式限流與 LAN trust 不變 |
| QA-008 | P1 | 一般狀態機禁止 seed 將 `CANCELLED/NO_SHOW/EXPIRED` 還原，導致第二輪測試無法重現 | 僅在 localhost guard 的 transaction 暫停 transition trigger，finally/rollback 一律恢復；產品 API 狀態機不變 |
| QA-009 | P1 | 重跑 terminal transition 會碰到通知 outbox idempotency key | seed 先清除固定 QA booking 的 outbox 關聯資料，再建立同一組可預期狀態 |
| QA-010 | P1 | 新的預約狀態更新失敗時，畫面仍保留前一次綠色成功訊息 | 每次狀態 mutation 開始先清除 feedback，避免成功與錯誤同時呈現 |
| QA-011 | P2 | 初版登入 helper 可能在登入 request 完成前被導頁中斷 | 先監聽 `/api/auth/login` response、驗證 200，再等待角色導流 |
| QA-012 | P1 | 商家手機首屏四張統計卡直向堆疊，月曆幾乎不可見 | 統計改為 2x2、縮短間距與卡片高度，加入月曆首屏斷言 |
| QA-013 | P1 | 美容師手機先顯示整月行事曆，當日工作需向下捲動 | 手機改為今日預約優先、桌機維持月曆在左，操作按鈕至少 44px |
| QA-014 | P1 | 顧客服務卡直向堆疊，服務人員與日期被推到首屏外 | 手機服務卡改為 snap 橫向滑動、摘要去除重複分鐘文字，日期入口納入首屏斷言 |
| QA-015 | P2 | 響應式通知元件同時保留桌機表格與手機卡片 DOM，測試曾選到隱藏元素 | 斷言限制在最近通知區塊並只匹配可見的 `p/td` |
| QA-016 | P1 | 既有 CRM E2E 每輪留下隨機 `QA 顧客` 與 `QA-*` 標籤，重跑後資料逐步累積 | localhost-only seed 精準刪除這些測試 marker 及 notes/assignments，再重建固定角色資料 |
| QA-017 | P1 | 通知與 CRM 等 client-rendered 時間直接使用 locale formatter，Node SSR 與 Chrome 產生不同空白字元並觸發 hydration mismatch | 日期、日期時間與時段統一改用 `formatToParts` 組合固定 ASCII 格式；加入 3 個 unit tests，並對商家、員工、顧客及 Pixel 7 流程攔截 hydration error |
| QA-018 | P1 | 重選時段 E2E 固定抓今天第 6 個時段，傍晚執行時會因最低提前時間正確過濾而產生假失敗 | 改選未來完整營業日，保留最早時段切換至第 6 個時段、跨日期與返回原日期的回歸強度 |

## 尚未覆蓋

- Production OAuth、正式 LINE/Email/SMS 發送與真實金流不在本機測試範圍。
- 圖片上傳控制、權限與呈現入口已巡覽，但本輪未對真實 Object Storage 執行二進位檔案上傳。
- 12 個 skipped 包含 8 個需要正式 QA 密碼的 Production 路由案例，以及刻意只在 Desktop 執行的 3 個寫入案例與只在 Pixel 7 執行的 1 個視覺案例。
- P0 的付款閉環、服務層取消政策覆寫與週/日拖曳行事曆仍待開發。
- P1 候補名單、表單同意書、自助中心及 P2 ledger、跨店主檔、多店報表目前只有架構契約，尚未宣稱完成。
- 同網段 URL 已由本機走 LAN IP 驗證；實體手機的作業系統/瀏覽器手勢仍保留給人工驗收。
- Stateful onboarding E2E 目前會保留 `qa-beauty-*` 組織與 append-only 稽核資料；後續需設計具稽核保證的專用清理程序，不應用一般 seed 強制刪除。

每次後續修改應更新本檔的 Gate、發現項目與未覆蓋範圍；正式環境案例只在有對應憑證與明確發布批准時執行。
