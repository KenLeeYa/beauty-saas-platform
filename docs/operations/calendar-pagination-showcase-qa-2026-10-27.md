# 行事曆、分頁、導覽與中文展示資料驗證

日期：2026-10-27。僅本機；沒有 commit、push、PR 更新、合併、部署、真實付款或通知投遞。

## 環境與範圍

- 工作區：`C:/Users/KY/Documents/Codex projects/beauty-saas-platform`。
- 分支：`codex/beauty-msi-continuation-20261009`；既有大量未提交修改均保留。
- 本輪應用建置：`erj4S9uQL_TmrsA4II0tJ`，Next.js 62 routes，服務 `0.0.0.0:3100`。
- PostgreSQL：既存 MSI synthetic database，僅本機 127.0.0.1:56863，未重建或 reset。
- AOCI 全量輸出遭截斷後，使用者明確核准本次以 CodeGraph、原始碼及回歸測試繼續，不宣稱完整 AOCI 認知。收尾仍執行來源綁定索引維護。
- 軟體手機模式與 viewport／鍵盤縮放模擬，非實體手機或原生注音輸入法驗證。

## 本次修改

1. 商家月曆：正常營業為綠色、自訂時段為黃色、整日關閉為紅色。選取日期不再把燈號變白，補圖例及無障礙狀態名稱。顏色代表已儲存的日設定模式，不是剩餘預約容量。
2. 共用導覽：依組織及分店保存桌面側欄與手機功能目錄的獨立捲動位置。重新開啟目錄時標題取得焦點，避免第一個連結自動聚焦造成回頂。sessionStorage 只存位置，不存表單或認證資料。
3. 共用分頁：每頁 6 筆，涵蓋營運管理出勤、薪資期間、已核准薪資、未來預約選擇、薪資明細、同意歷史、促銷與分潤規則；另補通知結果及儀表板服務營收明細。既有商家名錄分頁保持原樣。
4. 本機展示：光感美學品牌、中文人員／顧客／服務／空間／分店顯示名稱；兩張生成的虛構美容師照片及一張虛構店面照。不是實際店家或真人照片，同一素材會重複用於不同測試資料。

## 自動化證據

| 檢查 | 結果／邊界 |
| --- | --- |
| 完整單元測試 | 203 passed，64 skipped；跳過的是需另啟用的整合／裝置情境，不列為成功 |
| MSI DB 整合測試 | 28 passed，25 test files |
| MSI 瀏覽器回歸 | 37 passed，10 test files；商家、員工、顧客及改派等現有流程 |
| 額外日設定聚焦回歸 | 1 passed，36 filtered skips；三種燈色、失敗不改燈號、儲存後重載、三語表單保留、軟體鍵盤縮放 |
| 新增分頁案例 | 13 筆出勤每頁 6 筆、換頁、三語保留頁碼；9 筆通知 SSR 桌面／手機同頁及重試控制；9 類服務營收只呈現首 6 類 |
| 導覽回歸 | 原始桌面捲動 291 變 0 已重現；第一次修正仍有手機 portal 問題，後以元素掛載後還原修正；完整瀏覽器回歸通過 |
| 本機資料腳本 | 僅允許指定 synthetic DB；5 個錯誤環境／位址／資料庫案例均拒絕；連續執行第二次 updated=0 |
| 媒體映射 | 僅 test + local trial + 固定 demo 租戶／檔名 allowlist；其他租戶及非本機環境不使用展示映射 |
| lint／typecheck／build | 通過；lint 保留既有 login-form.tsx:216 的 1 個警告；未加入依賴 |
| diff whitespace | git diff --check 通過，只有既有 .gitignore 換行提示 |
| LAN 實際瀏覽器 | 390x844 行事曆無橫向溢位；人員首頁 8 張照片載入成功；截圖已實際檢視 |

主要新增／擴充測試：`month-calendar.test.tsx`、`merchant-report-dashboard.test.tsx`、`provider.test.ts`、`notification-health-panel.test.tsx`、`tests/local-showcase.test.ts`、`tests/app-shell-ui.integration.test.ts`、`tests/operations-ui.integration.test.ts`、`tests/merchant-pages-ui.integration.test.ts`。

證據截圖存於忽略的 `.dev-logs/showcase-staff-390.png`、`.dev-logs/calendar-lamps-390.png` 及各瀏覽器測試截圖。fixture 變更前後值保留於 `.dev-logs/showcase-*.json`，不包含連線密碼；腳本執行前後驗證 demo bookings 全列摘要及其他租戶 staff 摘要相同。

## 測試入口

1. 同網段手機先開啟 [商家示範登入](http://192.168.1.104:3100/api/line-booking/integrated-demo?role=owner)。此為本機受限示範入口，不是正式驗證方式。
2. [行事曆](http://192.168.1.104:3100/merchant/calendar?organization=demo&location=taipei)：點日期，進「開放時段」，切換三種模式並儲存；關閉視窗及重新載入後確認顏色。
3. [營運管理](http://192.168.1.104:3100/merchant/operations?organization=demo&location=taipei)：出勤／薪資／政策清單檢查換頁，再切換繁體中文、英文及越南語。
4. [服務人員](http://192.168.1.104:3100/merchant/staff?organization=demo&location=taipei)：查看照片、技能與分頁；手機「更多」捲至下方功能後進入，再開「更多」確認位置保留。
5. [顧客預約](http://192.168.1.104:3100/book/demo/taipei)：服務與人員選擇維持既有流程。舊頁快取可重新整理取得這次建置。

## 擬真資料的安全界線與未完成項

本機展示腳本 `scripts/local-showcase.mjs` 只能經受限 harness 對指定 demo 執行；沒有重設資料庫或改動預約、款項及歷史快照。最新展示盤點為 50 分店、433 人員、1,032 顧客、70 服務、107 空間／設備，多數是歷次回歸保留的合成資料，不是新建立的真實營運店家。

圖片是本輪 image generation 產生的虛構素材，位於 `public/images/demo-beautician.png`、`demo-beautician-senior.png`、`demo-salon.png`。本次驗證靜態展示映射，不代表物件儲存上傳或正式 CDN 驗收。

尚未完成：獨立、少量且完整涵蓋所有功能的展示租戶；歷史快照內仍可能有英文測試名稱；技能目錄、部分舊版／平台頁及待處理每批 50 筆仍需改善；大型資料的伺服器端分頁與全量搜尋；競品功能全數整合。現有工作區查詢上限不可被解讀為全資料庫總筆數。未執行會重設 seed 的 `test:e2e:local`，也未啟用真實 LINE、簡訊、金流、正式會員發行或部署。
