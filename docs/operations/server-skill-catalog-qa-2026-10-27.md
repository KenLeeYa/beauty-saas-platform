# 技能目錄伺服器搜尋與分頁驗證

日期：2026-10-27。範圍：本機程式、保留的演練資料庫及軟體手機 QA。
沒有 commit、push、更新 PR、合併、部署、安裝依賴或啟用外部服務。

## 版本與環境

- 分支：`codex/beauty-msi-continuation-20261009`。
- 基準 HEAD：`e207febf4b9e3b9483761354b863ef45ee7a91a6`，加上原有及本次未提交修改；未覆蓋其他工作。
- Next.js 建置：`KAUENPw8_FIafHU17-36e`；本機程序 PID 61300，監聽 `0.0.0.0:3100`。
- 演練資料庫：loopback `beauty_msi_20261009`，未 reset 或重新 seed。
- 技能目錄維持組織共用，分店授權仍由已驗證的商家 context 判定。

## 實作

- `GET /api/merchant/staff/skills` 支援 `search`、`limit`、`offset`。UI 每頁 8 筆，API 上限 50 筆，搜尋最多 100 字，位移最多 1,000,000。
- SQL 在組織範圍內搜尋，依名稱及 ID 穩定排序；同一查詢取得總數與當頁資料。超出最後一頁仍回傳正確總數。
- `%`、`_` 視為一般文字，不作 LIKE 萬用字元。API 回應 `Cache-Control: no-store`。
- GET 必須登入並具備 `staff.read`，不要求寫入用 CSRF；POST、PATCH 仍保留 CSRF、管理權限、付費權益、技能驗證及版本衝突保護。
- 商家初始資料不再載入完整技能目錄；儲存時也只查驗本次送出的技能名稱。
- 技能維護、新增人員、人員詳細資料、服務所需技能均共用伺服器搜尋與分頁。提供載入、無結果、錯誤及重試狀態。
- 勾選資料由父層草稿持有，不從目前頁面的 checkbox 重建，因此翻頁、搜尋、三語切換和失敗重試不會刪除其他頁面的選取。
- 新增技能成功後重新查詢當前篩選，不需重新整理整個表單。保留既有手機彈出面板、圖示操作和固定底部按鈕。

## 自動化結果

| 檢查 | 結果 |
| --- | --- |
| TypeScript `npm run typecheck` | 通過 |
| ESLint `npm run lint` | 0 errors；1 項既有登入導覽 warning |
| 本機 production build | 通過；與上述 BUILD_ID 相同 |
| 單元測試 | 204 passed，70 個環境條件未啟用的 skips，不計為通過 |
| 資料庫整合測試 | 31 passed / 26 files，包含新增的技能目錄案例 |
| 最終完整瀏覽器回歸 | 40 passed / 11 files；15:38:06 開始，312.41 秒，exit 0 |

新增技能 API 案例包含 17 筆資料分為 8 / 8 / 1、重複查詢穩定性、超頁、文字萬用字元干擾資料、參數界限、未登入、跨組織、無效分店、服務人員拒絕及櫃台可讀。既有測試繼續涵蓋技能 RLS、實際其他分店、寫入角色、CAS、服務資格、保留時段、預約確認及改期。

手機案例跨三頁選取後取消第一頁的一項，模擬載入失敗與送出失敗，再重試成功。送出的技能精確保留第二、第三頁兩項；重新整理後搜尋可讀回勾選結果。服務技能另驗證跨頁與三語切換仍保留緩衝分鐘草稿，未將該服務草稿儲存至既有資料。

新增案例在 320 x 740、390 x 844、844 x 390 驗證三語、橫向溢出及底部按鈕。Chrome DevTools 另於區網展示店家操作兩頁技能並切換越南語，確認姓名、職稱、選取數及第一頁勾選保留。

## 本輪發現與處理

1. 第一輪完整瀏覽器結果為 34 passed / 6 failed。四項舊測試在非同步技能目錄載入前擷取表單，導致後續多出的 checkbox 被誤認為資料變更。新增共用目錄就緒等待，仍逐欄比較值及勾選狀態。
2. 手機尺寸變更的測試早於 `visualViewport` / animation frame 更新完成；改成等待實際按鈕位置符合可視範圍，沒有放寬邊界。
3. 預約重試測試固定選第三個日期，但該日的保留資料沒有空檔。實際瀏覽器確認 10 月 29 日為 0 個、10 月 30 日為 11 個時段。改成先查得至少兩個真實時段的日期，再執行空結果、延遲回應、載入失敗、重試和保留失敗測試；未修改營業時間或清空預約。
4. 第二輪完整結果為 39 passed / 1 failed。圖片成功預覽使用未寫入資料庫的 stub，可能被語系背景刷新讀回的原圖覆蓋。現在先完成三語表單保留驗證，再以新文件獨立驗證該 preview-only stub；真實圖片格式錯誤與同檔重試仍走實際 API。這不代表 Storage provider 上傳驗證。

## 測試路徑與操作

- 展示店家登入：`http://192.168.1.104:3100/api/line-booking/integrated-demo?store=showcase&role=owner`。
- 服務人員：`http://192.168.1.104:3100/merchant/staff?organization=showcase&location=daan`。
- 服務項目：`http://192.168.1.104:3100/merchant/services?organization=showcase&location=daan`。
- 既有店家仍可使用 `organization=demo&location=taipei`；`showcase/daan` 的 16 項中文技能可直接跨頁操作。

操作：登入後開啟「服務人員」，點選「技能項目」搜尋目錄；在「新增服務人員」填姓名、職稱，第一頁與第二頁各勾一項，再切換繁體中文、英文、越南語。搜尋後回到原頁，確認選項與草稿仍在。服務項目詳細資料也可操作相同技能選取器。

截圖在本機 `.dev-logs/`：`server-skills-showcase-page2.png`、`server-skills-showcase-vi.png`、`server-skills-mobile.png`、`server-service-skills-mobile.png`。測試的暫時技能只刪除該次建立的 ID，新增測試人員停用並保留紀錄；未清除既有 demo 或 showcase。

## 限制與索引

- 軟體手機及 viewport 模擬不代表實體手機、原生注音鍵盤或所有作業系統已驗證。
- LAN HTTP 仍有既有 COOP 不可信來源提示，未為測試停用安全設定。正式 HTTPS、OAuth、金流、Email、LINE 及 Storage provider 不在本輪範圍。
- 本次只把技能目錄改為資料庫分頁。其他舊版清單、免 UUID 營運操作及行事曆／報表 500 筆初始投影限制仍屬後續工作。
- 延續使用者核准的逐項原始碼驗證方式，不宣稱完整 AOCI 認知。使用 CodeGraph 追蹤技能消費端及 Graphify 免費 code-only 索引；Graphify 缺 SQL parser 並有四個測試檔解析警告，實際 TypeScript、資料庫和瀏覽器測試為行為證據。
- AOCI 增量維護於業務檔案穩定後收尾，其結果另由工具驗證紀錄確認。
