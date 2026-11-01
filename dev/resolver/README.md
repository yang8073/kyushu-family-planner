# Google 地圖短網址解析器（尚未部署）

此目錄是部署草案，不影響既有同步伺服器。前端預計呼叫 `https://trip.yi-jia-zi.com/resolve-maps-link.php`。服務不存在或無法連線時，前端會顯示完整網址／Plus Code／座標的替代方式，同一頁面不會重複重試失敗的解析服務。

1. 在支援 PHP 7.4 或 PHP 8 的 HTTPS 主機啟用 cURL 擴充套件及有效的 CA 憑證。
2. 先執行 `php -l resolve-maps-link.php`，將此檔案獨立放到網站根目錄的 `resolve-maps-link.php`。不要覆蓋既有 `api.php` 或更動同步設定。
3. 確認 PHP 的系統暫存目錄可寫入，供每 IP 每分鐘 30 次的限流使用；排程清除一天以上的 `kfp-maps-*.json` 舊檔。多台主機部署時應改用共用限流儲存。
4. 用實際 Maps 分享短網址驗證 GET JSON 成功回應，並從 `https://yang8073.github.io` 驗證 CORS。開發環境僅允許精確的 `http://localhost` 來源（不含其他埠）；其他來源不回傳 CORS 允許標頭。
5. 驗證非 GET、過長參數、非白名單、帳密、非 HTTPS、跳轉到外部主機，以及超過五次跳轉均遭拒絕。Google 同意頁只解出通過白名單的 `continue`，不下載同意頁內容。

每一跳均手動驗證白名單、只用 HTTPS，每次連線／總請求逾時各為 5 秒；五次跳轉可能累計超過前端的 6 秒等待上限，前端仍會安全顯示替代提示。遠端頁面本文會直接丟棄，不回傳給用戶。成功 JSON 設定 `Cache-Control: public, max-age=86400`，並以 `Vary: Origin` 區分來源。錯誤及限流回應應由主機／CDN 設為不快取，避免共享錯誤結果。

此工作環境未安裝 PHP，`node dev/test-resolver.cjs` 僅作靜態防護回歸檢查；正式部署前仍需 PHP 語法檢查及實際跳轉驗證。本次不部署。
