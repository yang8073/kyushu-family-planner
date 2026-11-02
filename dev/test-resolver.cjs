// PHP 不在工作環境內；靜態檢查不可取代部署前的語法及實際跳轉驗證。
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
function testResolver(){
 const api=fs.readFileSync(path.join(__dirname,'server/api.php'),'utf8');
 assert(api.includes("fieldsValid($state, ['rev','at','by','byId','summary','plan','wishes','customs','tagDefs'])"));
 const tagDefs=api.slice(api.indexOf("if (property_exists($state, 'tagDefs'))"),api.indexOf('if (isset($state->customs))'));
 for(const check of [
  '!objectValid($state->tagDefs)', 'count(get_object_vars($state->tagDefs)) > 200',
  'foreach (get_object_vars($state->tagDefs) as $id => $def)', '!idValid($id)', '!objectValid($def)',
  "!fieldsValid($def, ['name','by','byId','at','deleted','deletedAt','deletedBy'])",
  '!is_string($def->name ?? null)', "trim($def->name) === ''", 'textLength($def->name) > 12',
  "preg_match('/[\\p{Cc}\\p{Cf}]/u', $def->name)", '!nickValid($def->by ?? null)', '!deviceValid($def->byId ?? null)',
  '!is_int($def->at ?? null)', '$def->at < 0', "property_exists($def, 'deleted') && $def->deleted !== true",
  "property_exists($def, 'deletedAt') && (!is_int($def->deletedAt) || $def->deletedAt < 0)",
  "property_exists($def, 'deletedBy') && !nickValid($def->deletedBy)"
 ])assert(tagDefs.includes(check),check);
 const php=fs.readFileSync(path.join(__dirname,'resolver/resolve-maps-link.php'),'utf8');
 assert.match(php,/if \(\$host === 'maps\.google\.com' && \$path === '\/'\) return 'maps';/);
 for(const pattern of [/REQUEST_METHOD.*!== 'GET'/,/is_string\(\$url\).*strlen\(\$url\) > 300.*urlKind\(\$url\) !== 'short'/,/CURLOPT_FOLLOWLOCATION => false/,/CURLOPT_PROTOCOLS => CURLPROTO_HTTPS/,/CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS/,/CURLOPT_CONNECTTIMEOUT => 5/,/CURLOPT_TIMEOUT => 5/,/CURLOPT_SSL_VERIFYPEER => true/,/CURLOPT_SSL_VERIFYHOST => 2/,/\$hop <= 5/,/\$hop >= 5/,/urlKind\(\$next\) === ''/,/CURLOPT_WRITEFUNCTION.*\$body.*strlen\(\$body\)/,/CURLOPT_HEADERFUNCTION/,/Location:/,/urlKind\(\$next\) === 'maps'/,/consentTarget\(\$url\)/,/consent\.google\.com/,/isset\(\$p\['user'\]\)/,/isset\(\$p\['pass'\]\)/,/\$p\['port'\] !== 443/,/\^\/maps\(\?:\/\|\$\)/,/strpos\(\$path, '\/maps\/'\) === 0/,/REMOTE_ADDR/,/count'\] > 30/,/LOCK_EX/,/flock\(\$file, LOCK_UN\)/,/Cache-Control: public, max-age=86400/,/Cache-Control: no-store/,/Vary: Origin/])assert.match(php,pattern);
 for(const host of ['maps.app.goo.gl','goo.gl','www.google.com','google.com','maps.google.com','www.google.co.jp','www.google.com.tw'])assert(php.includes("'"+host+"'"));
 assert.match(php,/in_array\(\$origin, \['https:\/\/yang8073\.github\.io', 'http:\/\/localhost'\], true\)/);
 assert(!/Access-Control-Allow-Origin:\s*\*/.test(php));assert(!/CURLOPT_FOLLOWLOCATION\s*=>\s*true/.test(php));assert(!/CURLOPT_RETURNTRANSFER|readfile\(|file_get_contents\(/.test(php));
 assert.match(php,/\['ok' => true, 'url' => \$value\]/);assert.match(php,/\['ok' => false, 'error' => \$value\]/);
 assert(fs.readFileSync(path.join(__dirname,'resolver/README.md'),'utf8').includes('尚未部署'));
 const places=fs.readFileSync(path.join(__dirname,'resolver/places-lookup.php'),'utf8');
 assert(!places.includes('AIza'),'不得把 Google API key 寫入程式');
 const mask='places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.regularOpeningHours.weekdayDescriptions,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.primaryType,places.primaryTypeDisplayName';
 assert.equal(places.match(/const KFP_FIELD_MASK = '([^']+)'/)[1],mask);
 for(const pattern of [/declare\(strict_types=1\)/,/const MONTHLY_CAP = 900;/,/const CACHE_TTL = 30 \* 86400;/,/const RATE_PER_MIN = 20;/,/const PAGE_SIZE = 3;/,/const RADIUS_M = 300;/,/getenv\('KFP_PRIVATE_DIR'\)/,/__DIR__ \. '\/\.\.\/kyushu-trip-private'/,/\/places_key\.txt/,/is_readable\(\$keyFile\)/,/file_get_contents\(\$keyFile\)/,/flock\(\$lock, LOCK_EX\)/,/flock\(\$lock, LOCK_UN\)/,/tempnam\(/,/rename\(\$tmp, \$path\)/,/umask\(0077\)/,/mkdir\(\$dir, 0700/,/America\/Los_Angeles/,/REMOTE_ADDR/,/Retry-After:/,/Vary: Origin/,/Cache-Control: no-store/,/X-Content-Type-Options: nosniff/,/forbidden_origin/,/bad_request/,/not_configured/,/rate_limited/,/monthly_quota_reached/,/upstream_error/,/CURLOPT_FOLLOWLOCATION => false/,/CURLOPT_PROTOCOLS => CURLPROTO_HTTPS/,/CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS/,/CURLOPT_CONNECTTIMEOUT => 4/,/CURLOPT_TIMEOUT => 8/,/CURLOPT_SSL_VERIFYPEER => true/,/CURLOPT_SSL_VERIFYHOST => 2/,/X-Goog-Api-Key:/,/X-Goog-FieldMask:/,/https:\/\/places\.googleapis\.com\/v1\/places:searchText/,/'pageSize' => PAGE_SIZE/,/'languageCode' => 'zh-TW'/,/'regionCode' => 'JP'/,/'radius' => \(float\)RADIUS_M/,/function kfp_places_main\(\): void/,/if \(!defined\('KFP_PLACES_TEST'\)\) kfp_places_main\(\);/])assert.match(places,pattern);
 assert.match(places,/return \$origin === 'https:\/\/yang8073\.github\.io';/);assert(!places.includes('localhost'));assert(!/Access-Control-Allow-Origin:\s*\*/.test(places));
 assert(!/echo[^;]*\$(?:body|resp|key)\b/.test(places));assert(!/error_log\(|var_dump\(|print_r\(/.test(places));
 assert(places.indexOf('$quota = kfp_reserve_quota(')<places.indexOf('$resp = $fetcher('),'先保留額度才呼叫 Google');
 for(const fn of ['kfp_validate_input','kfp_origin_allowed','kfp_cache_key','kfp_month','kfp_reserve_quota','kfp_quota_status','kfp_normalize_places','kfp_haversine','kfp_lookup'])assert(places.includes('function '+fn+'('));
 for(const pattern of [/\$hasCoords !== array_key_exists\('lng', \$get\)/,/function kfp_cache_key\(string \$name, \?float \$lat, \?float \$lng\)/,/'none'/,/\$r\['distance_m'\] = null/,/'low' => \['latitude' => 30\.9, 'longitude' => 129\.3\]/,/'high' => \['latitude' => 34\.3, 'longitude' => 132\.1\]/,/json_encode\(kfp_search_body\(\$input\)/])assert.match(places,pattern);
 const htaccess=fs.readFileSync(path.join(__dirname,'resolver/htaccess.trip'),'utf8');assert.match(htaccess,/^Options -Indexes/m);assert.match(htaccess,/<Files "test-places\.php">\s+Require all denied\s+<\/Files>/);
 const rules=[...htaccess.matchAll(/<FilesMatch "([^"\n]+)">\s+Require all (granted|denied)\s+<\/FilesMatch>/g)].map(m=>({regex:new RegExp(m[1]),grant:m[2]==='granted'}));assert.equal(rules.length,2);
 for(const file of ['api.php','resolve-maps-link.php','places-lookup.php','test-places.php','index.html','secret.txt','.env','places-lookup.php.bak','other.php','API.php','sub-api.php']){const rule=rules.filter(r=>r.regex.test(file));assert.equal(rule.length,1,file);assert.equal(rule[0].grant,['api.php','resolve-maps-link.php','places-lookup.php'].includes(file),file);}
 const phpTest=fs.readFileSync(path.join(__dirname,'resolver/test-places.php'),'utf8');assert.match(phpTest,/define\('KFP_PLACES_TEST', true\)/);assert.match(phpTest,/sys_get_temp_dir\(\)/);assert.match(phpTest,/PASS places/);assert(!phpTest.includes('kfp_fetch_google('));
 console.log('PASS Places 代理：金鑰外置、精確 field mask／CORS、900 硬上限／先預留、鎖及原子寫入、Pacific 月界、HTTPS／逾時、不洩漏、測試入口與三檔部署白名單（靜態）');
 console.log('PASS 解析器草案：HTTPS／主機及路徑白名單、逐跳驗證、五次上限、逾時、丟棄本文、限定 CORS、快取及限流（靜態）');
}
module.exports=testResolver;if(require.main===module)testResolver();
