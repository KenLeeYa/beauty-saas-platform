# Customer CRM and Privacy

## 資料模型

Customer 屬於 Organization；預約可關聯 Customer，但公開預約仍保存當次聯絡資料快照。Consent、內部 Note、Tag 與 Media 分表，避免將敏感資料塞入一般顧客欄位。

## 權限

- Owner / Manager：依 capability 管理組織 CRM。
- FrontDesk：依授權查看及更新營運所需資料。
- ServiceProvider：只讀取完成服務所需的最小資訊。
- Customer：只能存取自己的個人資料與預約。
- PlatformAdmin：不得因平台角色而預設瀏覽商家顧客內容；支援操作需有明確目的與 audit。

## 隱私原則

- 只蒐集完成預約、通知與服務所需資料。
- 行銷同意與交易通知分開記錄，保存來源、版本及時間。
- 撤回同意不刪除法律或帳務必須保留的交易紀錄。
- 敏感內部備註不可出現在公開 API、通知內容或 URL。
- Media 需經 `ObjectStorageProvider` 產生租戶隔離 key 與短效簽名 URL；目前 UI 尚未啟用上傳。
- 匯出、匿名化與刪除請求必須保留 audit 並遵守保留政策。

## 現況

目前已具備 Customer 基本資料及店家後台列表；Consent、Note、Tag、Media 的資料模型與 RLS 已建立，完整操作 UI 與資料主體請求流程列為後續交付，不應對外宣稱已完成。
