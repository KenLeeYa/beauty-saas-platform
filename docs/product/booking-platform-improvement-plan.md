# 美業預約平台改善計畫

## 2026-10-26 共用 APP 式工作區與顧客詳情（本機）

### 參考與取捨

本次透過 AnySearch 查閱夯客的[官方功能介紹](https://hotcake.app/)、[預約管理](https://hotcake.app/feature/reservation)與[會員管理](https://hotcake.app/feature/member)。公開資料呈現預約行事曆、會員、報表及 LINE／網頁預約等清楚分工；這是官方文件研究，不是登入夯客後的實機操作或效能比較。

| 判斷 | 本機落地方式 |
| --- | --- |
| 採用清楚且穩定的工作入口 | 商家共用主要導覽；手機保留總覽、行事曆、預約、顧客與更多，桌面使用相同來源的分類側欄。 |
| 採用以顧客為中心的操作 | 清單一次呈現 20 筆摘要；點選後在同一詳情視窗處理生日、訂金、黑名單、標籤與備註。 |
| 採用低占用工具列 | 預約入口、語言及登出皆為具名稱與提示的 44px 圖示控制，不在斷點突然展開長文字。 |
| 採用漸進揭露 | 顧客標籤管理收合；次要營運功能使用相同的「更多」選單，不因手機／桌面變更功能數量或順序。 |
| 暫緩擴充商業功能 | 本次不新增付款、行銷發送、會員金流、外部登入或付費服務，既有啟用與權限邊界不變。 |
| 不採用整套仿製或框架替換 | 保留 Lumi 品牌、現有中性色與青綠色、Next.js／React、Radix 及 Lucide，沒有複製對方素材或新增 UI 套件。 |

Better Design 額度限制沿用免費本機 UI/UX Pro Max 指引，已執行 responsive toolbar/navigation 與 Next.js state-preservation 查詢；另依 Karpathy 最小變更、Matt Pocock／Addy TDD 與 product-release-qa 執行回歸。這不是 Better Design 遠端審查或無障礙合規認證。

### 架構邊界

- 維持模組化單體與現有伺服器授權：`MerchantRoute`／營運頁先驗證組織、分店及能力，再把資料與模組可見性交給 `MerchantShell`。
- `MerchantShell` 統一目的地、選單、目前頁面與作用域連結；`WorkspaceHeader` 統一商家及員工工具。導覽只負責呈現，直接 URL 與 API 仍獨立授權。
- `CustomerManagement` 保留既有領域 callbacks，詳情視窗只改呈現；不新增平行 CRM API、資料表或交易邏輯。清單分頁目前針對伺服器既有最多 100 筆投影，不代表完整 CRM 的伺服器分頁／全域搜尋。
- 語言、視窗尺寸不作為表單或詳情的 React key。詳情關閉後再開啟保留該列備註草稿；成功儲存才清除。切換分店、路由、篩選移除該列或重新載入不承諾保存未儲存草稿。
- 頂部與底部區域有明確占位、safe-area 與有界捲動；商家底部導覽不再隨輸入焦點消失，避免失焦時遮住同一次點擊。
- 員工沿用共用工具列；平台四個主要入口維持同一結構與目前頁面狀態；顧客預約登入入口使用同規格圖示，原本分步預約、服務滑動卡片與時段視窗不變。

### 後續優先順序

1. 依實際操作回饋再拆出預約管理、服務／人員管理的領域工作區，避免讓大型 `MerchantWorkspace` 持續承擔所有表單。
2. CRM 數量成長時加入具組織與分店驗證的伺服器查詢、游標分頁與準確總數，不把目前載入筆數誤作全店總數。
3. 另外設計跨頁未儲存提醒、返回時的查詢／捲動恢復，以及帳號跨裝置語系同步。這些不以本輪的語系草稿保留測試宣稱完成。

本輪實測、失敗案例與環境識別見 `BEAUTY_TEST_RESULTS.md` 最新段落。全部保留本機，不上傳、合併或部署。

## 2026-10-21 申請人與組織／分店選擇三語擴充（本機實作）

- 補齊申請表、審核狀態、申請紀錄、產業類型、儲存／送出及錯誤訊息的繁體中文、英文與越南語；組織與分店選擇頁的標題、分店數與角色亦完成翻譯。
- 既有受控表單不以語系重建，語系切換不送出申請或清除草稿；伺服器選擇頁只翻譯文字，保留權限產生的組織／分店連結與目前網址，不從語系推導權限。
- 手機表單縮減區塊留白、輸入框維持 16px，操作按鈕隨內容排版而非蓋在鍵盤或欄位上；長組織／分店名稱換行，登出按鈕不壓縮。品牌名稱、地址、備註等使用者資料保留原文。
- 已驗證真實本機密碼登入、三語未儲存草稿保留、503 失敗後切換語系與重試、儲存後重載、送出後唯讀狀態及資料庫版本讀回；兩個組織與多分店選擇、切換三語後連結不變、未授權組織退回選擇頁。
- 完整本機瀏覽器回歸 12 項通過，另有 155 項單元與 26 項資料庫測試通過。320／390／768／1440 寬度截圖是桌面模擬，未進行新一輪實體手機鍵盤驗證。結果與限制見 `BEAUTY_TEST_RESULTS.md` 最新段落。
- 後續仍可改善帳號跨裝置語系同步、通知語系與 API 欄位級錯誤翻譯；這次不新增翻譯服務或更換框架。所有變更留在本機，未上傳、合併、部署或觸發 GitHub Actions。

## 2026-10-21 舊版預約與平台管理三語擴充（本機實作）

- 本次補齊目前 root 應用程式的 `/book/...`、`/booking/...`、平台店家總覽／明細、帳務、商家申請審查與權益設定，支援繁體中文、英文及越南語。保留的 `apps/web` 舊架構不在本次執行範圍。
- 語系更新只改呈現文字，不重新建立預約 session／hold，不改日期、時段、聯絡資料、備註或同意欄位；帳務與權益未送出的草稿亦保留。錯誤提示可隨語系切換，後端業務狀態與送出內容維持原契約。
- 舊版預約時段載入失敗提供明確重試，手機時段區限制高度並獨立捲動。平台表格於窄螢幕改為具欄位標籤的資料列，長文字換行，控制項保持可點選尺寸。
- 分店的 `OPEN` 顯示為「開放預約」，不沿用帳單「待繳款」語意；品牌、方案、服務名稱與使用者輸入不自動翻譯。LAN HTTP 使用既有安全亂數識別碼工具，避免依賴僅安全環境提供的 `crypto.randomUUID`。
- 本次 11 項瀏覽器回歸通過，含真實本機預約建立、改期、取消與資料庫讀回，以及三語草稿保留、載入失敗重試與平台權益錯誤。320／390／768／1440 寬度檢查及截圖為桌面瀏覽器模擬，不等於實體手機鍵盤驗證。
- 仍待處理：申請人表單、組織／分店選擇畫面、跨裝置帳號語系同步與通知語系。長清單分頁／查詢仍屬後續改善；本次未擴增業務功能或改動正式環境。明細見 `BEAUTY_TEST_RESULTS.md` 最新段落。

## 2026-10-21 商家與員工三語擴充（本機實作）

- 語系新增越南語 `vi`，支援 `vi-VN` 等瀏覽器偏好；選單提供跟隨裝置、繁體中文、English、Tiếng Việt。優先序與 cookie 安全設定不變，不新增外部翻譯服務。
- 商家主要工作區、CRM、通知、營運六分頁、權益試算、資格改派、員工班表、出勤與接待例外已遷移三語。原有登入及行動顧客流程的字典亦補齊越南語；未知的英文／越南語錯誤回通用重試提示，不直接暴露後端診斷。
- 手機營運導覽改為三欄兩列，長文可換行；員工先選日期查看行程；月曆用精簡數量搭配完整無障礙名稱。改派視窗內可切換語系，確認區維持獨立、不隨內容捲動。
- 草稿保留不依賴翻譯後的文字或清單版本作 React key。商家 key 僅隨已驗證的組織、分店及頁面改變；伺服器清單更新不重建表單。切換租戶／分店仍重新建立工作區，避免帶入前一作用域的資料。
- 實際回歸發現輸入失焦時底部導覽回到一般排版會造成點擊移位，已改為保持固定定位、聚焦時隱藏，並加入欄位位置不變及首次展開成功的測試。
- 已驗證三語切換保留服務、人員、資源、品牌、新增顧客與標籤草稿，以及員工日期與多項目／多人改派安排；含改派衝突失敗後切換與重試。測試明細見 `BEAUTY_TEST_RESULTS.md` 最新段落。
- **仍非全站三語完成**：公開 `/book/...`／`/booking/...`、商家申請、部分平台管理與組織選擇頁仍保留原文。帳號跨裝置同步、通知語系、完整 API 錯誤碼字典與新一輪實體手機鍵盤驗證尚未完成。

上述修改僅在本機，未 commit、push、合併或部署；未觸發 GitHub Actions。

## 2026-10-20 雙語第一階段（本機實作）

- 已啟用伺服器首屏語系判斷：手動 cookie > 瀏覽器 `Accept-Language` 品質排序 > 繁體中文。英文區域變體歸 `en`；中文變體呈現繁中，不宣稱提供簡中；未支援語言回繁中。
- 共用選單提供「跟隨裝置／繁體中文／English」。跟隨裝置會清除手動 cookie；切換成功才更新畫面，失敗保留原語言並可重試。語系 cookie 為 HttpOnly、SameSite=Lax，HTTPS 使用 Secure，手選最長一年。
- 本階段採既有 React Context、Next request headers/cookies 與型別化本機字典，未新增依賴或路由前綴。相較原建議，先不導入 next-intl；後續多語擴充或 ICU 複數格式再評估，不重寫目前業務模組。
- 已遷移：登入、共用登出／對話框關閉、LINE 行動預約與改期、顧客會員餘額與權益、平台方案頁與平台導覽。切換不重建預約元件、不改 UTC、分店時區、價格、權限或店家自訂文字；原生日期選擇器仍由瀏覽器／手機系統控制。
- 手機改善：LINE 員工登入收合，主登入表單縮減留白；平台導覽四個入口不再橫向隱藏；方案表格改兩欄標示資料、桌面保留表格；改期視窗內也能切換語言。
- **尚非全站雙語完成**：大型 merchant/staff 工作區、出勤與例外子頁、公開 `/book/...` 與 `/booking/...`、平台帳務／申請審核等仍需逐頁遷移。全域選擇器可記住偏好，但尚未遷移內容維持原文。
- 帳號跨裝置同步未實作。此版偏好屬於同一瀏覽器，會跨登入帳號保留；共用裝置可選「跟隨裝置」撤銷。顧客 `preferred_language` 是另一個業務／通知欄位，沒有拿來保存介面偏好。
- API 既有安全錯誤契約與內部分類不改動；已遷移介面翻譯已知安全錯誤，英文下未知訊息顯示通用重試提示。完整穩定錯誤碼字典仍是後續工作。

本階段驗收紀錄見 `BEAUTY_TEST_RESULTS.md` 最新語系段落。沒有新增翻譯服務、雲端設定、帳號資料 migration 或 GitHub 操作。

## 2026-10-20 手機體驗與語系評估

本次僅修改本機。以下競品資料以 AnySearch 查閱官方說明，不代表已登入競品實測，也不推測其內部架構。

### 採用與暫緩

| 官方資料 | 本平台決策 |
| --- | --- |
| [Fresha 改期說明](https://www.fresha.com/help-center/knowledge-base/calendar/263-reschedule-appointments)：從既有預約操作、選新時間，再確認調整；手機亦可從行程操作 | 採用保留原服務、人員、時間摘要的改期視窗。新日期與時段集中呈現，確認區獨立於捲動區；錯誤與重試就地顯示。這是依資料提出的本平台設計，不是複製競品版型 |
| [Timely 手機應用](https://www.gettimely.com/features/mobile-app/)：手機管理行程、查看顧客資訊、改期與取消，員工依角色使用 | 採用以當前任務為主的精簡行程與資訊列。權益寬表格在手機轉為直向標示資料列；次要技術資訊收合。不把所有營運表單塞入同一頁 |
| 競品的拖曳排程、支付與通訊整合 | 暫緩。拖曳不能成為唯一操作方式；支付及訊息仍須獨立授權、供應商設定與實際驗證 |

美業感官設計以服務、人員及預約時間為主體：白色閱讀底、深色文字、既有青綠主操作、暖色錯誤提示；未使用大幅裝飾圖或卡片套卡片。真實服務與美容師照片應沿用既有媒體權限及上傳管線，不以示意照片代替實際店家資料。

本次落地：手機改期底部視窗、載入／空資料／錯誤區分、手動重試、15 秒讀取逾時、快速換日取消舊請求、改期錯誤留在視窗、中文關閉按鈕，以及平台功能權益的中文狀態與手機資料列。尚非全站改版完成。

### 原始語系方案建議（實作差異見上方最新段落）

建議使用 next-intl 集中管理字典，保留現有模組化單體及網址，第一階段不變動路由或 OAuth callback：

1. 優先順序：本次明確選擇 > 帳號偏好 > 此裝置 cookie > `Accept-Language` 中已支援語系 > `zh-TW`。提供「跟隨裝置」選項，讓使用者可撤銷固定選擇。登入時只在沒有本次手選時套用帳號偏好。
2. 伺服器先決定語系，將同一結果傳給客戶端與 HTML `lang`；不等 hydration 後才改字。`navigator.languages` 只作無伺服器資訊時的備援。網站可取得瀏覽器偏好語言，不能保證直接讀到作業系統完整設定。
3. 先完成繁體中文，再整批提供英文，最後按客群評估日文或越南文。以已支援清單做語系匹配；不支援時回繁中，不做半頁自動翻譯。`zh-Hant`／台灣偏好歸繁中；簡體中文是否提供須明確決策，不因瀏覽器為 `zh-CN` 就假稱已支援。
4. 字典依 `booking`、`merchant`、`staff`、`member`、`errors` 分模組；API 保留穩定錯誤碼及安全參數，由介面翻譯。內部錯誤分類、狀態機與資料庫 enum 不改成中文，不將未知後端訊息直接顯示。
5. 語言、時區與貨幣分離：預約永遠依分店時區顯示，金額保留原幣別；只改日期、數字的呈現格式，不改預約 UTC 時間或價格。店名、服務自訂名稱、顧客備註不自動翻譯，不傳客資給翻譯服務。
6. 登入頁、顧客入口及商家設定提供同一個語言選擇器。未登入用 cookie；跨裝置帳號偏好需新增個人設定及 migration，不能擅自把語系放進租戶共用設定。多語快取必須依語系區分，私有資料仍不得公共快取。
7. 驗收：台灣／英文／未支援語言、手選後重新整理、登入與登出、共用裝置、缺翻譯 key、長字串、時區跨日、API 錯誤、320px 排版、焦點及注音輸入。通知語言另記預約或聯絡人偏好，避免發送時依工作者主機語系決定。

技術依據：[next-intl middleware 官方文件](https://next-intl.dev/docs/routing/middleware) 描述路由前綴、cookie、Accept-Language 與預設語言的協商機制及 best-fit 比對。上述帳號優先序及「先不變動網址」是本平台建議，並非該套件預設行為。正式導入前需再核對專案 Next.js 版本與 next-intl 的相容設定。

### 尚待逐頁處理

- 公開 `/book/...` 與 LINE 行動入口仍是兩套呈現，應共用錯誤字典及預約狀態，但維持既有驗證邊界。
- 平台帳務、方案與商家申請歷程仍需完整盤點動態 enum、長表格與手機資訊密度。
- 營運頁的薪資、行銷同意、政策讀取仍有個別失敗恢復缺口，應逐項補測，不能以本次改期測試涵蓋。
- 本次響應式瀏覽器檢查不等於 iOS Safari 或實體手機鍵盤驗證；前次 Android 證據不可當成本次新視窗實測。

## 研究範圍與限制

- 研究來源以官方產品頁與官方技術文件為主，功能比較只描述公開能力，不推測競品內部實作。
- 使用 AnySearch 盤點 Hotcake、Booksy、Fresha、Vagaro、Square Appointments 與 Mindbody 的常見流程。
- 依 `code-engineering` 與 `goal-verification` 的方式，從 Prisma schema、API schema、tenant/location context、商家工作區與公開預約流程交叉檢查。
- 專案已於 2026-08-09 建立 `.codegraph/` 本機索引，並以 `codegraph_explore` 追查 CRM、通知、角色導流與商家資料載入的符號及呼叫路徑。

## 商用平台的共同模式

| 領域 | 市場常見能力 | 對本平台的意義 |
| --- | --- | --- |
| 預約防呆 | 服務前後緩衝、資源占用、訂金、取消費、提醒 | 必須由同一個可用時段引擎計算，不能只在 UI 擋選擇 |
| 降低爽約 | 訂金、card-on-file、可信顧客豁免、黑名單、候補名單 | 現有訂金與黑名單可先用；候補名單需獨立工作流 |
| 顧客 CRM | 標籤、備註、生日、表單、同意書、療程照片 | 現有資料表已具基礎，下一步是店家介面與權限分級 |
| 多分店營運 | 分店日曆、人員/資源排程、跨店報表、品牌共用資料 | 品牌、分店、服務與顧客資料須明確分層，不可用前端參數決定 tenant |
| 顧客體驗 | 服務先選、月曆選日、只顯示有效時段、送出前揭露規則 | 現有流程方向正確，應持續維持漸進揭露與手機優先 |
| 通知 | 預約完成、付款、改期、取消、24/3/1 小時提醒 | 應由 outbox + JobQueue 發送，不應綁在 HTTP request 內同步送出 |

參考來源：

- [Hotcake 預約管理](https://hotcake.app/feature/reservation)
- [Hotcake 會員管理](https://hotcake.app/feature/member)
- [Booksy 候補名單](https://support.booksy.com/hc/en-us/articles/16463469277714-How-does-the-waitlist-work)
- [Fresha for Business](https://www.fresha.com/for-business)
- [Vagaro Forms](https://support.vagaro.com/hc/en-us/articles/360000294894-Create-and-Manage-Forms)

## 現況判讀

### 已具備且應保留

1. `OrganizationContext` 先驗證 organization/location，再把 context 傳入 repository/service。
2. 公開預約使用 session、hold、idempotency key 與交易鎖，價格由 server 重算。
3. availability 已同時考慮服務時長、前後緩衝、人員、資源、營業時間與當日例外。
4. booking state machine、事件紀錄、audit log、notification outbox 與取消政策快照已存在。
5. 顧客生日、訂金例外、黑名單、標籤、備註與媒體資料模型已存在。
6. 品牌與分店資料、圖片、個體戶/企業戶、多分店 scope 已分開。

### 目前主要缺口

1. 服務前後緩衝存在於資料庫與引擎，但商家先前無法設定。
2. 顧客自行取消/改期與免費取消期限存在於資料庫，但設定頁先前無法管理。
3. 公開預約頁先前只顯示訂金，未在送出前揭露取消與改期規則。
4. 顧客標籤與備註尚未形成可操作 CRM 工作區。
5. 尚無候補名單、自動遞補、會員票券/儲值與服務表單工作流。
6. `merchant-workspace.tsx` 承擔太多畫面責任，長期會提高回歸與多人協作成本。

## 本次本機改善

1. 服務新增與既有服務卡可設定前置/後置緩衝，更新時同時驗證 tenant 與 location scope。
2. 設定頁可開關顧客自行取消、自行改期，並設定免費取消期限。
3. 更新免費取消期限時，同步分店 booking policy 與預設 cancellation policy，避免兩套規則漂移。
4. 公開預約摘要顯示有效取消費、自助取消與改期規則。
5. 服務與設定異動後主動失效公開 catalog cache，避免店家更新後仍看到舊資料。
6. CRM 新增顧客搜尋、標籤篩選、標籤指派、標準/敏感備註與 audit；受限角色不回傳顧客手機或敏感備註。
7. 通知設定新增 pending/processing/failed/dead-letter 健康度、重試次數與手動重送。
8. 員工測試帳號導向個人班表，直接進入商家後台時會回到員工工作區。
9. 顧客管理與通知紀錄採手機堆疊版面、44px 操作控制與可收合細節，桌機保留掃描效率。

P0-P2 的完成狀態、模組責任與後續依賴順序見 `docs/architecture/modular-monolith-p0-p2.md`；本機角色測試與問題紀錄見 `docs/operations/local-role-qa-log.md`。

## 建議優先順序

### P0：正式營運前

1. 顧客標籤與備註 UI：支援標籤篩選、標準/敏感備註權限、異動 audit。
2. 取消政策編輯器：支援分店預設與服務覆寫，並在 UI 明確顯示套用層級。
3. 通知健康度：顯示 outbox pending/failed、重試次數、最後錯誤與手動重送。
4. 日曆效率：週/日檢視、人員欄、快速新增預約、拖曳改期前的衝突再驗證。
5. 付款閉環：payment intent、webhook idempotency、退款/扣留訂金與對帳狀態。

### P1：提高轉換與降低爽約

1. 候補名單：顧客選日期或日期範圍；時段釋出後通知，先搶先得，不預先鎖位。
2. 可信顧客規則：依完成率、爽約率與店家指定，決定訂金豁免或優先預約。
3. 服務前表單/同意書：版本化題目、簽署證據、服務關聯與敏感資料存取紀錄。
4. 生日與回訪自動化：透過 JobQueue 排程，模板與行銷同意分開管理。
5. 顧客自助中心：歷史預約、票券、儲值、付款、同意書與個資匯出/刪除申請。

### P2：企業與多分店

1. 品牌服務模板與分店覆寫：價格、時長、人員資格、資源需求、訂金可分層繼承。
2. 會員、套票、儲值與點數 ledger：不可只存餘額，須保留不可變動交易明細。
3. 跨店顧客主檔：organization 層級識別，location 層級保留服務紀錄與權限。
4. 多店報表：統一 KPI 定義，將營收、收款、退款、取消費與訂金分開計算。

## 整體架構建議

### 維持模組化單體

Phase 1 不需要拆微服務。建議把目前 root Next.js app 依業務邊界拆成模組：

```text
src/modules/
  booking/       availability, holds, booking lifecycle
  catalog/       services, variants, staff, resources
  crm/           customers, tags, notes, consents
  payments/      deposits, intents, refunds, reconciliation
  notifications/ templates, outbox, delivery status
  organizations/ tenant, locations, memberships, entitlements
```

每個模組維持 `schema -> application service -> repository/provider -> route/UI`，route 只負責 session、CSRF、輸入驗證與 response mapping。

### 多租戶與資料安全

1. 在 request 入口建立不可變 `OrganizationContext`，永遠不接受 body 內的 `tenant_id`。
2. organization-owned 與 location-owned repository 分開，branch-owned query 必須同時帶 organization/location。
3. PostgreSQL RLS 搭配 `FORCE ROW LEVEL SECURITY`，背景工作也需明確設定 tenant context。
4. Object Storage key 使用 organization/location 前綴，簽名 URL 需重新驗證資源擁有權。

參考：[OWASP Multi-Tenant Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)、[Microsoft 多租戶 SaaS 指引](https://learn.microsoft.com/en-us/azure/architecture/example-scenario/multi-saas/multitenant-saas)。

### 預約一致性

1. availability 是提示，hold/confirm 才是權威；兩者必須共用相同規則函式。
2. 所有產生副作用的 public API 使用 idempotency key，並保留 request/result 對應。
3. 資料庫層以 exclusion constraint 或等價鎖定策略避免人員、房間與設備重疊。
4. 改期建立新預約並標記舊預約，不覆寫歷史；取消費依 booking policy snapshot 計算。

參考：[Stripe Idempotent Requests](https://docs.stripe.com/api/idempotent_requests)、[PostgreSQL Exclusion Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-EXCLUSION)。

### 非同步與整合

1. 預約交易只寫 booking/event/outbox；LINE、Email、SMS 與 webhook 由 JobQueue 消費。
2. outbox 使用唯一 idempotency key、指數退避、dead-letter 狀態與人工重送。
3. vendor adapter 保持在 provider 層，避免業務流程直接依賴 Supabase、Cloudflare 或單一付款商。

### 前端拆分

1. 將 `merchant-workspace.tsx` 按 view 拆成 booking calendar、booking list、CRM、catalog、settings feature components。
2. server data 依 view 載入，避免進任何後台頁都抓完整 bookings/customers/services/report 資料。
3. mutation 採明確 command type，成功後局部更新或失效對應 cache tag。
4. 顧客預約維持漸進揭露：服務 -> 人員 -> 月曆 -> 時段 -> 資料 -> 摘要；手機保留固定操作區但不得遮住內容。

## 驗收指標

| 指標 | 建議目標 |
| --- | --- |
| 公開預約 API p95 | availability < 500 ms，catalog cache hit < 200 ms |
| 預約衝突 | confirm 後人員/資源重疊為 0 |
| 爽約率 | 依分店與服務追蹤，導入訂金/提醒後持續下降 |
| 預約轉換 | 開始選服務到完成預約的完成率與各步驟流失率 |
| 通知品質 | 發送成功率、延遲、重試率、永久失敗率 |
| 多租戶安全 | 每個 data-access 變更都有 tenant/branch isolation 測試 |
