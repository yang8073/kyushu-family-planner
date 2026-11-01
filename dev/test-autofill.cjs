// Google 地圖自動填入與行程小地圖；只使用記憶體 DOM／fetch，不連線外部服務。
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
module.exports=async function({html,page,initial,sleep,leaflet}){
 const json=(p,code)=>JSON.parse(p.run('JSON.stringify('+code+')')),p=page();await initial(p);
 const parse=s=>json(p,'planner.parseGoogleMapsLink('+JSON.stringify(s)+')');
 for(const [url,expected]of [
  ['https://www.google.com/maps/place/%E6%A8%82%E9%AB%98+Shop/@33.1,130.1,17z/data=!3d33.2!4d130.2!3d33.59!4d130.42',{kind:'full',name:'樂高 Shop',lat:33.59,lng:130.42,precise:true}],
  ['https://www.google.com/maps/search/Cafe+ABC/@33.59,130.42,17z',{kind:'full',name:'Cafe ABC',lat:33.59,lng:130.42,precise:false}],
  ['https://www.google.com/maps/place/33.59%2C130.42/@33.59,130.42,17z',{name:'',lat:33.59,precise:false}],
  ['https://www.google.com/maps/?q=33.59%2C130.42',{lat:33.59,lng:130.42,precise:true}],
  ['https://maps.google.com/?q=Cafe+ABC',{kind:'full',name:'Cafe ABC',lat:null,lng:null}],
  ['https://maps.google.com/?query=33.59,130.42',{lat:33.59,lng:130.42}],
  ['https://maps.google.com/?ll=33.59,130.42',{lat:33.59,lng:130.42,precise:false}],
  ['https://www.google.com/maps/@-33.59,-130.42,12z',{lat:-33.59,lng:-130.42,precise:false}],
  ['https://www.google.com/maps?cid=123456',{kind:'full',cid:'123456',lat:null,lng:null}],
  ['https://www.google.com/maps/search/?api=1&query=店名&query_place_id=TEST_PLACE',{name:'店名',placeId:'TEST_PLACE',lat:null}],
  ['https://www.google.com/maps?place_id=TEST_OTHER',{placeId:'TEST_OTHER'}],
  ['https://www.google.co.jp/maps/place/日本のお店/@33.59,130.42,17z',{name:'日本のお店',lat:33.59}],
  ['https://www.google.com.tw/maps/search/咖啡店/@33.59,130.42,17z',{name:'咖啡店',lat:33.59}],
  ['https://maps.app.goo.gl/example',{kind:'short',lat:null,lng:null}],
  ['https://goo.gl/maps/example',{kind:'short'}],
  ['店名\n福岡市地址\nhttps://maps.app.goo.gl/example',{kind:'short',name:'店名'}],
  ['分享店名\n地址\nhttps://www.google.com/maps/@33.59,130.42,17z',{kind:'full',name:'分享店名',lat:33.59}],
  ['https://google.com.evil.test/maps/@33.59,130.42',{kind:'none',name:'',lat:null}],
  ['https://goo.gl/elsewhere',{kind:'none'}],['文字',{kind:'none'}]
 ]){const result=parse(url);for(const [key,value]of Object.entries(expected))assert.equal(result[key],value,url+' / '+key);if(result.lat!==null)assert.equal(json(p,'planner.parseCoords('+JSON.stringify(url)+')').lat,result.lat);}
 // 日本語地址組合是純函式；丁目優先採最細層級，並正規化全形數字。
 const japanese=address=>p.run('planner.japaneseOsmAddress('+JSON.stringify(address)+')');
 const jaAddress={house_number:'2',administrative:'中洲五丁目',quarter:'中洲',suburb:'博多区',city:'福岡市',province:'福岡県',postcode:'810-0801'},jaText='〒810-0801 福岡市博多区中洲5-2';
 for(const [address,expected]of [
  [jaAddress,jaText],
  [{neighbourhood:'博多駅東一丁目',quarter:'博多駅中央街',suburb:'博多区',city:'福岡市',postcode:'812-0012'},'〒812-0012 福岡市博多区博多駅東1丁目'],
  [{quarter:'祇園町',suburb:'博多区',city:'福岡市',postcode:'812-0018'},'〒812-0018 福岡市博多区祇園町'],
  [{...jaAddress,house_number:'２',postcode:'８１０-０８０１'},jaText],
  [{province:'熊本県',county:'阿蘇郡',town:'南小国町',quarter:'満願寺'},'熊本県阿蘇郡南小国町満願寺'],
  [{province:'熊本県',county:'阿蘇郡',village:'産山村',quarter:'田尻',house_number:'２３'},'熊本県阿蘇郡産山村田尻23'],
  [{neighbourhood:'中洲六丁目',administrative:'中洲五丁目',quarter:'中洲四丁目'},'中洲6丁目'],
  [{quarter:'中洲１２丁目',house_number:'３-４'},'中洲12-3-4'],
  [{neighbourhood:'住吉',suburb:'博多区',city:'福岡市'},'福岡市博多区住吉'],
  [{suburb:'博多区',city:'福岡市'},'福岡市博多区'],[{},''],[null,''],[{country:'日本'},'']
 ])assert.equal(japanese(address),expected);
 const kanji=['','一','二','三','四','五','六','七','八','九'];for(let n=1;n<=29;n++){const numeral=n<10?kanji[n]:(n>=20?'二':'')+'十'+kanji[n%10];assert.equal(japanese({quarter:'町'+numeral+'丁目',house_number:'２'}),'町'+n+'-2');}
 assert.equal(parse('https://www.google.com/maps/place/%zz/@33,130,17z').name,'%zz');
 assert.equal(parse('https://www.google.com/maps/@99,200,17z').lat,null);
 for(const value of ['33.59, 130.42','HCR9+2X 福岡市','8Q5GHCR9+2X'])assert(p.run('planner.parseCoords('+JSON.stringify(value)+')'));
 assert.match(p.run('planner.coordsInfo("https://www.google.com/maps/@33,130,17z").warning'),/視野中心/);
 // 名稱與 150 m 內匹配；全形、大小寫、部分名稱與字元重疊。
 assert(p.run('planner.looseMapsName("ＣＡＦＥ ABC","cafe abc 博多")'));assert(p.run('planner.looseMapsName("博多咖啡店","咖啡博多屋")'));assert(!p.run('planner.looseMapsName("AAA","BBB")'));
 const point={lat:33.59,lng:130.42},near={lat:'33.5901',lon:'130.42',name:'ＣＡＦＥ ABC'},far={lat:'33.6',lon:'130.42',name:'Cafe ABC'},wrong={lat:'33.59',lon:'130.42',name:'公園'};
 p.context.testPoint=point;p.context.testMatches=[far,wrong,near];assert.equal(p.run('planner.selectMapsMatch(testMatches,testPoint,"Cafe ABC").lat'),near.lat);
 const delta=meters=>meters/6371000*180/Math.PI;p.context.testMatches=[{lat:String(point.lat+delta(150.1)),lon:'130.42',name:'Cafe ABC'}];assert.equal(p.run('planner.selectMapsMatch(testMatches,testPoint,"Cafe ABC")'),null);
 p.context.testMatches=[{lat:String(point.lat+delta(149.9)),lon:'130.42',name:'Cafe ABC'}];assert(p.run('planner.selectMapsMatch(testMatches,testPoint,"Cafe ABC")'));
 for(const [tags,name,expected]of [[{amenity:'restaurant'},'','餐廳'],[{amenity:'fast_food'},'','餐廳'],[{amenity:'cafe'},'','餐廳'],[{amenity:'food_court'},'','餐廳'],[{shop:'toys'},'LEGO 博多','樂高店'],[{shop:'toys'},'玩具店',''],[{shop:'video_games'},'ゲーム屋','PS5遊戲片店'],[{shop:'electronics'},'PS5 Game','PS5遊戲片店'],[{shop:'electronics'},'電器屋',''],[{shop:'mall'},'','購物街/商圈'],[{shop:'department_store'},'','購物街/商圈'],[{amenity:'marketplace'},'','購物街/商圈'],...['theme_park','zoo','aquarium','museum','park','attraction','playground'].map(type=>[{tourism:type},'','親子景點']),[{shop:'motorcycle'},'','安全帽店'],[{shop:'sports'},'ヘルメット専門店','安全帽店'],[{},'Motorcycle Museum','']])assert.equal(p.run('planner.mapsCategory('+JSON.stringify(tags)+','+JSON.stringify(name)+')'),expected);
 // 自動名稱僅填未編輯的空欄位；手動清空亦不會被背景查詢改回。
 p.run('openCustomForm()');const link='https://www.google.com/maps/place/Cafe+ABC/@33.59,130.42,17z';p.els.customCoords.value=link;p.els.customCoords.oninput();assert.equal(p.els.customZh.value,'Cafe ABC');
 p.els.customZh.value='我的名稱';p.els.customZh.oninput();p.els.customCoords.oninput();assert.equal(p.els.customZh.value,'我的名稱');p.els.customZh.value='';p.els.customZh.oninput();p.els.customCoords.oninput();assert.equal(p.els.customZh.value,'');
 p.run('cancelCustomLookup();overlayTop().state.suggestions={addr:"<img src=x onerror=bad>",hours:"10:00–18:00",url:"javascript:bad()",phone:"<script>bad</script>",cat:"餐廳"};renderCustomSuggestions()');
 assert(!p.els.customSuggest.innerHTML.includes('<img'));assert(!p.els.customSuggest.innerHTML.includes('<script>'));assert.match(p.els.customSuggest.innerHTML,/&lt;img/);assert.match(p.els.customSuggest.innerHTML,/© OpenStreetMap contributors/);
 p.els.customAddr.value='原地址';p.els.customNote.value='手寫備註';p.els.customCat.value='親子景點';p.run('applyCustomSuggestion("all")');assert.equal(p.els.customAddr.value,'原地址');assert.equal(p.els.customNote.value,'手寫備註');assert.equal(p.els.customCat.value,'親子景點');assert.equal(p.els.customUrl.value,'');
 p.run('applyCustomSuggestion("addr")');assert.equal(p.els.customAddr.value,'<img src=x onerror=bad>');p.run('applyCustomSuggestion("hours");applyCustomSuggestion("phone");applyCustomSuggestion("cat")');assert.equal(p.els.customNote.value,'手寫備註\n營業時間：10:00–18:00\n電話：<script>bad</script>');assert.equal(p.els.customCat.value,'餐廳');
 p.run('openModal("子層","",null)');p.els.modalClose.onclick();assert.equal(p.els.customZh.dataset.edited,'1');assert.match(p.els.customSuggest.innerHTML,/&lt;img/);
 p.run('closeAllOverlays();openCustomForm()');let pastePrevented=false;p.els.customCoords.onpaste({clipboardData:{getData:()=>"分享店名\n福岡地址\nhttps://maps.app.goo.gl/paste"},preventDefault(){pastePrevented=true;}});assert(pastePrevented);assert.equal(p.els.customCoords.value,'https://maps.app.goo.gl/paste');assert.equal(p.els.customZh.value,'分享店名');p.run('cancelCustomLookup()');
 p.run('closeAllOverlays();openCustomForm();overlayTop().state.suggestions={addr:"地址",hours:"時間",phone:"電話",url:"https://example.test/",cat:"餐廳"};applyCustomSuggestion("all")');assert.equal(p.els.customNote.value,'營業時間：時間\n電話：電話');assert.equal(p.els.customCat.value,'餐廳');assert.equal(p.els.customUrl.value,'https://example.test/');
 p.run('closeAllOverlays();openCustomForm()');p.els.customAddr.oninput();p.run('overlayTop().state.suggestions={addr:"地址"};applyCustomSuggestion("all")');assert.equal(p.els.customAddr.value,'');
 p.owner.online=false;p.els.customCoords.value=link;p.els.customCoords.oninput();assert.match(p.els.customSuggest.innerHTML,/離線/);p.run('closeAllOverlays()');
 // 解析器失敗只試一次；各種失敗都保留明確替代說明。
 const failed=page();await initial(failed);const failedCalls=[];failed.context.fetch=async(url,opts)=>{failedCalls.push({url,opts});return {ok:false,status:404};};failed.run('openCustomForm()');failed.els.customCoords.value='店名\n地址\nhttps://maps.app.goo.gl/first';failed.els.customCoords.oninput();assert.equal(failed.els.customZh.value,'店名');await sleep(850);assert.equal(failedCalls.length,1);assert.match(failed.els.customCoordsPreview.textContent,/短網址目前無法自動解析。請在瀏覽器打開此連結/);
 assert.match(failed.els.customCoordsPreview.textContent,/Plus Code \/ 座標/);assert.equal(new URL(failedCalls[0].url).searchParams.get('url'),'https://maps.app.goo.gl/first');failed.els.customCoords.value='https://goo.gl/maps/second';failed.els.customCoords.oninput();await sleep(850);assert.equal(failedCalls.length,1);failed.run('closeAllOverlays()');
 for(const response of [()=>{throw Error('網路／CORS');},()=>({ok:true,json:async()=>{throw Error('JSON');}}),()=>({ok:true,json:async()=>({ok:true,url:'https://evil.test/maps/@33,130'})}),()=>({ok:true,json:async()=>({ok:false})})]){const v=page();await initial(v);let calls=0;v.context.fetch=async()=>{calls++;return response();};await v.run('resolveMapsLink("https://maps.app.goo.gl/bad",new AbortController().signal)');await v.run('resolveMapsLink("https://maps.app.goo.gl/bad",new AbortController().signal)');assert(v.run('mapsResolverFailed'));assert.equal(calls,1);v.close();}
 const timeout=page();await initial(timeout);const realTimeout=timeout.context.setTimeout;timeout.context.setTimeout=(cb,ms)=>realTimeout(cb,ms===6000?5:ms);timeout.context.fetch=(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('逾時'))));await timeout.run('resolveMapsLink("https://maps.app.goo.gl/timeout",new AbortController().signal)');assert(timeout.run('mapsResolverFailed'));timeout.close();
 // 成功解析後儲存原分享文字所對應的圖釘；Nominatim 最多兩次且間隔至少一秒。
 const good=page();await initial(good);const requests=[],result={...near,category:'amenity',type:'cafe',address:{city:'福岡市',road:'道路'},extratags:{opening_hours:'10:00–18:00','contact:website':'https://example.test/','contact:phone':'電話'}};
 good.context.fetch=async(url,opts)=>{requests.push({url:String(url),opts,at:Date.now()});if(url.includes('/places-lookup.php'))return {ok:false,json:async()=>({ok:false,error:'not_configured'})};if(url.startsWith('https://trip.'))return {ok:true,json:async()=>({ok:true,url:link})};return {ok:true,json:async()=>url.includes('/search?')?[result]:{address:{city:'福岡市',road:'逆查地址'}}};};
 good.run('openCustomForm()');good.els.customCoords.value='https://maps.app.goo.gl/good';good.els.customCoords.oninput();await sleep(2100);assert.equal(requests.length,4);assert.equal(good.els.customZh.value,'Cafe ABC');assert.match(good.els.customCoordsPreview.textContent,/33\.590000, 130\.420000/);assert.equal(good.els.customCoords.validation,'');assert.match(good.els.customSuggest.innerHTML,/福岡市 道路/);assert.match(good.els.customSuggest.innerHTML,/營業時間/);
 const search=new URL(requests[2].url),reverse=new URL(requests[3].url);assert.equal(search.pathname,'/search');for(const [key,value]of Object.entries({q:'Cafe ABC',format:'jsonv2',extratags:'1',addressdetails:'1',limit:'3',bounded:'1','accept-language':'ja,zh-TW'}))assert.equal(search.searchParams.get(key),value);
 search.searchParams.get('viewbox').split(',').map(Number).forEach((value,i)=>assert(Math.abs(value-[130.417,33.593,130.423,33.587][i])<1e-8));assert.equal(reverse.pathname,'/reverse');assert.equal(reverse.searchParams.get('lat'),'33.59');assert.equal(reverse.searchParams.get('lon'),'130.42');assert.equal(reverse.searchParams.get('zoom'),'18');assert.equal(reverse.searchParams.get('accept-language'),'ja,zh-TW');assert(requests[3].at-requests[2].at>=995);for(const r of requests)assert(!r.opts.headers,'不設定瀏覽器禁止的 User-Agent');
 const beforeBlur=requests.length;good.els.customCoords.onblur();await sleep(850);assert.equal(requests.length,beforeBlur);good.run('openModal("暫存","",null)');good.els.modalClose.onclick();assert.equal(good.els.customCoords.validation,'');good.els.customForm.onsubmit({preventDefault(){}});const saved=json(good,'Object.values(CUSTOMS).find(s=>s.zh==="Cafe ABC")');assert.equal(saved.lat,33.59);assert.equal(saved.lng,130.42);
 await good.run('resolveMapsLink("https://maps.app.goo.gl/good",new AbortController().signal)');assert.equal(requests.length,beforeBlur);
 // 無匹配時僅用逆查地址，避免把附近另一家店的營業資料帶入。
 good.context.fetch=async(url)=>({ok:true,json:async()=>url.includes('/search?')?[{...wrong,extratags:{website:'https://wrong.test/'}}]:{address:{city:'福岡市'}}});const noMatch=await good.run('lookupMapsSuggestions({lat:33.59,lng:130.42},"Cafe ABC",new AbortController().signal)');assert.equal(noMatch.addr,'福岡市');assert.equal(noMatch.url,'');
 good.context.fetch=async()=>({ok:true,json:async()=>({error:'查無資料'})});const empty=await good.run('lookupMapsSuggestions({lat:33.59,lng:130.42},"",new AbortController().signal)');assert(Object.values(empty).every(x=>!x));
 // 輸入防抖、進行中取消、切換浮窗取消，過期結果不改寫畫面。
 const aborted=page();await initial(aborted);let activeSignal,calls=0;aborted.context.fetch=(url,{signal})=>{calls++;activeSignal=signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('取消'))));};aborted.run('openCustomForm()');aborted.els.customCoords.value=link;aborted.els.customCoords.oninput();await sleep(400);aborted.els.customCoords.oninput();await sleep(450);assert.equal(calls,0);await sleep(450);assert.equal(calls,1);aborted.els.customCoords.value='33.59,130.42';aborted.els.customCoords.oninput();assert(activeSignal.aborted);await sleep(50);assert.equal(calls,1);assert.match(aborted.els.customSuggest.innerHTML,/用 Google 查詢詳細資訊/);
 aborted.els.customCoords.value=link;aborted.els.customCoords.oninput();aborted.run('openModal("中斷","",null)');await sleep(850);assert.equal(calls,1);aborted.run('closeAllOverlays()');
 // Google Places：連結自動查詢、座標僅手動、結果選擇、額度／錯誤備援與記憶體去重。
 for(const [type,name,expected]of [['restaurant','','餐廳'],['ramen_restaurant','','餐廳'],['cafe','','餐廳'],['coffee_shop','','餐廳'],['food','','餐廳'],['shopping_mall','','購物街/商圈'],['department_store','','購物街/商圈'],['market','','購物街/商圈'],['store','','購物街/商圈'],['toy_store','LEGO Shop','樂高店'],['toy_store','レゴ','樂高店'],['toy_store','樂高','樂高店'],['toy_store','玩具店',''],...['tourist_attraction','amusement_park','zoo','aquarium','park','museum','playground'].map(t=>[t,'','親子景點']),['lodging','',''],['unknown','','']])assert.equal(p.run('planner.googleCategory('+JSON.stringify(type)+','+JSON.stringify(name)+')'),expected);
 const g=page();await initial(g);const gCalls=[],googleResult={id:'ChIJ_123456789',name:'<Cafe & ABC>',address:'<img src=x onerror=bad>',lat:33.59,lng:130.42,distance_m:12,maps_uri:'https://maps.google.com/?q=Cafe',hours:['週一：10–18','週二：休息'],phone:'<script>phone</script>',website:'javascript:alert(1)',rating:4.3,rating_count:1234,type:'cafe'};
 const click=(view,dataset,attribute)=>view.els.customSuggest.onclick({target:{closest:()=>({dataset,hasAttribute:key=>key===attribute})}});
 g.context.fetch=async(url,opts)=>{if(url.includes('nominatim'))return {ok:true,json:async()=>({address:{}})};assert(url.includes('/places-lookup.php'));gCalls.push({url,opts});return {ok:true,json:async()=>({ok:true,remaining:898,results:[googleResult,{...googleResult,name:'另一家店',distance_m:35,website:'https://example.test/'}]})};};
 g.run('openCustomForm()');g.els.customZh.value='手寫名稱';g.els.customZh.oninput();g.els.customCoords.value=link;g.els.customCoords.oninput();await sleep(900);assert.equal(gCalls.length,1);assert.equal(new URL(gCalls[0].url).searchParams.get('name'),'Cafe ABC','查詢優先採用連結名稱');
 let googleHTML=g.els.customSuggest.innerHTML;for(const text of ['來源：Google','Google Maps','Google 地圖頁','本月 Google 查詢剩餘 898 次','★4.3 · 1,234 則','另一家店','12 m','35 m','週一：10–18'])assert(googleHTML.includes(text),text);assert(googleHTML.includes('data-google-choice="1"'));assert(!googleHTML.includes('<img'));assert(!googleHTML.includes('<script>'));assert.match(googleHTML,/&lt;img/);assert(!googleHTML.includes('javascript:'));
 for(const id of ['customAddr','customUrl','customNote','customCat']){g.els[id].value=id==='customCat'?'親子景點':'手寫 '+id;g.els[id].oninput();}
 g.run('applyCustomSuggestion("all");Object.keys(customSuggestionLabels).forEach(k=>applyCustomSuggestion(k))');assert.equal(g.els.customZh.value,'手寫名稱');for(const id of ['customAddr','customUrl','customNote'])assert.equal(g.els[id].value,'手寫 '+id);assert.equal(g.els.customCat.value,'親子景點');
 click(g,{googleChoice:'1'});assert.equal(g.run('overlayTop().state.suggestions.name'),'另一家店');assert.match(g.els.customSuggest.innerHTML,/https:\/\/example.test\//);assert.equal(g.els.customZh.value,'手寫名稱');
 g.els.customCoords.oninput();await sleep(900);assert.equal(gCalls.length,1,'相同名稱與座標每頁僅查一次');
 g.run('closeAllOverlays();openCustomForm()');g.els.customCoords.value=link;g.els.customCoords.oninput();await sleep(900);assert.equal(gCalls.length,1,'跨表單沿用記憶體結果');g.run('applyCustomSuggestion("all")');assert.equal(g.els.customZh.value,'Cafe ABC');assert.equal(g.els.customAddr.value,googleResult.address);assert.equal(g.els.customNote.value,'營業時間：週一：10–18\n週二：休息\n電話：<script>phone</script>');assert.equal(g.els.customUrl.value,googleResult.maps_uri);assert.equal(g.els.customCat.value,'餐廳');
 // 手動清空的欄位仍受保護；名稱建議亦僅填未編輯的空白欄位。
 g.els.customAddr.value='';g.els.customAddr.oninput();g.run('applyCustomSuggestion("addr")');assert.equal(g.els.customAddr.value,'');
 g.run('closeAllOverlays();openCustomForm();overlayTop().state.suggestSource="google";overlayTop().state.suggestions={name:"Google 名稱"};applyCustomSuggestion("name")');assert.equal(g.els.customZh.value,'Google 名稱');
 g.run('closeAllOverlays();openCustomForm()');g.els.customCoords.value='33.59,130.42';g.els.customCoords.oninput();await sleep(850);assert.equal(gCalls.length,1);assert(g.els.customSuggest.hidden);g.els.customZh.value='Typed Cafe';g.els.customZh.oninput();await sleep(850);assert.equal(gCalls.length,1);assert.match(g.els.customSuggest.innerHTML,/用 Google 查詢詳細資訊/);
 click(g,{},'data-google-lookup');await sleep(900);assert.equal(gCalls.length,2);assert.equal(new URL(gCalls[1].url).searchParams.get('name'),'Typed Cafe');click(g,{},'data-google-lookup');await sleep(900);assert.equal(gCalls.length,2);
 g.run('closeAllOverlays();openCustomForm()');g.els.customZh.value='Plus Cafe';g.els.customZh.oninput();g.els.customCoords.value='8Q5GHCR9+2X';g.els.customCoords.oninput();await sleep(850);assert.equal(gCalls.length,2);click(g,{},'data-google-lookup');await sleep(900);assert.equal(gCalls.length,3);
 // 沒有連結名稱時才採用手寫名稱；沒有任何名稱時不呼叫 Places。
 g.run('closeAllOverlays();openCustomForm()');g.els.customZh.value='No Link Name';g.els.customZh.oninput();g.els.customCoords.value='https://maps.google.com/?q=33.59,130.42';g.els.customCoords.oninput();await sleep(900);assert.equal(gCalls.length,4);assert.equal(new URL(gCalls[3].url).searchParams.get('name'),'No Link Name');g.close();
 for(const mode of ['monthly_quota_reached','not_configured','network','empty']){const f=page();await initial(f);const calls=[];f.context.fetch=async(url)=>{calls.push(url);if(url.includes('/places-lookup.php')){if(mode==='network')throw Error('network');return {ok:mode==='empty',json:async()=>mode==='empty'?{ok:true,remaining:899,results:[]}:{ok:false,error:mode,...(mode==='monthly_quota_reached'?{remaining:0}:{})}};}return {ok:true,json:async()=>url.includes('/search?')?[]:{address:{city:'福岡市'}}};};f.run('openCustomForm()');f.els.customCoords.value=link;f.els.customCoords.oninput();await sleep(2000);assert.equal(calls.filter(u=>u.includes('/places-lookup.php')).length,1);assert.equal(calls.filter(u=>u.includes('nominatim')).length,2);assert.match(f.els.customSuggest.innerHTML,/福岡市/);assert.match(f.els.customSuggest.innerHTML,/OpenStreetMap contributors/);if(mode==='monthly_quota_reached'){assert.match(f.els.customSuggest.innerHTML,/本月 Google 免費查詢額度已用完，改用 OpenStreetMap/);assert.match(f.els.customSuggest.innerHTML,/本月 Google 查詢剩餘 0 次/);}else if(mode!=='empty')assert.match(f.els.customSuggest.innerHTML,/Google 查詢暫時無法使用，改用 OpenStreetMap/);f.close();}
 const gt=page();await initial(gt);const gtTimeout=gt.context.setTimeout;gt.context.setTimeout=(cb,ms)=>gtTimeout(cb,ms===9000?5:ms);let gtCalls=0;gt.context.fetch=(url,{signal})=>{gtCalls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout'))));};assert.equal((await gt.run('planner.lookupGooglePlaces({lat:33,lng:130},"Timeout",new AbortController().signal)')).ok,false);await gt.run('planner.lookupGooglePlaces({lat:33,lng:130},"Timeout",new AbortController().signal)');assert.equal(gtCalls,1);gt.close();
 // Google 選中結果的地址先顯示原文，再以日文 OSM 替換；其餘 Google 資料及已套用狀態保留。
 const until=async(check)=>{for(let i=0;i<250;i++){if(check())return;await sleep(10);}throw Error('日文地址查詢未完成');};
 const ja=page();await initial(ja);const jaCalls=[],pendingReverse=[],jaResults=[
  {...googleResult,address:'1-chōme-2-2 Sumiyoshi, Hakata Ward, Fukuoka',lat:33.590123,lng:130.420123},
  {...googleResult,name:'同一位置',address:'Google second address',lat:33.590124,lng:130.420124},
  {...googleResult,name:'別の場所',address:'Google third address',lat:33.591123,lng:130.421123}
 ];
 let activeReverse=0,maxActiveReverse=0;
 ja.context.fetch=async(url,opts)=>{jaCalls.push({url:String(url),opts,at:Date.now()});if(url.includes('/places-lookup.php'))return {ok:true,json:async()=>({ok:true,remaining:897,results:jaResults})};
  activeReverse++;maxActiveReverse=Math.max(maxActiveReverse,activeReverse);
  return new Promise((resolve,reject)=>{const finish=address=>{activeReverse--;resolve({ok:true,json:async()=>({address})});};pendingReverse.push({finish,signal:opts.signal});opts.signal.addEventListener('abort',()=>{activeReverse--;reject(Error('取消'));},{once:true});});
 };
 ja.run('openCustomForm()');ja.els.customCoords.value=link;ja.els.customCoords.oninput();await until(()=>pendingReverse.length===1);
 assert.match(ja.els.customSuggest.innerHTML,/1-chōme-2-2 Sumiyoshi/);assert(!ja.els.customSuggest.innerHTML.includes('地址來源：OpenStreetMap'));
 assert.equal(ja.els.customAddr.value,'');ja.run('applyCustomSuggestion("all")');assert.equal(ja.els.customAddr.value,jaResults[0].address);const appliedNote=ja.els.customNote.value;
 const jaReverse=new URL(jaCalls[1].url);assert.equal(jaReverse.pathname,'/reverse');for(const [key,value]of Object.entries({lat:'33.590123',lon:'130.420123',zoom:'18',addressdetails:'1','accept-language':'ja'}))assert.equal(jaReverse.searchParams.get(key),value);
 assert.equal(jaCalls[1].opts.referrerPolicy,'strict-origin-when-cross-origin');assert(!jaCalls[1].opts.headers);
 pendingReverse[0].finish(jaAddress);await until(()=>ja.els.customAddr.value===jaText);
 assert.match(ja.els.customSuggest.innerHTML,/地址來源：OpenStreetMap/);assert.match(ja.els.customSuggest.innerHTML,/© OpenStreetMap contributors/);assert.match(ja.els.customSuggest.innerHTML,/〒810-0801 福岡市博多区中洲5-2/);
 assert.equal(ja.els.customNote.value,appliedNote);assert.equal(ja.els.customCat.value,'餐廳');assert.equal(ja.els.customAddr.dataset.edited,'1');ja.run('applyCustomSuggestion("all")');assert.equal(ja.els.customNote.value,appliedNote);
 click(ja,{googleChoice:'1'});await sleep(20);assert.equal(pendingReverse.length,1,'四捨五入至五位小數的座標共用日文地址');assert.equal(ja.run('overlayTop().state.suggestions.addr'),jaText);
 click(ja,{googleChoice:'2'});await until(()=>pendingReverse.length===2);assert.match(ja.els.customSuggest.innerHTML,/Google third address/);
 ja.els.customAddr.value='我編輯的地址';ja.els.customAddr.oninput();const unsafeAddress={city:'福岡市',quarter:'<img src=x onerror=bad>',house_number:'２'};
 pendingReverse[1].finish(unsafeAddress);await until(()=>ja.run('overlayTop().state.suggestions.osmAddress')===true);
 assert.equal(ja.els.customAddr.value,'我編輯的地址');assert.match(ja.els.customSuggest.innerHTML,/&lt;img src=x onerror=bad&gt;2/);assert(!ja.els.customSuggest.innerHTML.includes('<img'));
 click(ja,{googleChoice:'0'});await sleep(20);assert.equal(ja.run('overlayTop().state.suggestions.addr'),jaText);assert.equal(ja.els.customAddr.value,'我編輯的地址');assert.equal(pendingReverse.length,2);assert.equal(maxActiveReverse,1);assert(jaCalls[2].at-jaCalls[1].at>=995);
 ja.run('closeAllOverlays();openCustomForm()');ja.els.customCoords.value=link;ja.els.customCoords.oninput();await until(()=>ja.run('overlayTop().state.suggestions.osmAddress')===true);
 ja.run('applyCustomSuggestion("all")');assert.equal(ja.els.customAddr.value,jaText,'全部套用使用最佳可用地址');assert.equal(jaCalls.filter(r=>r.url.includes('/places-lookup.php')).length,1,'OSM 與選擇結果不增加 Google 呼叫');assert.equal(jaCalls.filter(r=>r.url.includes('nominatim')).length,2,'跨表單及重選不再逆查');ja.close();
 // 錯誤、空結果、逾時都保留 Google 地址；取消、切換結果及手動編輯不讓過期結果覆寫。
 for(const mode of ['failure','empty','timeout','abort','paste','close','edited','edited-back','changed-without-event','choice']){
  const view=page();await initial(view);let calls=0,finish,requestSignal;const originalTimeout=view.context.setTimeout;
  if(mode==='timeout')view.context.setTimeout=(cb,ms)=>originalTimeout(cb,ms===6000?5:ms);
  view.context.fetch=async(url,opts)=>{calls++;assert.equal(new URL(url).pathname,'/reverse');requestSignal=opts.signal;
   if(mode==='failure')throw Error('OSM unavailable');if(mode==='empty')return {ok:true,json:async()=>({address:{}})};
   return new Promise((resolve,reject)=>{finish=()=>resolve({ok:true,json:async()=>({address:jaAddress})});opts.signal.addEventListener('abort',()=>reject(Error('取消')),{once:true});});
  };
  view.context.jaResults=jaResults;view.run('openCustomForm();Object.assign(overlayTop().state,{suggestSource:"google",googleResults:jaResults});showGoogleSuggestion(0);applyCustomSuggestion("addr")');
  assert.equal(view.els.customAddr.value,jaResults[0].address);await until(()=>calls===1);
  if(mode==='edited'||mode==='edited-back'){view.els.customAddr.value='手寫地址';view.els.customAddr.oninput();if(mode==='edited-back')view.els.customAddr.value=jaResults[0].address;}
  if(mode==='changed-without-event')view.els.customAddr.value='另一個地址';
  if(mode==='choice')click(view,{googleChoice:'1'});
  if(mode==='abort')view.run('cancelCustomLookup()');
  if(mode==='paste')view.els.customCoords.onpaste({clipboardData:{getData:()=>link},preventDefault(){}});
  if(mode==='close')view.run('closeAllOverlays()');
  if(['abort','paste','close'].includes(mode))assert(requestSignal.aborted,mode);
  if(['edited','edited-back','changed-without-event','choice'].includes(mode))finish();
  await view.run('googleOsmAddressMemo.values().next().value');await sleep(20);
  assert.equal(view.els.customAddr.value,mode==='edited'?'手寫地址':mode==='changed-without-event'?'另一個地址':jaResults[0].address,mode);
  if(['failure','empty','timeout','abort'].includes(mode)){assert.match(view.els.customSuggest.innerHTML,/1-chōme-2-2 Sumiyoshi/);assert(!view.els.customSuggest.innerHTML.includes('地址來源：OpenStreetMap'));view.run('showGoogleSuggestion(0)');await sleep(20);assert.equal(calls,1,'失敗／取消的結果亦不重試');}
  if(mode==='choice'){assert.equal(view.run('overlayTop().state.suggestions.name'),'同一位置');assert.equal(view.run('overlayTop().state.suggestions.addr'),jaText);assert.equal(calls,1,'選擇同座標時共用進行中的逆查');}
  view.close();
 }
 // 不同座標的結果也走同一佇列；新選擇不會被舊結果改回。
 const queued=page();await initial(queued);let queuedFinish;const queuedCalls=[];
 queued.context.fetch=async(url,opts)=>{queuedCalls.push({url,at:Date.now()});if(queuedCalls.length===1)return new Promise(resolve=>{queuedFinish=()=>resolve({ok:true,json:async()=>({address:jaAddress})});});return {ok:true,json:async()=>({address:{city:'福岡市',quarter:'祇園町'}})};};
 queued.context.jaResults=jaResults;queued.run('openCustomForm();Object.assign(overlayTop().state,{suggestSource:"google",googleResults:jaResults});showGoogleSuggestion(0)');await until(()=>queuedCalls.length===1);click(queued,{googleChoice:'2'});await sleep(40);assert.equal(queuedCalls.length,1);queuedFinish();await until(()=>queued.run('overlayTop().state.suggestions.osmAddress')===true);assert.equal(queued.run('overlayTop().state.suggestions.name'),'別の場所');assert.equal(queued.run('overlayTop().state.suggestions.addr'),'福岡市祇園町');assert.equal(queuedCalls.length,2);assert(queuedCalls[1].at-queuedCalls[0].at>=995);queued.close();
 assert(!/<meta\b[^>]*name=["']referrer["'][^>]*content=["'](?:no-referrer|same-origin)["']/i.test(html));
 console.log('PASS 日文 OSM 地址：丁目／全形數字／市區及町村、Google 即時替換與全部套用、原值追蹤及編輯保護、跳脫、單次逆查／日文參數／Referer／序列節流、失敗／逾時／取消備援');
 console.log('PASS Google Places：查詢門檻／手動按鈕／防重複／逾時、名稱優先、保護手寫及清空欄位、結果選擇、類型、跳脫、額度提示與 OSM 備援');
 // 一開表單便顯示住宿及所有有座標的已排行程；編號使用原日內順序。
 const L=leaflet(),mapped=page({L});await initial(mapped);mapped.run('setCustoms(Object.fromEntries(Object.entries({u_map_a:{zh:"近<景點>",cat:"親子景點",lat:33.5905,lng:130.418},u_map_empty:{zh:"無座標",cat:"親子景點"},u_map_b:{zh:"中景點",cat:"餐廳",lat:33.601,lng:130.418},u_map_c:{zh:"第三",cat:"餐廳",lat:33.61,lng:130.418},u_map_far:{zh:"遠景點",cat:"餐廳",lat:33.9,lng:130.418}}).map(([id,c])=>[id,{...c,by:ME.nick,byId:ME.id,at:1}])));S.days[0].items=["u_map_a","u_map_empty","u_map_b"];S.days[1].items=["u_map_c","u_map_far"];S.days.slice(2).forEach(d=>d.items=[]);S.days[0].label="日<一>";openCustomForm()');
 const mini=L.maps.at(-1),group=L.groups.at(-1);assert.equal(mini.data.host,mapped.els.customPlanMap);assert(!mapped.els.customPlanMap.hidden);assert.equal(mini.bounds.points.length,4);assert.equal(group.children.length,5);assert(group.children.some(p=>p.data.options.icon.html.includes('🏨')));assert(group.children.some(p=>p.data.options.icon.html.includes('>3<')&&p.data.options.icon.html.includes(mapped.run('COLORS[0]'))));assert(group.children.some(p=>p.data.options.icon.html.includes(mapped.run('COLORS[1]'))));assert.match(mapped.els.customPlanLegend.innerHTML,/日&lt;一&gt;/);assert.match(mapped.els.customPlanLegend.innerHTML,/第 2 天/);assert(mini.data.options.dragging!==false);assert(mini.data.options.touchZoom!==false);
 mapped.els.customCoords.value='33.59,130.418';mapped.els.customCoords.oninput();assert.equal(group.children.length,5);await sleep(80);assert.equal(group.children.length,6);assert(group.children.some(p=>p.data.options.icon.html.includes('★')));assert.equal(mini.bounds.points.length,4);assert.match(mapped.els.customNearest.innerHTML,/近&lt;景點&gt; · 56 m/);assert.match(mapped.els.customNearest.innerHTML,/第 1 天 · 中景點 · 1\.2 km/);assert.match(mapped.els.customNearest.innerHTML,/第 2 天 · 第三/);assert(!mapped.els.customNearest.innerHTML.includes('遠景點'));
 await sleep(340);assert.equal(mini.invalidations,1);mapped.run('setSheetExpanded(overlayTop(),true)');await sleep(340);assert.equal(mini.invalidations,2);
 mapped.run('openModal("子層","",null)');assert(mini.removed);mapped.els.modalClose.onclick();const restored=L.maps.at(-1);assert.notEqual(restored,mini);assert.equal(mapped.els.customCoords.value,'33.59,130.418');mapped.els.customClose.onclick();assert(restored.removed);await sleep(340);assert.equal(restored.invalidations,undefined);
 mapped.run('S.days.forEach(d=>d.items=[]);openCustomForm()');assert.deepEqual(Array.from(L.maps.at(-1).view.point),json(mapped,'[HOTEL.lat,HOTEL.lng]'));mapped.run('closeAllOverlays()');
 const form=html.slice(html.indexOf('<form class="box" id="customForm"'),html.indexOf('</form>',html.indexOf('id="customForm"')));assert(form.indexOf('id="customPlanMap"')<form.indexOf('label for="customZh"'));assert(!form.includes('customCoordsMap'));assert.match(html,/#customPlanMap\{[^}]*touch-action:none/);assert.match(html,/closest\("#nearbyMap,\.leaflet-container,input/);
 const sw=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'),scope={};vm.runInNewContext(sw.slice(0,sw.indexOf('function cacheable')),Object.assign(scope,{self:{registration:{scope:'https://example.test/'}},URL}));for(const url of ['https://trip.yi-jia-zi.com/resolve-maps-link.php','https://trip.yi-jia-zi.com/places-lookup.php?name=Cafe&lat=33&lng=130','https://nominatim.openstreetmap.org/search?q=test'])assert(scope.excluded({method:'GET'},new URL(url)));assert(!scope.excluded({method:'GET'},new URL('https://a.tile.openstreetmap.org/1/1/1.png')));assert.match(sw,/kfp-v5-20261101/);
 console.log('PASS 地圖自動填入：網址向量、名稱及距離匹配、類型建議、不覆寫、跳脫、解析器成功／失敗記憶／逾時、OSM 請求節流／防抖／取消、日別圖釘／最近三處／草稿與清理、SW 排除');
};
