<?php
/** 九州共享行程 JSON API — PHP 8.4，資料目錄須放在網站根目錄外。 */
declare(strict_types=1);
const DATA_DIR = __DIR__ . '/../kyushu-trip-data';
const MAX_BODY = 512 * 1024;
umask(0077);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, mixed $value): never {
    http_response_code($status);
    echo json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    header('Vary: Origin');
    if ($origin !== 'https://yang8073.github.io' && !preg_match('~^http://(?:localhost|127\.0\.0\.1)(?::[0-9]{1,5})?$~D', $origin)) {
        respond(403, ['error' => '不允許的來源']);
    }
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Max-Age: 600');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function textLength(string $text): int {
    return preg_match_all('/./us', $text);
}
function nickValid(mixed $nick): bool {
    return is_string($nick) && trim($nick) !== '' && textLength($nick) >= 1 && textLength($nick) <= 12;
}
function objectValid(mixed $value): bool { return $value instanceof stdClass; }
function idValid(mixed $value): bool {
    return is_string($value) && (bool) preg_match('/^[a-z0-9_]{1,40}$/D', $value) && !in_array($value, ['__proto__', 'constructor', 'prototype'], true);
}
function deviceValid(mixed $value): bool {
    return is_string($value) && (bool) preg_match('/^[A-Za-z0-9_-]{1,64}$/D', $value) && !in_array($value, ['__proto__', 'constructor', 'prototype'], true);
}
function fieldsValid(stdClass $object, array $allowed): bool {
    return !array_diff(array_keys(get_object_vars($object)), $allowed);
}
function validateState(mixed $state): bool {
    if (!objectValid($state) || !fieldsValid($state, ['rev','at','by','byId','summary','plan','wishes','customs']) || !nickValid($state->by ?? null) || !deviceValid($state->byId ?? null)) return false;
    if (!is_string($state->summary ?? null) || textLength($state->summary) < 1 || textLength($state->summary) > 2000) return false;
    $plan = $state->plan ?? null;
    if (!objectValid($plan) || !fieldsValid($plan, ['days','pool']) || !is_array($plan->days ?? null) || count($plan->days) > 30 || !is_array($plan->pool ?? null)) return false;
    $seen = [];
    $checkItems = function (mixed $items) use (&$seen): bool {
        if (!is_array($items)) return false;
        foreach ($items as $id) {
            if (!idValid($id) || isset($seen[$id])) return false;
            $seen[$id] = true;
        }
        return true;
    };
    $dayIds = [];
    foreach ($plan->days as $day) {
        if (!objectValid($day) || !fieldsValid($day, ['id','label','items']) || !deviceValid($day->id ?? null) || isset($dayIds[$day->id]) || !is_string($day->label ?? null) || trim($day->label) === '' || textLength($day->label) > 2000 || !$checkItems($day->items ?? null)) return false;
        $dayIds[$day->id] = true;
    }
    if (!$checkItems($plan->pool)) return false;
    if (!objectValid($state->wishes ?? null)) return false;
    foreach (get_object_vars($state->wishes) as $spot => $users) {
        if (!idValid($spot) || !objectValid($users)) return false;
        foreach (get_object_vars($users) as $device => $wish) {
            if (!deviceValid($device) || !objectValid($wish) || !fieldsValid($wish, ['pool','nick','at']) || !in_array($wish->pool ?? null, ['want','maybe','meh'], true) || !nickValid($wish->nick ?? null) || !is_int($wish->at ?? null) || $wish->at < 0) return false;
        }
    }
    if (isset($state->customs)) {
        if (!objectValid($state->customs)) return false;
        $allowedCats = ['親子景點', '購物街/商圈', '安全帽店', '樂高店', 'PS5遊戲片店', '餐廳'];
        $allowedCustomFields = ['zh', 'cat', 'area', 'addr', 'lat', 'lng', 'note', 'url', 'by', 'byId', 'at', 'editBy', 'editAt'];
        foreach (get_object_vars($state->customs) as $id => $spot) {
            if (!idValid($id) || !objectValid($spot) || !fieldsValid($spot, $allowedCustomFields)) return false;
            if (!is_string($spot->zh ?? null) || trim($spot->zh) === '' || textLength($spot->zh) < 1 || textLength($spot->zh) > 60) return false;
            if (!is_string($spot->cat ?? null) || !in_array($spot->cat, $allowedCats, true)) return false;
            if (isset($spot->area) && (!is_string($spot->area) || textLength($spot->area) > 40)) return false;
            if (isset($spot->addr) && (!is_string($spot->addr) || textLength($spot->addr) > 200)) return false;
            if (isset($spot->lat) !== isset($spot->lng)) return false;
            if (isset($spot->lat)) {
                if ((!is_int($spot->lat) && !is_float($spot->lat)) || !is_finite((float)$spot->lat) || (float)$spot->lat < -90 || (float)$spot->lat > 90) return false;
            }
            if (isset($spot->lng)) {
                if ((!is_int($spot->lng) && !is_float($spot->lng)) || !is_finite((float)$spot->lng) || (float)$spot->lng < -180 || (float)$spot->lng > 180) return false;
            }
            if (isset($spot->note) && (!is_string($spot->note) || textLength($spot->note) > 1000)) return false;
            if (isset($spot->url) && (!is_string($spot->url) || !preg_match('~^https?://~i', $spot->url) || textLength($spot->url) > 2000)) return false;
            if (!nickValid($spot->by ?? null) || !deviceValid($spot->byId ?? null) || !is_int($spot->at ?? null) || $spot->at < 0) return false;
            if (isset($spot->editBy) && !nickValid($spot->editBy)) return false;
            if (isset($spot->editAt) && (!is_int($spot->editAt) || $spot->editAt < 0)) return false;
        }
    }
    return true;
}
function readJson(string $file, mixed $fallback = null): mixed {
    if (!is_file($file)) return $fallback;
    $json = file_get_contents($file);
    if ($json === false) throw new RuntimeException('無法讀取資料');
    return json_decode($json, false, 512, JSON_THROW_ON_ERROR);
}
function atomicWrite(string $path, mixed $value): void {
    $tmp = tempnam(dirname($path), '.write-');
    if ($tmp === false) throw new RuntimeException('無法建立暫存檔');
    try {
        $data = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        if (file_put_contents($tmp, $data) !== strlen($data)) throw new RuntimeException('寫入失敗');
        if (!rename($tmp, $path)) throw new RuntimeException('無法完成寫入');
    } finally {
        if (is_file($tmp)) unlink($tmp);
    }
}
function info(stdClass $entry): array {
    return ['rev'=>$entry->rev,'at'=>$entry->at,'by'=>$entry->by,'byId'=>$entry->byId,'summary'=>$entry->summary];
}
function versionPath(string $dir, int $rev): string {
    return $dir . '/history/' . str_pad((string)$rev, 6, '0', STR_PAD_LEFT) . '.json';
}
/** 所有端點持有同一把鎖；journal 讓意外中斷的多檔案寫入可重做。 */
function recover(string $dir): void {
    $entry = readJson($dir . '/transaction.json');
    if ($entry === null) return;
    $current = readJson($dir . '/state.json');
    if (!objectValid($entry) || !is_int($entry->rev ?? null) || !validateState($entry) || (($current->rev ?? 0) !== $entry->rev - 1 && ($current->rev ?? 0) !== $entry->rev)) throw new RuntimeException('交易資料異常');
    $path = versionPath($dir, $entry->rev);
    $existing = readJson($path);
    if ($existing === null) atomicWrite($path, $entry);
    elseif ($existing != $entry) throw new RuntimeException('歷史版本不可覆寫');
    $index = readJson($dir . '/history-index.json', []);
    if (!is_array($index)) throw new RuntimeException('索引資料異常');
    $index = array_values(array_filter($index, fn($item) => $item->rev < $entry->rev));
    $index[] = info($entry);
    atomicWrite($dir . '/history-index.json', $index);
    atomicWrite($dir . '/state.json', $entry);
    atomicWrite($dir . '/rev.json', ['rev'=>$entry->rev,'at'=>$entry->at,'by'=>$entry->by]);
    if (!unlink($dir . '/transaction.json')) throw new RuntimeException('無法完成交易');
}
function rateLimit(string $dir): void {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown'; // 不信任用戶可自行設定的 X-Forwarded-For。
    $path = $dir . '/rate/' . hash('sha256', $ip) . '.json';
    $minute = intdiv(time(), 60);
    $counter = readJson($path);
    $count = ($counter->minute ?? -1) === $minute ? (int)$counter->count : 0;
    if ($count >= 60) {
        header('Retry-After: ' . (60 - time() % 60));
        respond(429, ['error'=>'每分鐘最多儲存 60 次，請稍後重試']);
    }
    atomicWrite($path, ['minute'=>$minute, 'count'=>$count+1]);
}
function dailyBackup(string $dir): void {
    $day = (new DateTimeImmutable('now', new DateTimeZone('Asia/Taipei')))->format('Ymd');
    $path = $dir . '/backup/state-' . $day . '.json';
    if (!is_file($path)) {
        // 首次建立時以 null 記錄當日儲存前尚無行程。
        atomicWrite($path, readJson($dir . '/state.json'));
    }
    $files = glob($dir . '/backup/state-????????.json');
    sort($files);
    foreach (array_slice($files, 0, max(0, count($files)-60)) as $file) unlink($file);
}

try {
    $op = $_GET['op'] ?? 'state';
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($op, ['rev','state','save','history','version'], true)) respond(400, ['error'=>'未知操作']);
    if ($method !== ($op === 'save' ? 'POST' : 'GET')) { header('Allow: ' . ($op === 'save' ? 'POST, OPTIONS' : 'GET, OPTIONS')); respond(405, ['error'=>'不允許的方法']); }
    $body = null;
    if ($op === 'save') {
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_BODY) respond(400, ['error'=>'資料不可超過 512 KB']);
        $raw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
        if ($raw === false || strlen($raw) > MAX_BODY) respond(400, ['error'=>'資料不可超過 512 KB']);
        try { $body = json_decode($raw, false, 512, JSON_THROW_ON_ERROR); }
        catch (JsonException) { respond(400, ['error'=>'JSON 格式不正確']); }
        if (!objectValid($body) || !fieldsValid($body, ['baseRev','state']) || !is_int($body->baseRev ?? null) || $body->baseRev < 0 || !validateState($body->state ?? null)) respond(400, ['error'=>'行程或許願資料不正確']);
    }
    $dir = getenv('KYUSHU_DATA_DIR') ?: DATA_DIR;
    foreach ([$dir, $dir.'/history', $dir.'/backup', $dir.'/rate'] as $folder) {
        if (!is_dir($folder) && !mkdir($folder, 0700, true) && !is_dir($folder)) throw new RuntimeException('無法建立資料目錄');
    }
    $lock = fopen($dir . '/lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) throw new RuntimeException('無法鎖定資料');
    // PHP 在 exit／連線終止時亦會關閉鎖檔並釋放鎖。
    recover($dir);
    if ($op === 'rev') {
        respond(200, readJson($dir . '/rev.json', ['rev'=>0,'at'=>0,'by'=>'']));
    }
    if ($op === 'state') respond(200, readJson($dir . '/state.json'));
    if ($op === 'history') {
        $limit = filter_var($_GET['limit'] ?? '200', FILTER_VALIDATE_INT);
        if ($limit === false || $limit < 1) respond(400, ['error'=>'limit 必須為正整數']);
        $index = readJson($dir . '/history-index.json', []);
        respond(200, array_reverse(array_slice($index, -min(200, $limit))));
    }
    if ($op === 'version') {
        $rev = filter_var($_GET['rev'] ?? '', FILTER_VALIDATE_INT);
        if ($rev === false || $rev < 1) respond(400, ['error'=>'rev 必須為正整數']);
        $entry = readJson(versionPath($dir, $rev));
        if ($entry === null) respond(404, ['error'=>'版本不存在']);
        respond(200, $entry);
    }
    rateLimit($dir);
    $current = readJson($dir . '/state.json');
    $rev = $current->rev ?? 0;
    if ($body->baseRev !== $rev) respond(409, ['conflict'=>true,'state'=>$current]);
    $entry = $body->state;
    $entry->rev = $rev + 1;
    $entry->at = (int) floor(microtime(true) * 1000);
    dailyBackup($dir);
    atomicWrite($dir . '/transaction.json', $entry);
    recover($dir);
    respond(200, ['ok'=>true,'state'=>$entry]);
} catch (Throwable $error) {
    error_log('Kyushu API: ' . $error->getMessage());
    respond(500, ['error'=>'無法存取行程資料，請稍後重試']);
}
