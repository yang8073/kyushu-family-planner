<?php
// 短網址解析器草案：僅回傳白名單內的 Google 地圖網址，不轉送頁面內容。
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=86400');
header('Vary: Origin');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, ['https://yang8073.github.io', 'http://localhost'], true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
function reply(bool $ok, string $value, int $status = 200): void {
    http_response_code($status);
    if (!$ok) header('Cache-Control: no-store');
    echo json_encode($ok ? ['ok' => true, 'url' => $value] : ['ok' => false, 'error' => $value], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    reply(false, '僅接受 GET', 405);
}
// 所有跳轉都重新驗證；拒絕帳密、非標準埠、控制字元與反斜線。
function urlKind(string $url): string {
    if (strlen($url) > 8192 || preg_match('/[\x00-\x20\x7f\\\\]/', $url)) return '';
    $p = parse_url($url);
    if (!$p || ($p['scheme'] ?? '') !== 'https' || isset($p['user']) || isset($p['pass']) || (isset($p['port']) && $p['port'] !== 443)) return '';
    $host = strtolower($p['host'] ?? '');
    $path = $p['path'] ?? '/';
    if ($host === 'maps.app.goo.gl' && $path !== '/') return 'short';
    if ($host === 'goo.gl' && strpos($path, '/maps/') === 0) return 'short';
    if ($host === 'maps.google.com' && $path === '/') return 'maps';
    if (in_array($host, ['www.google.com', 'google.com', 'maps.google.com', 'www.google.co.jp', 'www.google.com.tw'], true) && preg_match('~^/maps(?:/|$)~', $path)) return 'maps';
    if ($host === 'consent.google.com') return 'consent';
    return '';
}
function consentTarget(string $url): string {
    parse_str(parse_url($url, PHP_URL_QUERY) ?? '', $q);
    $next = $q['continue'] ?? '';
    return is_string($next) && urlKind($next) === 'maps' ? $next : '';
}
function redirectUrl(string $base, string $location): string {
    if (preg_match('~^[a-z][a-z0-9+.-]*:~i', $location)) return $location;
    if (strpos($location, '//') === 0) return 'https:' . $location;
    $p = parse_url($base);
    $root = 'https://' . $p['host'];
    if ($location === '') return '';
    if ($location[0] === '?') return $root . ($p['path'] ?? '/') . $location;
    if ($location[0] === '/') return $root . $location;
    $path = substr($p['path'] ?? '/', 0, strrpos($p['path'] ?? '/', '/') + 1) . $location;
    $parts = [];
    foreach (explode('/', $path) as $part) {
        if ($part === '..') array_pop($parts);
        elseif ($part !== '.' && $part !== '') $parts[] = $part;
    }
    return $root . '/' . implode('/', $parts);
}
$url = $_GET['url'] ?? '';
if (!is_string($url) || strlen($url) > 300 || urlKind($url) !== 'short') reply(false, '無效的短網址', 400);
if (!function_exists('curl_init')) reply(false, '伺服器尚未啟用 cURL', 503);
// 僅以 REMOTE_ADDR 計數，忽略可偽造的代理標頭；暫存目錄需可寫入。
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$file = @fopen(sys_get_temp_dir() . '/kfp-maps-' . hash('sha256', $ip) . '.json', 'c+');
if (!$file || !flock($file, LOCK_EX)) reply(false, '暫時無法解析', 503);
$rate = json_decode(stream_get_contents($file), true);
$now = time();
if (!is_array($rate) || $now - ($rate['at'] ?? 0) >= 60) $rate = ['at' => $now, 'count' => 0];
$limited = ++$rate['count'] > 30;
ftruncate($file, 0);
rewind($file);
fwrite($file, json_encode($rate));
fflush($file);
flock($file, LOCK_UN);
fclose($file);
if ($limited) { header('Retry-After: 60'); reply(false, '請稍後再試', 429); }
// 上限五次跳轉；不讓 cURL 自動跟隨任何 Location。
for ($hop = 0; $hop <= 5; $hop++) {
    $kind = urlKind($url);
    if ($kind === '') reply(false, '跳轉網址不在允許清單', 400);
    if ($kind === 'consent') {
        $next = consentTarget($url);
        if ($next === '') reply(false, '無效的同意頁跳轉', 400);
        // 不抓取同意頁，僅解出已通過地圖白名單的 continue。
        reply(true, $next);
    }
    $location = '';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 5,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_USERAGENT => 'KFP-Maps-Link-Resolver/1.0',
        CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use (&$location): int {
            if (stripos($line, 'Location:') === 0) $location = trim(substr($line, 9));
            return strlen($line);
        },
        CURLOPT_WRITEFUNCTION => static function ($ch, string $body): int { return strlen($body); }
    ]);
    $success = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($success === false) reply(false, '連線失敗或逾時', 502);
    if ($status >= 300 && $status < 400) {
        if ($hop >= 5) reply(false, '跳轉次數過多', 502);
        $next = redirectUrl($url, $location);
        if (urlKind($next) === '') reply(false, '跳轉網址不在允許清單', 400);
        $url = $next;
        continue;
    }
    if ($status >= 200 && $status < 300 && $kind === 'maps') reply(true, $url);
    reply(false, '無法取得地圖網址', 502);
}
reply(false, '跳轉次數過多', 502);
