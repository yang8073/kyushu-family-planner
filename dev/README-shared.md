# 家人共享行程與版本紀錄

頁面沒有建置步驟，不用 SDK 或 API 金鑰。只有一份共享行程，沒有行程代碼、密碼或加入操作。按「🔗 複製分享連結」只會複製頁面本身的 URL，家人開啟後填暱稱即可一起編輯。

**任何知道頁面與後端 URL 的人都能查看、修改。** 暱稱與裝置 ID 只供辨識紀錄，並非身分驗證；誤改可透過完整版本紀錄與還原復原。不要放秘密或個人訂房資料。

## 三種設定

在 `index.html` 的腳本開頭選擇後端：

```js
const SYNC_CFG = { type: "none", url: "", path: "kyushu2027" };
```

`none` 為本機模式，行程保留在原有 `kyushuPlanner.v2`，許願在 `kyushuPlanner.wishes`，版本快照存於 `kyushuPlanner.history`（最近 100 版）。離線也能開啟版本紀錄。舊預設升級與 v1 載入按鈕維持原有行為。

### Firebase REST

1. 建立 Firebase 專案與 **Realtime Database**（非 Firestore），可選新加坡，從鎖定模式開始。
2. 在資料庫的「規則」頁貼上 `dev/firebase-rules.json` 並發布。
3. 填入資料庫 URL：

```js
const SYNC_CFG = { type: "firebase", url: "https://<project>-default-rtdb.asia-southeast1.firebasedatabase.app", path: "kyushu2027" };
```

資料存於 `/kyushu2027/state`、`/kyushu2027/history/000001` 與 `/kyushu2027/historyIndex/000001`。目前狀態使用 ETag 條件寫入；歷史與摘要索引僅允許首次寫入。讀取使用輕量索引與 `$key` 查詢，不把 `shallow` 和 `orderBy` 混用。歷史寫入遭網路中斷時，後續 load／save／history 會先修補目前版本，下一個版本才可前進。SSE 監聽 state，20 秒輪詢作為備援。

規則根目錄不可讀寫；`kyushu2027` 可讀；只允許寫入 state 與新增 history／historyIndex。請在 Firebase Console 測試有效快照可儲存、rev 不遞增被拒絕、歷史覆寫與刪除被拒絕、空暱稱與非法許願分類被拒絕、未知子節點被拒絕。模擬器不執行規則。

### PHP jsonfile

使用 Namecheap 的 PHP 8.4 與網站根目錄外的 JSON 檔案。部署提案、目錄權限、CORS、限流與備份方式見 [server/README.md](server/README.md)，目前尚未部署。

```js
const SYNC_CFG = { type: "jsonfile", url: "https://trip.yi-jia-zi.com/api.php", path: "kyushu2027" };
```

每 8 秒只查詢輕量 rev 端點；版號改變才讀取完整快照，視窗重新聚焦或頁面恢復可見時也會檢查。

## 儲存、衝突與還原

每次行程變動、許願或還原都一起存成 `{rev,at,by,byId,summary,plan:{days,pool},wishes}`，600 ms 內連續編輯合為一版。摘要由前後快照比較產生。共享歷史永久保留，本機模式才有 100 版上限。

「🕘 版本紀錄」顯示台北時間、暱稱、裝置 ID 前 4 碼及摘要；點選可預覽每天景點、未排入項目、許願人數與相對目前狀態的差異。還原會確認並**建立新版本**「還原至第 N 版」，不覆寫或刪除舊歷史。JSON 匯入、載入預設、清空、v1 載入也會建立版本。

首次遠端為空時，以上線裝置的本機行程與全部許願建立第 1 版，摘要為「建立共享行程（由 <暱稱> 的本機行程上傳）」。首次連到已有共享內容時，編輯過且不同的本機行程會備份至 `kyushuPlanner.v2.beforeShare`；「↩️ 載入加入共享前的本機行程」會另建新版本。

離線時立即快取行程、許願與待上傳批次；恢復連線後依序上傳。如果另一裝置先儲存，純許願批次會在最新狀態重套原本的許願操作並重試。行程變更則以遠端為準，顯示通知，並在版本面板的「未儲存的本機變更（衝突備份）」保留該裝置的候選快照，可預覽或載入成新版本。這些備份不是已儲存的共享版號。清除瀏覽器資料會失去本機歷史、暱稱、裝置身分、衝突備份與未上傳修改。

## 本機測試

啟動頁面：

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Firebase 模擬器：

```sh
python3 dev/mock-rtdb.py 9000
```

開啟 `http://127.0.0.1:8000/?backend=firebase&db=http://127.0.0.1:9000`。另一個瀏覽器／無痕視窗使用相同網址，即可測試兩個裝置。模擬器只綁定本機，支援 ETag、SSE、`orderBy="$key"&limitToLast=N`，忽略其他 query 參數；資料只存記憶體，重啟即消失。

PHP 測試：

```sh
KYUSHU_DATA_DIR=/tmp/kyushu-api-test php -S 127.0.0.1:8899 -t dev/server
```

開啟 `http://127.0.0.1:8000/?backend=jsonfile&db=http://127.0.0.1:8899/api.php`。測試完停止服務並刪除測試資料。

只有頁面 hostname 為 `localhost` 或 `127.0.0.1` 才會接受 `?backend=firebase|jsonfile&db=<url>`；正式網站忽略這些覆寫參數。本機分享連結仍只複製頁面 URL，測試時請自行使用完整參數網址。

語法檢查：抽出 inline script 執行 `node --check`、`php -l dev/server/api.php`、`python3 -m py_compile dev/mock-rtdb.py`。API smoke test 應涵蓋第 1 版、過期版號 409、history、version，再確認還原會建立新版本。
