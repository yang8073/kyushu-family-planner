# Google 地圖解析器與 Places 代理（尚未部署）

此目錄提供部署草案，本次不部署。前端使用：

- `https://trip.yi-jia-zi.com/resolve-maps-link.php`：只解析 Google 分享短網址。
- `https://trip.yi-jia-zi.com/places-lookup.php`：Google Places API (New) Text Search 詳細資訊。

既有 `api.php`、同步設定與 `dev/server/` 均不需要修改。`htaccess.trip` 是正式 docroot `.htaccess` 的完整替換提案，保留 `Options -Indexes`，只開放上述兩個端點及既有 `api.php`，並明確拒絕 `test-places.php`。部署前須先備份現有 `.htaccess`。

## 正式路徑與權限

```text
~/trip.yi-jia-zi.com/                 # docroot
  api.php                           # 既有檔案，不變更
  .htaccess                         # 由 htaccess.trip 提案替換
  resolve-maps-link.php
  places-lookup.php
~/kyushu-trip-private/               # 在 docroot 外，由網站 PHP 帳號讀寫
  places_key.txt                    # 擁有者自行建立，chmod 600
  places-state/                     # 代理自建，0700；檔案 0600
    usage.lock
    usage-YYYY-MM.json              # {month,count,updated}
    cache/<sha256>.json
    rate/<sha256(ip)>.json
    rate/<sha256(ip)>.lock
```

正式代理的預設私密目錄是 `__DIR__ . '/../kyushu-trip-private'`；僅測試或不同部署路徑可用環境變數 `KFP_PRIVATE_DIR` 覆寫。擁有者在私密目錄建立 `places_key.txt`、寫入金鑰並設為 `600`；不得提交金鑰至 repo，也不得把私密目錄放到 docroot。若檔案不存在、空白或不可讀，代理回傳 `503 not_configured`，不呼叫 Google、不扣當月額度，前端會改用 OpenStreetMap。私密目錄應讓網站 PHP 執行帳號可寫入；代理使用 `umask 0077`、目錄 `0700` 及原子寫入。

## 查詢、計費與限制

Places 端點只接受 GET `?name=名稱&lat=33.59&lng=130.42`；可選 `place_id` 僅用來優先排列同次搜尋結果，沒有 Place Details 或其他第二次 Google 呼叫。名稱限 1–120 個字、禁止控制字元，座標須在合法範圍內。僅精確來源 `https://yang8073.github.io` 可用；缺少 Origin、localhost 或其他來源均回傳 `403 forbidden_origin`，CLI 測試也必須傳 Origin。允許來源的 OPTIONS 預檢回傳 204。所有回應 `Cache-Control: no-store`、`Vary: Origin`、JSON、`nosniff`。

本次 field mask 包含營業時間、電話、網站及評分，會使用 **Text Search Enterprise SKU**。[Google 官方全球價格頁](https://developers.google.com/maps/billing-and-pricing/pricing) 最後更新 **2026-10-30 UTC**：每月免費 **1,000 次**，超過後首級為 **US$35／1,000 次**。代理硬上限設為 **900 次／月**，不提供超額付費模式。此計數只管理本代理的呼叫。

月份以 **America/Los_Angeles** 的日曆月計算，對齊 Google Maps Platform 的 Pacific 計費月份，包含夏令時間；不是 UTC 或台灣時間。例如 `2026-12-01 05:00 UTC` 仍屬 `2026-11`。每月各有一個 `usage-YYYY-MM.json`，換月自然使用新的計數檔。所有計數讀寫由同一個 `flock(LOCK_EX)` 鎖保護，以暫存檔加 rename 寫入；**先持久化保留次數才呼叫 Google，失敗也扣次數**，因此併發／上游失敗仍不能繞過硬上限。計數檔毀損或無法寫入會停止查詢，不重設計數。

每個 `REMOTE_ADDR` 每 60 秒最多 **20 次**（包含快取命中），超過回傳 `429 rate_limited` 與 `Retry-After`；不信任轉送 IP 標頭。查詢順序為輸入驗證、限流、快取、金鑰檢查、額度保留、Google。成功結果（含空陣列）快取 **30 天**，鍵為 NFKC（intl 可用時）、小寫、合併空白後的名稱加上小數四位座標之 SHA-256。快取命中不扣次數；回傳當月最新 remaining，並依當次 place_id 重排。每次至多清除 20 個過期快取；不快取上游錯誤，不回傳／記錄上游本文或金鑰。

Google 只以 HTTPS POST 呼叫 `places:searchText`，搜尋三筆、偏好日本、繁體中文、輸入點周圍 300 公尺；這是偏好而非硬性範圍，代理另剔除超過 2,000 公尺的結果。連線逾時 4 秒、總逾時 8 秒、不跟隨跳轉、驗證 TLS。前端等待 9 秒，以記憶體記錄每頁不同名稱／座標查詢；有名稱的 Maps 連結停止輸入後自動查詢，一般座標／Plus Code 須按「用 Google 查詢詳細資訊」。Google 有結果時略過 Nominatim；無結果、額度用完或其他錯誤則備援至 OSM。Google 建議採用空白且未經使用者編輯的欄位，並顯示 Google Maps 來源標示。

## 驗證與部署

1. 使用 PHP 8.4 主機，啟用 cURL、有效 CA 憑證；建議啟用 mbstring 及 intl，讓 Unicode 處理完整。先在 repo 執行以下檢查；PHP 測試只使用暫存目錄與假 fetcher，不需網路或金鑰：

   ```sh
   php -l dev/resolver/places-lookup.php
   php -l dev/resolver/resolve-maps-link.php
   php -l dev/resolver/test-places.php
   php dev/resolver/test-places.php
   node dev/test-planner.cjs
   git diff --check
   ```

2. 在主機備份 docroot 既有 `.htaccess` 及兩個代理檔（若存在），例如在 `$HOME` 建立 tarball，**不要把備份放在 docroot**。記下哪些代理檔原本不存在。不要動 `api.php`。
3. 由擁有者準備上述私密目錄、金鑰及權限。只將 `resolve-maps-link.php`、`places-lookup.php` 複製到 docroot；將 `htaccess.trip` 安裝為 `.htaccess`。不要把測試腳本或整個 repo 複製進 docroot。
4. 從 GitHub Pages 正式來源確認 CORS。CLI 可用：

   ```sh
   curl -i -H 'Origin: https://yang8073.github.io' 'https://trip.yi-jia-zi.com/places-lookup.php?name=Cafe&lat=33.59&lng=130.42'
   curl -i -X OPTIONS -H 'Origin: https://yang8073.github.io' 'https://trip.yi-jia-zi.com/places-lookup.php'
   curl -i 'https://trip.yi-jia-zi.com/places-lookup.php?name=Cafe&lat=33.59&lng=130.42'
   ```

   前兩項分別應為 200（尚未設定金鑰則 503 not_configured）及 204，第三項應為 403。有效查詢會消耗一次額度，重複查詢應顯示 cached:true 且 remaining 不減。確認 `/test-places.php` 與任意其他檔案均不能公開讀取，既有 `api.php` 仍可使用。
5. 檢查瀏覽器中來源標示、候選地點、套用欄位、手寫保護與斷線備援。Service Worker 排除整個 `trip.yi-jia-zi.com`（包括 Places 端點）及 Nominatim；版本維持 `kfp-v5-20261101`。

工作環境未安裝 PHP；Node 靜態檢查不能取代上述 PHP 8.4 語法／離線測試與部署後 smoke test。此草案不包含實際部署。

## 用量查看與回復

以洛杉磯當月代入檔名查看，例如：

```sh
cat ~/kyushu-trip-private/places-state/usage-2026-11.json
```

`count` 為已保留呼叫數、`updated` 為 Unix 時間；剩餘為 `900 - count`（最低 0）。不要刪除或清空當月計數檔，否則會失去硬上限保護。單台主機的本機鎖與檔案需持續保留；多台服務需共用計數儲存與鎖。

回復時，在 docroot 還原部署前的 tarball（內含原 `.htaccess` 及原有代理檔）。若本次新增的兩個端點原本不存在，刪除 `resolve-maps-link.php`、`places-lookup.php` 並還原原 `.htaccess` 即可；若原本存在則還原其備份。前端可還原部署前的 `index.html`；未還原時 Google／短網址端點不可用也會顯示備援。保留私密用量檔，不變更 `api.php` 或同步設定。

## 短網址解析器的既有行為

`resolve-maps-link.php` 保留既有行為：每一跳重新驗證 HTTPS 主機／路徑白名單、不轉送頁面本文，最多五次跳轉，每跳連線／總逾時各 5 秒；前端等待上限為 6 秒。Google 同意頁僅解出通過白名單的 continue。成功回應快取一天，以 `Vary: Origin` 分流；錯誤不快取。該端點仍允許精確的 `https://yang8073.github.io` 及 `http://localhost`；此開發來源不適用 Places 端點。解析器限流為每 IP 每分鐘 30 次，使用系統暫存目錄；可排程清除一天以上的 `kfp-maps-*.json`。
