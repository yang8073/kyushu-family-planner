# Namecheap 部署提案（尚未部署）

此方案使用 PHP 8.4 與一般檔案，沒有資料庫、帳號密碼或秘密金鑰。每次儲存都以檔案鎖檢查版號，建立永久歷史快照。網址公開可讀寫，版本紀錄與還原供家人復原誤改。

## 建議配置

1. 在 Namecheap cPanel 建立子網域 `trip.yi-jia-zi.com`，啟用 HTTPS，PHP 選擇 8.4。
2. 網站根目錄設為 `~/trip.yi-jia-zi.com/`，只上傳本目錄的 `api.php` 與 `.htaccess`。`.htaccess` 禁止列目錄與存取其他檔案。不要上傳 README、資料檔或備份。
3. 建立 `~/kyushu-trip-data`，權限 `chmod 700 ~/kyushu-trip-data`，由執行 PHP 的同一帳號持有。資料目錄必須位於網站根目錄外。預設 `DATA_DIR = __DIR__.'/../kyushu-trip-data'` 正好對應上述配置；不同目錄可修改常數或設定環境變數 `KYUSHU_DATA_DIR`（優先）。
4. 確認 `https://trip.yi-jia-zi.com/api.php?op=state` 首次回應 `null`，其他檔案網址不可存取。
5. 修改頁面設定，再由原有流程發布頁面：

```js
const SYNC_CFG = { type: "jsonfile", url: "https://trip.yi-jia-zi.com/api.php", path: "kyushu2027" };
```

jsonfile 使用單一資料目錄，不使用 `path`。本提案不會建立 DNS、上傳檔案或更改正式網站。

## 資料與備份

資料目錄包含 `state.json`、`history/000001.json` 等永久快照、`history-index.json`、輕量輪詢用 `rev.json`、`lock`、`rate/`，以及每日備份 `backup/state-YYYYMMDD.json`。`transaction.json` 僅於寫入期間存在；若程序意外停止，下一個請求會在鎖內復原交易，避免部分寫入。不要手動編輯或覆寫歷史檔。

每個台北日期的第一次成功儲存前，備份當時的 `state.json`，最多保留 60 份日備份。初次使用沒有舊行程時，當日日備份為 `null`。每日備份保留期限不影響永久版本紀錄。

定期透過 cPanel／SFTP **下載整個 `~/kyushu-trip-data` 目錄** 到另一台裝置；行程本來就有逐版快照，但仍需異地備份防止主機資料遺失。可先暫停寫入後打包，或在備份腳本中用 `flock` 取得同一個 `data/lock`，確保整包檔案屬於同一次交易。復原時停止寫入、回放整個備份並檢查目錄權限；只回到某次行程則使用頁面的版本還原功能。

## API 與限制

- `GET ?op=rev`：僅版號、時間、暱稱。
- `GET ?op=state`：目前完整狀態或 `null`。
- `POST ?op=save`：JSON `{baseRev, state}`，成功回應 `{ok:true,state}`，版號不符回應 HTTP 409 `{conflict:true,state}`。版號與時間由伺服器決定。
- `GET ?op=history&limit=200`：最新的 200 筆以內摘要，新到舊。
- `GET ?op=version&rev=N`：指定完整快照。

儲存 body 最多 512 KB、暱稱 1–12 字、最多 30 天，景點 ID 僅接受小寫英數與底線（1–40 字），許願分類只接受 `want`、`maybe`、`meh`。每 IP 每分鐘最多 60 次有效格式的儲存嘗試，超過回應 429。檔案使用 600、目錄使用 700（透過 umask 0077）。

CORS 僅允許 `https://yang8073.github.io` 及 `http://localhost:*`／`http://127.0.0.1:*`；支援 OPTIONS。CORS 是瀏覽器的來源限制，並非身分驗證。任何知道 API URL 的人仍可存取；請勿存秘密或個人訂房資料。

## 本機測試

```sh
KYUSHU_DATA_DIR=/tmp/kyushu-api-test php -S 127.0.0.1:8899 -t dev/server
```

搭配頁面 `http://127.0.0.1:8000/?backend=jsonfile&db=http://127.0.0.1:8899/api.php`。測試完停止伺服器並刪除測試資料目錄。
