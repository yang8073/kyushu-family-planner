<?php
declare(strict_types=1);
define('KFP_PLACES_TEST', true);
require __DIR__ . '/places-lookup.php';
umask(0077);
$root = sys_get_temp_dir() . '/kfp-places-test-' . uniqid('', true);
kfp_mkdir($root);
function check(bool $condition, string $label): void {
    if (!$condition) throw new RuntimeException('FAIL places ' . $label);
}
function remove_tree(string $path): void {
    if (is_dir($path)) { foreach (new FilesystemIterator($path) as $f) remove_tree($f->getPathname()); rmdir($path); }
    else unlink($path);
}
function fixture(string $name = 'Cafe', string $lat = '33.59', string $lng = '130.42'): array {
    return kfp_validate_input(compact('name', 'lat', 'lng')) ?? [];
}
$exitCode = 0;
try {
    $valid = ['name' => '  咖啡店  ', 'lat' => '33.59', 'lng' => '130.42'];
    check(kfp_validate_input($valid)['name'] === '咖啡店', 'trim and unicode');
    foreach ([['lat' => '-90', 'lng' => '180'], ['lat' => '+.5', 'lng' => '1e2'], ['name' => str_repeat('店', 120)], ['place_id' => 'ChIJ_123456789-']] as $change) check(kfp_validate_input(array_replace($valid, $change)) !== null, 'accept validation');
    foreach ([['name' => ''], ['name' => []], ['name' => str_repeat('店', 121)], ['name' => "bad\x00name"], ['name' => "a\nb"], ['name' => "\xff"], ['lat' => '90.01'], ['lng' => '-180.1'], ['lat' => 'INF'], ['lat' => 'NaN'], ['lat' => '1e999'], ['lat' => ''], ['lat' => ' 33'], ['lat' => []], ['lat' => str_repeat('0', 21)], ['place_id' => 'short'], ['place_id' => str_repeat('a', 301)], ['place_id' => 'invalid/<1234'], ['place_id' => []]] as $change) check(kfp_validate_input(array_replace($valid, $change)) === null, 'reject validation ' . json_encode($change));
    check(kfp_validate_input([]) === null, 'required input');
    $noCoords = kfp_validate_input(['name' => 'Cafe']);
    check($noCoords !== null && $noCoords['lat'] === null && $noCoords['lng'] === null, 'coordinates optional');
    foreach ([['lat' => '33'], ['lng' => '130'], ['lat' => null, 'lng' => null]] as $change) check(kfp_validate_input(['name' => 'Cafe'] + $change) === null, 'both coordinates or neither');
    check(kfp_cache_key(' Cafe ', null, null) === hash('sha256', 'cafe|none'), 'no-coordinates cache key');
    check(kfp_cache_key('Cafe', null, null) !== kfp_cache_key('Cafe', 0, 0), 'absent coordinates differ from zero');
    $body = kfp_search_body($noCoords);
    check($body['regionCode'] === 'JP' && $body['locationBias'] === ['rectangle' => ['low' => ['latitude' => 30.9, 'longitude' => 129.3], 'high' => ['latitude' => 34.3, 'longitude' => 132.1]]], 'Kyushu rectangle without coordinates');
    check(kfp_search_body(fixture())['locationBias']['circle']['radius'] === (float)RADIUS_M, 'coordinate circle unchanged');
    check(kfp_origin_allowed('https://yang8073.github.io'), 'allowed origin');
    foreach (['', 'http://localhost', 'http://yang8073.github.io', 'https://yang8073.github.io/', 'https://yang8073.github.io.evil'] as $origin) check(!kfp_origin_allowed($origin), 'forbidden origin');
    $now = strtotime('2026-12-01T05:00:00Z');
    check(kfp_month($now) === '2026-11', 'LA month before UTC boundary');
    check(kfp_month(strtotime('2026-12-01T08:00:00Z')) === '2026-12', 'LA new month');
    check(kfp_month(strtotime('2026-07-01T06:59:59Z')) === '2026-06', 'LA DST');
    check(kfp_cache_key(' Cafe   ABC ', 33.590001, 130.420001) === kfp_cache_key('cafe abc', 33.590002, 130.420002), 'normalized cache key');
    if (class_exists('Normalizer')) check(kfp_cache_key('ＣＡＦＥ', 1, 2) === kfp_cache_key('cafe', 1, 2), 'NFKC cache key');
    $calls = 0;
    $fetch = function (array $input, string $key) use (&$calls): array { $calls++; return ['places' => []]; };
    $capDir = $root . '/cap'; kfp_mkdir($capDir); file_put_contents($capDir . '/places_key.txt', "test-placeholder\n");
    for ($i = 1; $i <= 3; $i++) {
        [$status, $p] = kfp_lookup(fixture('Cafe ' . $i), $capDir, $fetch, $now, 3);
        check($status === 200 && $p['remaining'] === 3 - $i && $calls === $i, 'reserve allowed ' . $i);
    }
    [$status, $p] = kfp_lookup(fixture('Cafe 4'), $capDir, $fetch, $now, 3);
    check($status === 429 && $p['error'] === 'monthly_quota_reached' && $p['remaining'] === 0 && $calls === 3, 'hard cap prevents fetch');
    [$status, $p] = kfp_lookup(fixture('Cafe 4'), $capDir, $fetch, strtotime('2026-12-01T08:00:00Z'), 3);
    check($status === 200 && $p['remaining'] === 2 && $calls === 4 && $p['month'] === '2026-12', 'new month reset');
    $missing = $root . '/missing';
    [$status, $p] = kfp_lookup(fixture(), $missing, $fetch, $now);
    check($status === 503 && $p['error'] === 'not_configured' && $calls === 4, 'missing key no fetch');
    check(kfp_quota_status($missing . '/places-state', 900, $now)['count'] === 0, 'missing key no quota');
    file_put_contents($missing . '/places_key.txt', "  \n");
    check(kfp_lookup(fixture(), $missing, $fetch, $now)[1]['error'] === 'not_configured', 'empty key');
    [$status, $p] = kfp_lookup(fixture('Cafe 1'), $capDir, $fetch, $now + 1, 3);
    check($status === 200 && $p['cached'] && $p['results'] === [] && $p['remaining'] === 0 && $calls === 4, 'empty cache survives exhausted cap');
    unlink($capDir . '/places_key.txt');
    check(kfp_lookup(fixture('Cafe 1'), $capDir, $fetch, $now + 2, 3)[1]['cached'], 'cache before key check');
    $errors = $root . '/errors'; kfp_mkdir($errors); file_put_contents($errors . '/places_key.txt', 'test-placeholder');
    $fail = function () use (&$calls): array { $calls++; throw new RuntimeException('private upstream body'); };
    $before = $calls;
    for ($i = 1; $i <= 2; $i++) {
        [$status, $p] = kfp_lookup(fixture(), $errors, $fail, $now, 3);
        check($status === 502 && $p['error'] === 'upstream_error' && $p['remaining'] === 3 - $i && $calls === $before + $i, 'upstream errors count without caching');
        check(!str_contains(json_encode($p), 'private upstream'), 'no upstream exposure');
    }
    [$status, $p] = kfp_lookup(fixture(), $errors, fn() => ['places' => 'invalid'], $now, 3);
    check($status === 502 && $p['remaining'] === 0, 'invalid upstream shape');
    $place = fn(string $id, float $lat) => ['id' => $id, 'displayName' => ['text' => '<Cafe>'], 'formattedAddress' => str_repeat('地', 350), 'location' => ['latitude' => $lat, 'longitude' => 130.42], 'googleMapsUri' => 'https://maps.google.com/?q=Cafe', 'websiteUri' => 'javascript:alert(1)', 'nationalPhoneNumber' => '123', 'regularOpeningHours' => ['weekdayDescriptions' => array_fill(0, 9, str_repeat('時', 130))], 'rating' => 4.3, 'userRatingCount' => 1234, 'primaryType' => 'cafe', 'primaryTypeDisplayName' => ['text' => '咖啡店']];
    $response = ['places' => [$place('near', 33.5901), $place('preferred', 33.595), $place('far', 34.0)]];
    $unbiased = kfp_normalize_places($response, null, null, null);
    check(count($unbiased) === 3 && $unbiased[2]['id'] === 'far' && array_column($unbiased, 'distance_m') === [null, null, null], 'no distance filter without coordinates');
    $noCoordsDir = $root . '/no-coords'; kfp_mkdir($noCoordsDir); file_put_contents($noCoordsDir . '/places_key.txt', 'test-placeholder');
    $noCoordsCalls = 0;
    $noCoordsFetch = function ($input) use (&$noCoordsCalls, $response) { $noCoordsCalls++; check($input['lat'] === null && $input['lng'] === null, 'fetch without coordinates'); return $response; };
    $first = kfp_lookup($noCoords, $noCoordsDir, $noCoordsFetch, $now)[1];
    $again = kfp_lookup($noCoords, $noCoordsDir, $noCoordsFetch, $now + 1)[1];
    check(!$first['cached'] && $again['cached'] && $noCoordsCalls === 1 && $again['remaining'] === 899 && count($again['results']) === 3 && $again['results'][0]['distance_m'] === null, 'no-coordinates cache and quota');
    $r = kfp_normalize_places($response, 33.59, 130.42, null);
    check(count($r) === 2 && $r[0]['id'] === 'near' && is_int($r[0]['distance_m']), 'distance filter and sorting');
    $r = kfp_normalize_places($response, 33.59, 130.42, 'preferred');
    check($r[0]['id'] === 'preferred' && $r[0]['website'] === '' && $r[0]['maps_uri'] !== '', 'id preference and safe urls');
    check(kfp_length($r[0]['address']) === 300 && count($r[0]['hours']) === 7 && kfp_length($r[0]['hours'][0]) === 120, 'string caps');
    check($r[0]['rating'] === 4.3 && $r[0]['rating_count'] === 1234, 'rating types');
    check(kfp_normalize_places(['places' => [['location' => ['latitude' => 99, 'longitude' => 0]], []]], 0, 0, null) === [], 'invalid locations');
    check(kfp_haversine(0, 0, 0, 0) === 0.0 && abs(kfp_haversine(0, 0, 0, 1) - 111195) < 1, 'haversine');
    foreach (['http://example.com', 'https://example.com'] as $url) check(kfp_url($url) === $url, 'http urls');
    foreach (['data:text/plain,test', '//example.com', 'ftp://example.com', 'https://'] as $url) check(kfp_url($url) === '', 'unsafe urls');
    $cacheDir = $root . '/cache-sort'; kfp_mkdir($cacheDir); file_put_contents($cacheDir . '/places_key.txt', 'test-placeholder');
    kfp_lookup(fixture(), $cacheDir, fn() => $response, $now);
    $withId = fixture(); $withId['place_id'] = 'preferred';
    $cached = kfp_lookup($withId, $cacheDir, $fail, $now + 1)[1];
    check($cached['cached'] && $cached['results'][0]['id'] === 'preferred', 'cached id preference');
    $before = $calls;
    check(!kfp_lookup(fixture(), $cacheDir, $fetch, $now + CACHE_TTL)[1]['cached'] && $calls === $before + 1, 'cache expiry');
    $rateDir = $root . '/rate';
    for ($i = 0; $i < 20; $i++) check(kfp_rate_limit($rateDir, '127.0.0.1', $now)['allowed'], 'rate allowed');
    check(!kfp_rate_limit($rateDir, '127.0.0.1', $now)['allowed'], 'rate blocked');
    check(kfp_rate_limit($rateDir, '127.0.0.2', $now)['allowed'], 'rate per ip');
    check(kfp_rate_limit($rateDir, '127.0.0.1', $now + 60)['allowed'], 'rate resets');
    $cleanup = $root . '/cleanup'; kfp_mkdir($cleanup);
    for ($i = 0; $i < 25; $i++) { $file = $cleanup . '/' . $i . '.json'; file_put_contents($file, '{}'); touch($file, $now - CACHE_TTL - 1); }
    kfp_clean_cache($cleanup, $now);
    check(count(glob($cleanup . '/*.json')) === 5, 'cleanup bounded to 20 expired files');
    file_put_contents($cleanup . '/fresh.json', '{}'); touch($cleanup . '/fresh.json', $now);
    kfp_clean_cache($cleanup, $now);
    check(is_file($cleanup . '/fresh.json'), 'cleanup keeps unexpired cache');
    // Corrupt counters fail closed rather than resetting quota.
    file_put_contents($capDir . '/places-state/usage-2026-11.json', '{}');
    $closed = false; try { kfp_reserve_quota($capDir . '/places-state', 3, $now); } catch (RuntimeException $e) { $closed = true; }
    check($closed, 'corrupt counter fails closed');
    echo "PASS places validation, origins, Pacific month, quota, cache, errors, normalization, rate limit\n";
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    $exitCode = 1;
} finally { remove_tree($root); }
exit($exitCode);
