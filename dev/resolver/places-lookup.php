<?php
declare(strict_types=1);

// Deployed beside api.php; the owner provisions this directory outside docroot.
define('PRIVATE_DIR', getenv('KFP_PRIVATE_DIR') ?: __DIR__ . '/../kyushu-trip-private');
const MONTHLY_CAP = 900;
const CACHE_TTL = 30 * 86400;
const RATE_PER_MIN = 20;
const PAGE_SIZE = 3;
const RADIUS_M = 300;
// These fields trigger Text Search Enterprise (1,000 free requests/month).
const KFP_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.regularOpeningHours.weekdayDescriptions,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.primaryType,places.primaryTypeDisplayName';

function kfp_origin_allowed(string $origin): bool {
    return $origin === 'https://yang8073.github.io';
}
function kfp_length(string $s): int {
    return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : (preg_match_all('/./us', $s, $m) ?: 0);
}
function kfp_text($value, int $limit): string {
    if (!is_string($value) || !preg_match('//u', $value)) return '';
    $value = preg_replace('/[\p{Cc}\p{Cf}]/u', '', $value) ?? '';
    if (function_exists('mb_substr')) return mb_substr($value, 0, $limit, 'UTF-8');
    preg_match_all('/./us', $value, $chars);
    return implode('', array_slice($chars[0], 0, $limit));
}
function kfp_validate_input(array $get): ?array {
    if (!is_string($get['name'] ?? null)) return null;
    if (preg_match('/[\p{Cc}\p{Cf}]/u', $get['name'])) return null;
    $name = trim($get['name']);
    if (!preg_match('//u', $name) || preg_match('/[\p{Cc}\p{Cf}]/u', $name) || kfp_length($name) < 1 || kfp_length($name) > 120) return null;
    foreach (['lat' => 90, 'lng' => 180] as $field => $max) {
        $v = $get[$field] ?? null;
        if (!is_string($v) || strlen($v) > 20 || !preg_match('/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/D', $v) || !is_finite((float)$v) || abs((float)$v) > $max) return null;
    }
    $id = $get['place_id'] ?? null;
    if (array_key_exists('place_id', $get) && (!is_string($id) || !preg_match('/^[A-Za-z0-9_-]{10,300}$/D', $id))) return null;
    return ['name' => $name, 'lat' => (float)$get['lat'], 'lng' => (float)$get['lng'], 'place_id' => $id];
}
function kfp_cache_key(string $name, float $lat, float $lng): string {
    if (class_exists('Normalizer')) $name = Normalizer::normalize($name, Normalizer::FORM_KC) ?: $name;
    $name = function_exists('mb_strtolower') ? mb_strtolower($name, 'UTF-8') : strtolower($name);
    $name = trim(preg_replace('/\s+/u', ' ', $name) ?? $name);
    return hash('sha256', $name . '|' . number_format(round($lat, 4) ?: 0, 4, '.', '') . '|' . number_format(round($lng, 4) ?: 0, 4, '.', ''));
}
function kfp_month(int $ts): string {
    // Google Maps Platform billing months reset in Pacific calendar time, including DST.
    return (new DateTimeImmutable('@' . $ts))->setTimezone(new DateTimeZone('America/Los_Angeles'))->format('Y-m');
}
function kfp_mkdir(string $dir): void {
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) throw new RuntimeException('state_unavailable');
}
function kfp_read_json(string $path): ?array {
    if (!is_file($path)) return null;
    $raw = @file_get_contents($path);
    if ($raw === false) throw new RuntimeException('state_unavailable');
    $data = json_decode($raw, true);
    if (!is_array($data)) throw new RuntimeException('state_unavailable');
    return $data;
}
function kfp_atomic_json(string $path, array $data): void {
    $tmp = tempnam(dirname($path), '.kfp-');
    if ($tmp === false) throw new RuntimeException('state_unavailable');
    try {
        @chmod($tmp, 0600);
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        if (@file_put_contents($tmp, $json) !== strlen($json) || !@rename($tmp, $path)) throw new RuntimeException('state_unavailable');
    } finally { if (is_file($tmp)) @unlink($tmp); }
}
function kfp_locked(string $path, callable $fn): array {
    $lock = @fopen($path, 'c');
    if ($lock === false) throw new RuntimeException('state_unavailable');
    try {
        if (!flock($lock, LOCK_EX)) throw new RuntimeException('state_unavailable');
        return $fn();
    } finally { flock($lock, LOCK_UN); fclose($lock); }
}
/** @return array{allowed:bool,remaining:int,count:int} */
function kfp_quota(string $dir, int $cap, int $now, bool $reserve): array {
    kfp_mkdir($dir);
    return kfp_locked($dir . '/usage.lock', function () use ($dir, $cap, $now, $reserve): array {
        $month = kfp_month($now);
        $path = $dir . '/usage-' . $month . '.json';
        $data = kfp_read_json($path);
        if ($data !== null && (($data['month'] ?? '') !== $month || !is_int($data['count'] ?? null) || $data['count'] < 0)) throw new RuntimeException('state_unavailable');
        $count = $data['count'] ?? 0;
        $allowed = $count < $cap;
        // Reserve durably BEFORE fetching. Failed upstream calls still consume quota.
        if ($reserve && $allowed) {
            $count++;
            kfp_atomic_json($path, ['month' => $month, 'count' => $count, 'updated' => $now]);
        }
        return ['allowed' => $allowed, 'remaining' => max(0, $cap - $count), 'count' => $count];
    });
}
function kfp_reserve_quota(string $dir, int $cap, int $now): array { return kfp_quota($dir, $cap, $now, true); }
function kfp_quota_status(string $dir, int $cap, int $now): array { return kfp_quota($dir, $cap, $now, false); }
function kfp_rate_limit(string $dir, string $ip, int $now): array {
    kfp_mkdir($dir);
    $path = $dir . '/' . hash('sha256', $ip);
    return kfp_locked($path . '.lock', function () use ($path, $now): array {
        $data = kfp_read_json($path . '.json');
        $start = (int)($data['start'] ?? $now);
        $count = ($now >= $start && $now < $start + 60) ? (int)($data['count'] ?? 0) : 0;
        if ($count === 0) $start = $now;
        if ($count >= RATE_PER_MIN) return ['allowed' => false, 'retry' => max(1, $start + 60 - $now)];
        kfp_atomic_json($path . '.json', ['start' => $start, 'count' => $count + 1]);
        return ['allowed' => true, 'retry' => 0];
    });
}
function kfp_haversine(float $lat1, float $lng1, float $lat2, float $lng2): float {
    $a = sin(deg2rad($lat2 - $lat1) / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin(deg2rad($lng2 - $lng1) / 2) ** 2;
    return 6371000 * 2 * asin(sqrt(min(1.0, max(0.0, $a))));
}
function kfp_url($value): string {
    $url = kfp_text($value, 500);
    return filter_var($url, FILTER_VALIDATE_URL) && in_array(strtolower((string)parse_url($url, PHP_URL_SCHEME)), ['http', 'https'], true) ? $url : '';
}
function kfp_sort_places(array $results, float $lat, float $lng, ?string $placeId): array {
    foreach ($results as &$r) $r['distance_m'] = (int)round(kfp_haversine($lat, $lng, $r['lat'], $r['lng']));
    unset($r);
    $results = array_values(array_filter($results, fn($r) => kfp_haversine($lat, $lng, $r['lat'], $r['lng']) <= 2000));
    usort($results, fn($a, $b) => (($b['id'] === $placeId) <=> ($a['id'] === $placeId)) ?: ($a['distance_m'] <=> $b['distance_m']));
    return $results;
}
function kfp_normalize_places(array $resp, float $lat, float $lng, ?string $placeId): array {
    $results = [];
    foreach (is_array($resp['places'] ?? null) ? array_slice($resp['places'], 0, PAGE_SIZE) : [] as $p) {
        if (!is_array($p)) continue;
        $x = $p['location']['latitude'] ?? null; $y = $p['location']['longitude'] ?? null;
        if (!is_numeric($x) || !is_numeric($y) || !is_finite((float)$x) || !is_finite((float)$y) || abs((float)$x) > 90 || abs((float)$y) > 180) continue;
        $hours = $p['regularOpeningHours']['weekdayDescriptions'] ?? [];
        $results[] = [
            'id' => kfp_text($p['id'] ?? '', 300), 'name' => kfp_text($p['displayName']['text'] ?? '', 200),
            'address' => kfp_text($p['formattedAddress'] ?? '', 300), 'lat' => (float)$x, 'lng' => (float)$y,
            'maps_uri' => kfp_url($p['googleMapsUri'] ?? ''),
            'hours' => is_array($hours) ? array_map(fn($s) => kfp_text($s, 120), array_slice($hours, 0, 7)) : [],
            'phone' => kfp_text($p['nationalPhoneNumber'] ?? '', 100), 'website' => kfp_url($p['websiteUri'] ?? ''),
            'rating' => is_numeric($p['rating'] ?? null) && is_finite((float)$p['rating']) ? (float)$p['rating'] : null,
            'rating_count' => is_int($p['userRatingCount'] ?? null) && $p['userRatingCount'] >= 0 ? $p['userRatingCount'] : null,
            'type' => kfp_text($p['primaryType'] ?? '', 100), 'type_label' => kfp_text($p['primaryTypeDisplayName']['text'] ?? '', 200),
        ];
    }
    return kfp_sort_places($results, $lat, $lng, $placeId);
}
function kfp_fetch_google(array $input, string $key): array {
    if (!function_exists('curl_init')) throw new RuntimeException('upstream_error');
    $curl = curl_init('https://places.googleapis.com/v1/places:searchText');
    if ($curl === false) throw new RuntimeException('upstream_error');
    try {
        curl_setopt_array($curl, [
            CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => 8,
            CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Goog-Api-Key: ' . $key, 'X-Goog-FieldMask: ' . KFP_FIELD_MASK],
            CURLOPT_POSTFIELDS => json_encode(['textQuery' => $input['name'], 'pageSize' => PAGE_SIZE, 'languageCode' => 'zh-TW', 'regionCode' => 'JP',
                'locationBias' => ['circle' => ['center' => ['latitude' => $input['lat'], 'longitude' => $input['lng']], 'radius' => (float)RADIUS_M]]], JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION),
        ]);
        $body = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        if (!is_string($body) || $status < 200 || $status >= 300) throw new RuntimeException('upstream_error');
        $data = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($data) || substr(ltrim($body), 0, 1) !== '{' || isset($data['error']) || (isset($data['places']) && !is_array($data['places']))) throw new RuntimeException('upstream_error');
        return $data;
    } finally { curl_close($curl); }
}
function kfp_clean_cache(string $dir, int $now): void {
    // Bounded scan as well as bounded deletes: never walk the whole cache per request.
    $seen = 0;
    foreach (new DirectoryIterator($dir) as $file) {
        if (!$file->isFile() || $file->getExtension() !== 'json') continue;
        if ($file->getMTime() < $now - CACHE_TTL) @unlink($file->getPathname());
        if (++$seen >= 20) break;
    }
}
/** $dir is the private directory; injected fetcher returns decoded Google JSON or throws. */
function kfp_lookup(array $input, string $dir, callable $fetcher, int $now, int $cap = MONTHLY_CAP): array {
    umask(0077);
    $state = $dir . '/places-state'; $cacheDir = $state . '/cache';
    kfp_mkdir($cacheDir);
    $path = $cacheDir . '/' . kfp_cache_key($input['name'], $input['lat'], $input['lng']) . '.json';
    $cached = kfp_read_json($path);
    kfp_clean_cache($cacheDir, $now);
    if ($cached !== null && is_int($cached['created'] ?? null) && $cached['created'] <= $now && $now - $cached['created'] < CACHE_TTL && is_array($cached['results'] ?? null)) {
        $quota = kfp_quota_status($state, $cap, $now);
        return [200, ['ok' => true, 'source' => 'google', 'cached' => true, 'remaining' => $quota['remaining'], 'month' => kfp_month($now),
            'results' => kfp_sort_places($cached['results'], $input['lat'], $input['lng'], $input['place_id'] ?? null)]];
    }
    $keyFile = $dir . '/places_key.txt';
    $key = is_readable($keyFile) ? @file_get_contents($keyFile) : false;
    if ($key === false || trim($key) === '') return [503, ['ok' => false, 'error' => 'not_configured']];
    $quota = kfp_reserve_quota($state, $cap, $now);
    if (!$quota['allowed']) return [429, ['ok' => false, 'error' => 'monthly_quota_reached', 'remaining' => 0]];
    try {
        $resp = $fetcher($input, trim($key));
        if (!is_array($resp) || isset($resp['error']) || (isset($resp['places']) && !is_array($resp['places']))) throw new RuntimeException('upstream_error');
        $results = kfp_normalize_places($resp, $input['lat'], $input['lng'], $input['place_id'] ?? null);
    } catch (Throwable $e) { return [502, ['ok' => false, 'error' => 'upstream_error', 'remaining' => $quota['remaining']]]; }
    kfp_atomic_json($path, ['created' => $now, 'results' => $results]);
    return [200, ['ok' => true, 'source' => 'google', 'cached' => false, 'remaining' => $quota['remaining'], 'month' => kfp_month($now), 'results' => $results]];
}
function kfp_reply(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
function kfp_places_main(): void {
    umask(0077);
    header('Vary: Origin'); header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff'); header('Cache-Control: no-store');
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (!kfp_origin_allowed($origin)) { kfp_reply(403, ['ok' => false, 'error' => 'forbidden_origin']); return; }
    header('Access-Control-Allow-Origin: https://yang8073.github.io');
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); return; }
    $input = kfp_validate_input($_GET);
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET' || $input === null) { kfp_reply(400, ['ok' => false, 'error' => 'bad_request']); return; }
    try {
        $now = time();
        // Ignore forwarded headers; REMOTE_ADDR alone is the rate-limit identity.
        $rate = kfp_rate_limit(PRIVATE_DIR . '/places-state/rate', $_SERVER['REMOTE_ADDR'] ?? '', $now);
        if (!$rate['allowed']) { header('Retry-After: ' . $rate['retry']); kfp_reply(429, ['ok' => false, 'error' => 'rate_limited']); return; }
        [$status, $payload] = kfp_lookup($input, PRIVATE_DIR, 'kfp_fetch_google', $now);
        kfp_reply($status, $payload);
    } catch (Throwable $e) {
        // Fail closed on storage errors. Never expose credentials or upstream bodies.
        kfp_reply(503, ['ok' => false, 'error' => 'state_unavailable']);
    }
}
if (!defined('KFP_PLACES_TEST')) kfp_places_main();
