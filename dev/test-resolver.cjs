// PHP 不在工作環境內；靜態檢查不可取代部署前的語法及實際跳轉驗證。
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
function testResolver(){
 const php=fs.readFileSync(path.join(__dirname,'resolver/resolve-maps-link.php'),'utf8');
 for(const pattern of [/REQUEST_METHOD.*!== 'GET'/,/is_string\(\$url\).*strlen\(\$url\) > 300.*urlKind\(\$url\) !== 'short'/,/CURLOPT_FOLLOWLOCATION => false/,/CURLOPT_PROTOCOLS => CURLPROTO_HTTPS/,/CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS/,/CURLOPT_CONNECTTIMEOUT => 5/,/CURLOPT_TIMEOUT => 5/,/CURLOPT_SSL_VERIFYPEER => true/,/CURLOPT_SSL_VERIFYHOST => 2/,/\$hop <= 5/,/\$hop >= 5/,/urlKind\(\$next\) === ''/,/CURLOPT_WRITEFUNCTION.*\$body.*strlen\(\$body\)/,/CURLOPT_HEADERFUNCTION/,/Location:/,/urlKind\(\$next\) === 'maps'/,/consentTarget\(\$url\)/,/consent\.google\.com/,/isset\(\$p\['user'\]\)/,/isset\(\$p\['pass'\]\)/,/\$p\['port'\] !== 443/,/\^\/maps\(\?:\/\|\$\)/,/strpos\(\$path, '\/maps\/'\) === 0/,/REMOTE_ADDR/,/count'\] > 30/,/LOCK_EX/,/flock\(\$file, LOCK_UN\)/,/Cache-Control: public, max-age=86400/,/Cache-Control: no-store/,/Vary: Origin/])assert.match(php,pattern);
 for(const host of ['maps.app.goo.gl','goo.gl','www.google.com','google.com','maps.google.com','www.google.co.jp','www.google.com.tw'])assert(php.includes("'"+host+"'"));
 assert.match(php,/in_array\(\$origin, \['https:\/\/yang8073\.github\.io', 'http:\/\/localhost'\], true\)/);
 assert(!/Access-Control-Allow-Origin:\s*\*/.test(php));assert(!/CURLOPT_FOLLOWLOCATION\s*=>\s*true/.test(php));assert(!/CURLOPT_RETURNTRANSFER|readfile\(|file_get_contents\(/.test(php));
 assert.match(php,/\['ok' => true, 'url' => \$value\]/);assert.match(php,/\['ok' => false, 'error' => \$value\]/);
 assert(fs.readFileSync(path.join(__dirname,'resolver/README.md'),'utf8').includes('尚未部署'));
 console.log('PASS 解析器草案：HTTPS／主機及路徑白名單、逐跳驗證、五次上限、逾時、丟棄本文、限定 CORS、快取及限流（靜態）');
}
module.exports=testResolver;if(require.main===module)testResolver();
