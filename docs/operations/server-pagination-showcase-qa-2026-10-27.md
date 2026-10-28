# 伺服器分頁與獨立展示店家本機驗證

日期：2026-10-27，Asia/Taipei。
工作區：`C:/Users/KY/Documents/Codex projects/beauty-saas-platform`。
分支：`codex/beauty-msi-continuation-20261009`；基準 HEAD：`e207febf4b9e3b9483761354b863ef45ee7a91a6`，加上保留的未提交變更。
本機版本：`PTzHRcL2wMRTps3EjjiQu`；PID 27048；監聽 `0.0.0.0:3100`。
未提交、上傳、更新 PR、合併或部署；未觸發 GitHub Actions。沒有安裝依賴或修改資料庫 schema。

## 本次範圍

- 顧客清單改用 `GET /api/merchant/customers`：資料庫搜尋姓名、手機及標籤，支援標籤篩選、總筆數與每頁 8 筆。不再受初始投影前 100 筆限制。無敏感資料權限者不能以電話搜尋，也不取得電話或敏感備註。
- 預約管理改用 `GET /api/merchant/bookings`：依顧客、電話、服務、人員及狀態查詢所有符合條件的歷史資料，每頁 8 筆。不再只搜尋行事曆視窗的前 500 筆。
- API 使用已驗證的組織／分店 context、能力檢查與 Zod 範圍驗證。顧客為組織層資料，預約為分店層資料。總數與頁面查詢使用 RepeatableRead；同時間建立的紀錄以 ID 作穩定次排序。
- 搜尋將 `%`、`_`、反斜線視為文字；不是讓使用者輸入 SQL 搜尋運算子。API 每批上限 50、搜尋上限 100 字元、offset 上限 1,000,000。
- 資格異動待處理清單每頁 6 筆，支援服務或人員搜尋。保留多項目／多人預約的未受影響安排；語言切換不清除改派原因。搜尋與重新整理共用取消機制，舊請求不得覆蓋新結果。
- 技能目錄與選取器每頁最多 8 筆，可搜尋、顯示已選數量。跨頁或搜尋後仍保留未顯示的選項；選取不重新排序清單。技能目錄仍從既有授權工作區載入，不宣稱此部分已改成資料庫分頁。
- 查詢錯誤可重試；繁體中文、英文、越南語切換只改介面文字，不改搜尋值、表單草稿、技能或改派內容。
- 預約收款／狀態操作成功後立即套用 API 回傳的最新版本，再背景更新清單；取消舊請求，避免慢速清單讓下一個操作使用舊版本。

## 獨立展示店家

品牌「沐光美學」，分店「大安沐光館」，組織 slug `showcase`、分店 slug `daan`。

| 資料 | 初始數量 |
| --- | ---: |
| 中文虛構顧客／備註 | 24 |
| 人員 | 4 |
| 技能目錄 | 16 |
| 服務／分類 | 6 / 3 |
| 療程室 | 3 |
| 預約 | 20 |
| 多項目、多人預約 | 2 |
| 初始資格異動待處理安排 | 14 |

人員與店面使用既有 3 張虛構圖片；四位人員共用兩張肖像，不宣稱每人皆有獨立照片。圖片由明確本機試用條件及固定租戶路徑映射，未開放任意租戶路徑。
展示資料包含歷史完成／取消／未到店紀錄、未來預約、生日、顧客標籤、黑名單與訂金個別設定。所有聯絡資料及交易均為虛構，沒有啟用外部訊息或支付服務。

建立命令：

```powershell
node scripts/msi-local.mjs isolated-showcase "<既有本機 PostgreSQL 憑證檔路徑>" --apply
```

`isolated-showcase.mjs` 僅允許 `APP_ENV=test`、明確 local trial、loopback 56863 與 `beauty_msi_20261009`。整批採交易建立；身分衝突即停止。已存在時不重設預約、表單設定或使用者後續修改。
初次建立及重跑皆比對其他租戶的 bookings、booking_segments、booking_staff_allocations、customers、customer_notes、staff_profiles、locations、services 筆數與內容摘要。兩次均一致；重跑 `created=false`。
證據：`.dev-logs/isolated-showcase-1793081090328.json`、`.dev-logs/isolated-showcase-1793081350479.json`。回歸測試仍依原有規則保留各自的測試紀錄，不將其搬入展示店家。

## 手機測試路徑

1. 商家登入：`http://192.168.1.104:3100/api/line-booking/integrated-demo?store=showcase&role=owner`。
2. 預約改派：登入後「營運管理」→「預約改派」。搜尋「舒敏」可看到兩筆多項目／多人範例；改派給「許婉晴」可保留「陳雅婷」與其餘安排。仍由後端檢查實際時段及資格，若已操作過請以目前資料為準。
3. 顧客管理：`/merchant/customers?organization=showcase&location=daan`；搜尋「沈若晴」可確認不只搜尋第一頁。
4. 技能：`/merchant/staff?organization=showcase&location=daan` → 新增服務人員，搜尋「頭皮」選取，再搜尋「保濕」選取，切換三語後回查兩者皆保留。
5. 顧客預約：`http://192.168.1.104:3100/book/showcase/daan`。
6. 既有測試環境仍使用 `organization=demo&location=taipei`，沒有搬移或清除。

本機快速登入僅限私人網路白名單與測試模式，不是正式環境登入方案。

## 驗證結果

| 檢查 | 結果 |
| --- | --- |
| `npm run lint` | 0 errors；保留既有 login-form.tsx:216 導覽警告 1 項 |
| `npm run typecheck` | 通過 |
| `msi-local.mjs unit` | 204 passed、68 gated/skipped；跳過項目不算通過 |
| `msi-local.mjs test` | 30 passed，26 files；含跨組織／分店／角色、搜尋特殊字元、歷史資料、分頁無重複、空頁總數與參數驗證 |
| 本機 production build | 通過，63 個建置頁面；不是正式部署 |
| 瀏覽器完整回歸 | 最終版本 39 passed，11 files；14:34:34 開始，287.51 秒。含延遲清單回應後連續收款／取消、失敗重試與三語資料保留 |
| 實際 LAN Chrome DevTools | 展示店家 → 服務 → 合資格人員 → 月曆 → 19 個可預約時段；390px 直向及 844×390 橫向，無水平溢出，關閉 44px、確認 48px，按鈕在可視範圍 |
| Graphify | 本機 code-only 更新：3,677 nodes / 9,405 edges；未呼叫付費或雲端語意服務 |

回歸先觀察失敗，再實作修正：原資格清單回傳 50 而非 6 筆、原技能選取器一次顯示 25 項、新目錄 API 尚不存在、展示圖片路徑尚不支援，以及舊重新整理回應將新搜尋的 6 筆覆蓋回 2 筆。測試保留於 repository。
中間完整回歸曾有 37 passed／2 failed。預約操作以延遲清單重現舊版本衝突，已修正並通過；技能視窗個別重跑正常，測試補上切回商家分頁、定位關閉鍵盤事件及確認視窗消失，不把這次不穩定現象宣稱為已證明的產品缺陷。最終完整 39 項通過。
截圖：`.dev-logs/showcase-customers-mobile.png`、`showcase-skills-mobile.png`、`showcase-reassignment-mobile.png`、`showcase-public-mobile.png`。

## 邊界與後續

- 僅軟體式手機模擬及既有視窗／鍵盤模擬，未宣稱實體手機或真正注音 IME 通過。真實 OAuth、Email、LINE、Storage 上傳、收款、正式帳務未測。
- 顧客及預約目錄已移除原本初始資料上限；行事曆與報表仍沿用既有日期視窗／500 筆投影，未於本次重做完整分析查詢。其他靜態目錄仍沿用本機分頁。
- 展示店家不假造薪資發放、外部支付成功或通知已送達；未啟用的功能仍依權益及供應商設定呈現。
- Graphify 的 SQL parser 未安裝，40 個 SQL 檔未抽取；3 個既有測試檔有解析器警告。實際 TypeScript、DB 與瀏覽器測試為行為證據。
- AOCI 沿用使用者已核准的逐項原始碼驗證例外；不宣稱完整 Whole-Index 認知。索引維護以本次收尾工具的實際結果為準，不以測試通過代替索引一致性驗證。
