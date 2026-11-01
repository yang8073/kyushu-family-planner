// Called by test-planner.cjs; local DOM/Leaflet doubles, no network or dependencies.
const assert=require('assert/strict');
module.exports=async function({html,page,initial,sleep,leaflet}){
 const json=(p,code)=>JSON.parse(p.run('JSON.stringify('+code+')'));
 const rows=p=>[...p.els.nearbyRows.innerHTML.matchAll(/data-near-detail="([^"]+)"/g)].map(m=>m[1]);
 const type=(p,value,event={})=>{p.els.nearbySearch.value=value;p.els.nearbySearch.oninput(event);};
 const pins=L=>L.groups.at(-1).children.filter(c=>c.kind==='pin');
 const L=leaflet(),p=page({L});await initial(p);
 const match=p.context.planner.nearbyMatches,norm=p.context.planner.normalizeNearbySearch;
 assert.equal(norm('　ＬＥＧＯ　 ｌｅｇｏ\tLeGo  '),'lego lego lego');
 assert.equal(norm('ﾗｰﾒﾝ ラーメン らーめん'),'らーめん らーめん らーめん');
 for(const query of ['ＬＥＧＯ','ｌｅｇｏ','LeGo','樂高'])assert(match({zh:'積木專門店',cat:'樂高店'},query));
 for(const [cat,aliases]of [['親子景點',['景點','親子']],['購物街/商圈',['購物','商圈','百貨']],['安全帽店',['安全帽']],['PS5遊戲片店',['PS5','遊戲']],['餐廳',['餐廳','吃','美食']],['住宿',['住宿','飯店','HOTEL']]]){
  for(const query of aliases)assert(match({cat,zh:'無關名稱'},query),cat+' / '+query);
 }
 for(const [subtype,aliases]of [['燒肉',['燒肉','焼肉','YAKINIKU']],['拉麵',['拉麵','ラーメン','ﾗｰﾒﾝ','らーめん','RAMEN']]]){
  for(const query of aliases){assert(match({cat:'餐廳',zh:'無關名稱',tags:[subtype]},query));assert(!match({cat:'餐廳',zh:'無關名稱',tags:['其他']},query));}
 }
 assert(match({cat:'樂高店',area:'福岡',zh:'積木專門店'},'ＬＥＧＯ　福岡'));assert(!match({cat:'樂高店',area:'別府'},'lego 福岡'));
 for(const [key,value]of Object.entries({zh:'關鍵甲',ja:'関鍵乙',name:'Hotel Gamma',altNames:['Delta', 'Epsilon'],aliases:{en:'Zeta'},tags:['Eta'],area:'Theta',addr:'Iota',address:'Kappa',station:'Lambda',note:'Mu',subType:'Nu'})){
  const query=typeof value==='string'?value:Array.isArray(value)?value.at(-1):value.en;
  assert(match({[key]:value},query),'search field '+key);
 }
 assert(match({zh:'普通景點'},'細節備註',{addr:'細節地址',station:'細節車站',note:'細節備註'}));
 assert(match({zh:'LEGO   shop'},'lego shop'));assert(!match({zh:'LEGO shop'},'lego missing'));
 assert(match({zh:'燒肉招牌',cat:'購物街/商圈'},'燒肉'));assert(!match(null,'有字'));assert(match({},'　'));
 assert.match(html,/<input\b[^>]*id="nearbySearch"[^>]*type="search"[^>]*aria-label="[^"]+"/);
 assert.match(html,/<button\b[^>]*id="nearbySearchClear"[^>]*aria-label="[^"]+">✕<\/button>/);

 p.run('openNearby("hotel")');
 const all=json(p,'nearbySpots("hotel")'),by=json(p,'BY');
 const subtypeIDs=all.filter(s=>by[s.id].cat==='餐廳'&&by[s.id].tags[0]==='燒肉').map(s=>s.id);
 assert(subtypeIDs.length>0);
 // Expected matches come from the data fields, independently of the new matcher.
 const expected=all.filter(s=>{const a=by[s.id],d=json(p,'DETAIL['+JSON.stringify(s.id)+']||{}');return a.tags[0]==='燒肉'||[a.zh,a.ja,a.name,a.cat,...a.tags,a.area,a.addr,a.station,a.note,d.addr,d.station,d.note].join(' ').includes('燒肉');});
 type(p,'燒肉');assert.deepEqual(rows(p),expected.map(s=>s.id));assert(subtypeIDs.every(id=>rows(p).includes(id)));
 assert(expected.every((s,i)=>!i||s.meters>=expected[i-1].meters));
 assert.equal(p.els.nearbyCount.textContent,`符合 ${expected.length} / 共 ${all.length} 處`);
 assert.deepEqual(pins(L).map(pin=>pin._nearbyId),['hotel',...rows(p)]);
 for(const [i,pin]of pins(L).slice(1).entries()){
  assert(pin.popup.startsWith('<b>'+(i+1)+'. '));assert(p.els.nearbyRows.innerHTML.includes('<strong>'+(i+1)+'. '));
  assert.match(pin.data.options.icon.html,new RegExp('>'+String(i+1)+'<'));
 }
 for(const band of json(p,'NEARBY_BANDS'))assert.equal(p.els.nearbyRows.innerHTML.includes('<h3>'+band.label+'・'),expected.some(s=>s.band===band.label));
 type(p,'燒肉 多牛');assert.deepEqual(rows(p),['food_tagyu']);assert.equal(pins(L).length,2);
 type(p,'不存在的搜尋結果xyz');assert.match(p.els.nearbyRows.innerHTML,/找不到符合的地點/);assert.equal(rows(p).length,0);assert.equal(p.els.nearbyCount.textContent,`符合 0 / 共 ${all.length} 處`);
 assert.deepEqual(pins(L).map(pin=>pin._nearbyId),['hotel']);assert.equal(pins(L)[0].data.options.icon.html,'★');
 p.els.nearbySearchClear.onclick();assert.equal(p.els.nearbySearch.value,'');assert.equal(rows(p).length,all.length);assert.equal(p.context.document.activeElement,p.els.nearbySearch);

 // The committed query, results and markers stay stable during composition, even on sync renders.
 const input=p.els.nearbySearch;input.oncompositionstart();type(p,'燒',{isComposing:true});p.run('renderAll()');
 assert.equal(rows(p).length,all.length);assert.equal(pins(L).length,all.length+1);assert.equal(input.value,'燒');
 type(p,'燒肉');assert.equal(rows(p).length,all.length);input.oncompositionend();assert.deepEqual(rows(p),expected.map(s=>s.id));
 type(p,'無關',{isComposing:true});assert.deepEqual(rows(p),expected.map(s=>s.id));type(p,'燒肉');
 // Detect any value assignment: in browsers that would reset the caret/IME session.
 let value=input.value,writes=0;Object.defineProperty(input,'value',{configurable:true,get:()=>value,set:v=>{writes++;value=v;}});
 input.focus();input.selectionStart=1;input.selectionEnd=1;p.els.nearbyBody.scrollTop=381;
 const snapshot=p.run('JSON.stringify(snapshot())'),rev=p.run('sync.rev');p.run('renderAll()');
 assert.equal(writes,0);assert.equal(p.els.nearbySearch,input);assert.equal(p.context.document.activeElement,input);assert.equal(input.selectionStart,1);assert.equal(input.selectionEnd,1);assert.equal(p.els.nearbyBody.scrollTop,381);
 assert.deepEqual(rows(p),expected.map(s=>s.id));assert.equal(p.run('JSON.stringify(snapshot())'),snapshot);assert.equal(p.run('sync.rev'),rev);

 // Detail push/pop and a second nearby layer each keep their own query and scroll.
 const filteredHTML=p.els.nearbyRows.innerHTML;p.run('openDetail("food_daitoen")');p.els.detailBack.onclick();
 assert.equal(input.value,'燒肉');assert.equal(p.els.nearbyRows.innerHTML,filteredHTML);assert.equal(p.els.nearbyBody.scrollTop,381);assert.deepEqual(pins(L).map(pin=>pin._nearbyId),['hotel',...expected.map(s=>s.id)]);
 await sleep(15);p.run('openDetail("canal");openNearby("canal")');assert.equal(input.value,'');assert.equal(rows(p).length,p.run('nearbySpots("canal").length'));
 const canalSpots=json(p,'nearbySpots("canal")');
 for(const [query,cat]of [['樂高','樂高店'],['購物','購物街/商圈'],['住宿','住宿']]){
  type(p,query);const ids=canalSpots.filter(s=>by[s.id].cat===cat).map(s=>s.id);assert(ids.length>0);assert(ids.every(id=>rows(p).includes(id)),query);assert.deepEqual(pins(L).map(pin=>pin._nearbyId),['canal',...rows(p)]);
 }
 assert(rows(p).includes('hotel'));type(p,'購物');p.els.nearbyBody.scrollTop=275;p.run('openNearby("canal")');assert.equal(input.value,'');p.els.nearbyClose.onclick();assert.equal(input.value,'購物');assert.equal(p.els.nearbyBody.scrollTop,275);
 p.els.nearbyBack.onclick();p.els.detailClose.onclick();assert.equal(input.value,'燒肉');assert.equal(p.els.nearbyBody.scrollTop,381);await sleep(15);
 p.context.history.back();await sleep(15);assert.equal(p.run('overlayStack.length'),0);p.run('openNearby("hotel")');assert.equal(input.value,'');

 // Remote/custom refreshes use the current query without replacing the focused input.
 type(p,'燒肉');input.focus();const custom={zh:'燒肉 <自訂> ＬＥＧＯ',cat:'餐廳',area:'搜尋測試區',addr:'測試地址',note:'獨特備註',lat:33.5918,lng:130.4183,by:'測試',byId:'searchtest',at:1};
 writes=0;p.run('planner.setCustoms({u_search:'+JSON.stringify(custom)+'})');assert.equal(writes,0);assert.equal(input.value,'燒肉');assert.equal(p.context.document.activeElement,input);assert(rows(p).includes('u_search'));assert.match(p.els.nearbyRows.innerHTML,/燒肉 &lt;自訂&gt;/);
 type(p,'ｌｅｇｏ 獨特備註');assert.deepEqual(rows(p),['u_search']);type(p,'搜尋測試區 測試地址');assert.deepEqual(rows(p),['u_search']);
 // Showing the big map uses the same search result.
 type(p,'燒肉 多牛');p.els.nearbyBigMap.onclick();assert.equal(p.run('overlayStack.length'),0);assert.deepEqual(pins(L).map(pin=>pin._nearbyId),['food_tagyu']);

 // Search stays fully usable with no Leaflet loaded.
 const plain=page();await initial(plain);plain.run('openNearby("canal")');assert.match(plain.els.nearbyMap.innerHTML,/地圖載入失敗/);assert(plain.els.nearbyBigMap.disabled);
 type(plain,'住宿');assert(rows(plain).includes('hotel'));type(plain,'不存在xyz');assert.match(plain.els.nearbyRows.innerHTML,/找不到符合的地點/);plain.els.nearbySearchClear.onclick();assert.equal(rows(plain).length,plain.run('nearbySpots("canal").length'));
 plain.run('closeAllOverlays()');p.run('closeAllOverlays()');
 console.log('PASS nearby search: NFKC/case/kana, category/sub-type aliases, AND/text/custom matches, distance/bands/count/empty/clear, filtered pins + source, IME/caret/render refresh, stack query/scroll/reset, big-map and no Leaflet');
};
