// Run by test-planner.cjs. All sync calls use the in-memory REST/RTDB adapters.
const assert=require('assert/strict');
module.exports=async function({html,page,initial,sleep,leaflet,Database,JsonfileDatabase}){
 const json=(p,code)=>JSON.parse(p.run('JSON.stringify('+code+')'));
 const bars=['listTagFilters','wishTagFilters','poolTagFilters','mapTagFilters','nearbyTagFilters'];
 const session=new Map(),L=leaflet(),p=page({L,session});await initial(p);
 const norm=raw=>json(p,'normalizeCustomTags('+JSON.stringify(raw)+')');
 assert.deepEqual(norm(['　＃ＲＡＭＥＮ　','ramen','## 燒肉','燒肉','  戶外　 親子  ','a\t b\n c','\u0000x\u007f\u0085\u202e','＃ # 拉麵',null,4,{}]),['RAMEN','燒肉','戶外 親子','a b c','x','拉麵']);
 assert.deepEqual(norm('燒肉'),[]);assert.deepEqual(norm(null),[]);assert.deepEqual(norm([{},[],true,0,' # ','\u0000']),[]);
 assert.deepEqual(norm(Array.from({length:20},(_,i)=>'t'+i)),Array.from({length:8},(_,i)=>'t'+i));
 assert.deepEqual(norm(['😀'.repeat(14),'Ａ'.repeat(13),'a'.repeat(15)]),['😀'.repeat(12),'A'.repeat(12)]);
 const old={zh:'普通店甲',cat:'餐廳',by:'甲',byId:'tagtest',at:1,lat:33.5918,lng:130.4183};
 p.context.oldSpot=old;p.context.unsafeTag='<img x="z">';
 assert.deepEqual(json(p,'sanitizeCustoms({u_old:oldSpot}).u_old.tags'),[]);
 assert.deepEqual(json(p,'sanitizeCustoms({u_old:{...oldSpot,tags:"燒肉"}}).u_old.tags'),[]);
 assert.deepEqual(json(p,'sanitizeCustoms({u_old:{...oldSpot,tags:[null,"＃拉麵","拉麵",{},"<b>"]}}).u_old.tags'),['拉麵','<b>']);
 assert.deepEqual(json(p,'sanitizeCustoms({u_bad:{tags:["燒肉"]},canal:{...oldSpot,tags:["燒肉"]}})'),{});
 for(const id of bars)assert(p.els[id].hidden);
 p.run('setCustoms({u_a:{...oldSpot,tags:["燒肉","ＬＥＧＯ"]},u_b:{...oldSpot,zh:"普通店乙",tags:["拉麵","燒肉"],lng:130.419},u_c:{...oldSpot,zh:"普通店丙",tags:["拉麵",unsafeTag]},u_empty:oldSpot});S.pool=["canal","u_a","u_b","u_c","u_empty"];S.days.forEach(d=>d.items=[]);WISH={u_a:{[ME.id]:{pool:"want",nick:ME.nick,at:1}},u_b:{[ME.id]:{pool:"want",nick:ME.nick,at:1}},canal:{[ME.id]:{pool:"want",nick:ME.nick,at:1}}};renderAll()');
 assert.deepEqual(json(p,'customTagCounts().slice(0,2).map(t=>t.count)'),[2,2]);
 const suggestions=json(p,'customTagSuggestions()');assert(suggestions.indexOf('燒肉')<suggestions.indexOf('安全帽店'));for(const t of ['燒肉','拉麵','樂高店','安全帽店','PS5遊戲片店'])assert(suggestions.includes(t),t);
 for(const id of bars){assert(!p.els[id].hidden);assert.match(p.els[id].innerHTML,/燒肉 \(2\)/);assert.match(p.els[id].innerHTML,/&lt;img x=&quot;z&quot;&gt;/);assert(!p.els[id].innerHTML.includes('<img'));}
 assert.match(p.els.cards.innerHTML,/&lt;img x=&quot;z&quot;&gt;/);assert.match(p.els.wishSections.innerHTML,/<span class="tag">燒肉/);
 p.run('openDetail("u_c")');assert.match(p.els.detailBody.innerHTML,/<dt>標籤<\/dt>/);assert.match(p.els.detailBody.innerHTML,/&lt;img x=&quot;z&quot;&gt;/);p.run('closeAllOverlays()');
 const snapshot=p.run('JSON.stringify(snapshot())'),rev=p.run('sync.rev');
 p.run('document.getElementById("showAll").checked=true;setCustomTagFilter("燒肉")');
 assert.deepEqual(json(p,'ATTR.filter(matchesCustomTagFilter).map(a=>a.id)'),['u_a','u_b']);
 assert.match(p.els.cards.innerHTML,/普通店甲/);assert(!p.els.cards.innerHTML.includes('普通店丙'));assert(!p.els.cards.innerHTML.includes('data-detail="canal"'));
 assert(!p.els.days.innerHTML.includes('data-id="canal"'));assert(!p.els.wishSections.innerHTML.includes('data-detail="canal"'));
 assert.deepEqual(json(p,'Object.keys(markers).sort()'),['hotel','u_a','u_b']);
 p.run('setCustomTagFilter("拉麵")');assert.deepEqual(json(p,'ATTR.filter(matchesCustomTagFilter).map(a=>a.id)'),['u_a','u_b','u_c']);
 assert.deepEqual(json(p,'Object.keys(markers).sort()'),['hotel','u_a','u_b','u_c']);
 // Actual bar actions, OR toggling and 全部; all five bars share one session selection.
 const filterClick=(id,tag)=>p.els[id].onclick({target:{closest:()=>({dataset:{customTag:tag}})}});
 filterClick('wishTagFilters','燒肉');assert.deepEqual(json(p,'ATTR.filter(matchesCustomTagFilter).map(a=>a.id)'),['u_b','u_c']);
 assert.match(p.els.listTagFilters.innerHTML,/清除篩選/);assert.equal(session.get('kyushuPlanner.customTagFilter'),'["拉麵"]');
 const reload=page({storage:new Map(p.storage),session});await initial(reload);assert.equal(reload.run('customTagFilter.has("拉麵")'),true);reload.close();
 const fresh=page({storage:new Map(p.storage)});await initial(fresh);assert.equal(fresh.run('customTagFilter.size'),0);fresh.close();
 p.els.clearF.onclick();assert.equal(p.run('customTagFilter.size'),0);filterClick('poolTagFilters','');assert.equal(p.run('customTagFilter.size'),0);assert(p.els.cards.innerHTML.includes('data-detail="canal"'));
 assert.equal(p.run('JSON.stringify(snapshot())'),snapshot);assert.equal(p.run('sync.rev'),rev);assert.equal(p.run('sync.stage'),null);
 // Hidden pool candidates survive sorting; moving visible candidates to a day doesn't duplicate them.
 p.run('setCustomTagFilter("燒肉")');assert.deepEqual(json(p,'mergeFilteredPool(S.pool,["u_b","u_a"])'),['canal','u_b','u_a','u_c','u_empty']);
 assert.deepEqual(json(p,'mergeFilteredPool(S.pool,["u_b"])'),['canal','u_b','u_c','u_empty']);
 const originalQuery=p.context.document.querySelectorAll;
 p.context.document.querySelectorAll=q=>q==='#days ul'?[{dataset:{idx:'-1'},querySelectorAll:()=>[{dataset:{id:'u_b'}}]},{dataset:{idx:'0'},querySelectorAll:()=>[{dataset:{id:'u_a'}}]}]:originalQuery(q);
 p.run('dragging=true;syncFromDom()');await p.run('flushPending()');
 assert.deepEqual(json(p,'S.pool'),['canal','u_b','u_c','u_empty']);assert.deepEqual(json(p,'S.days[0].items'),['u_a']);p.context.document.querySelectorAll=originalQuery;
 p.run('renderMap()');assert.deepEqual(json(p,'Object.keys(markers).sort()'),['hotel','u_a','u_b']);
 p.run('setCustomTagFilter("");openNearby("hotel")');
 assert(p.run('filteredNearbySpots("hotel","燒肉").some(s=>s.id==="u_a")'));
 assert(p.run('nearbyMatches(BY.u_a,"ｌｅｇｏ")'));assert(p.run('nearbyMatches(BY.u_b,"RAMEN")'));
 p.els.nearbySearch.value='燒肉';p.els.nearbySearch.oninput({});assert.match(p.els.nearbyRows.innerHTML,/普通店甲/);
 filterClick('nearbyTagFilters','拉麵');assert(!p.els.nearbyRows.innerHTML.includes('普通店甲'));assert(p.els.nearbyRows.innerHTML.includes('普通店乙'));
 assert.deepEqual(L.groups.at(-1).children.filter(c=>c.kind==='pin').map(pin=>pin._nearbyId),['hotel','u_b']);
 p.run('setCustomTagFilter("");closeAllOverlays();openCustomForm("u_a")');
 assert.deepEqual(json(p,'overlayTop().state.tags'),['燒肉','LEGO']);
 const input=p.els.customTagInput,type=(text,event={})=>{input.value=text;input.oninput(event);};
 const key=(key,event={})=>{let prevented=false;input.onkeydown({key,preventDefault(){prevented=true;},...event});return prevented;};
 type('  #拉麵');assert(key('Enter'));assert.deepEqual(json(p,'overlayTop().state.tags'),['燒肉','LEGO','拉麵']);assert.equal(input.value,'');
 for(const separator of [',','，','、']){type('　ＲＡＭＥＮ');assert(key(separator));assert.equal(input.value,'');}
 assert.deepEqual(json(p,'overlayTop().state.tags'),['燒肉','LEGO','拉麵','RAMEN']);
 input.oncompositionstart();type('中文、日文、',{isComposing:true});assert(!key('Enter',{isComposing:true}));assert(!key('Enter',{keyCode:229}));
 input.onbeforeinput({inputType:'insertLineBreak',isComposing:true,preventDefault(){throw Error('mid-IME commit');}});assert.equal(p.run('overlayTop().state.tags.length'),4);
 // Some Android IMEs report isComposing=false on the last input before compositionend.
 input.oninput({isComposing:false});assert.equal(p.run('overlayTop().state.tags.length'),4);input.oncompositionend();assert.deepEqual(json(p,'overlayTop().state.tags.slice(-2)'),['中文','日文']);
 type('待確認');let prevented=false;input.onbeforeinput({inputType:'insertParagraph',preventDefault(){prevented=true;}});assert(prevented);assert.equal(input.value,'');assert.equal(key('Backspace'),false);
 assert(!json(p,'overlayTop().state.tags').includes('待確認'));
 type('第七，最後、超過,');assert.equal(p.run('overlayTop().state.tags.length'),8);
 const formClick=(data,selector)=>p.els.customForm.dispatchEvent({type:'click',target:{closest:q=>q===selector?{dataset:data}:null}});
 formClick({tagRemove:'7'},'[data-tag-remove]');assert.equal(p.run('overlayTop().state.tags.length'),7);
 formClick({tagAdd:'<b>'},'[data-tag-add]');assert.match(p.els.customTagChips.innerHTML,/&lt;b&gt;/);assert(!p.els.customTagChips.innerHTML.includes('<b>'));
 input.value='未完成';input.oncompositionstart();p.run('openModal("子層","",null)');p.els.modalClose.onclick();assert.equal(input.value,'未完成');assert.equal(p.run('overlayTop().state.tagComposing'),false);assert.equal(p.run('overlayTop().state.tags.length'),8);await sleep(15);
 // Form edit and save includes explicit removal and pending uncommitted input.
 p.run('overlayTop().state.tags=["燒肉"];renderCustomTags()');type(' #新標籤 ');p.els.customForm.onsubmit({preventDefault(){}});await p.run('flushPending()');assert.deepEqual(json(p,'CUSTOMS.u_a.tags'),['燒肉','新標籤']);
 p.run('openCustomForm("u_a");overlayTop().state.tags=[];renderCustomTags()');p.els.customForm.onsubmit({preventDefault(){}});await p.run('flushPending()');assert.deepEqual(json(p,'CUSTOMS.u_a.tags'),[]);
 p.run('openCustomForm()');p.els.customZh.value='新店';p.els.customCat.value='餐廳';type('＃Ａ、a，燒肉、拉麵,');p.els.customForm.onsubmit({preventDefault(){}});await p.run('flushPending()');
 const added=p.run('Object.keys(CUSTOMS).find(id=>CUSTOMS[id].zh==="新店")');assert.deepEqual(json(p,`CUSTOMS[${JSON.stringify(added)}].tags`),['A','燒肉','拉麵']);
 // Applying one or all suggestion fields never adds a tag, for both providers.
 for(const source of ['google','osm']){
  p.run('openCustomForm();Object.assign(overlayTop().state,{suggestSource:'+JSON.stringify(source)+',suggestions:normalizeGoogleResult({name:"建議店",type:"ramen_restaurant",primaryTypeDisplayName:{text:"拉麵"}})});renderCustomSuggestions();applyCustomSuggestion("cat");applyCustomSuggestion("all")');
  assert.deepEqual(json(p,'overlayTop().state.tags'),[]);assert.match(p.els.customSuggest.innerHTML,/data-tag-add="拉麵"/);
  formClick({tagAdd:'拉麵'},'[data-tag-add]');assert.deepEqual(json(p,'overlayTop().state.tags'),['拉麵']);
  p.run('overlayTop().state.suggestions.suggestedTag=\'<i x="1">\';renderCustomSuggestions()');assert.match(p.els.customSuggest.innerHTML,/&lt;i x=&quot;1&quot;&gt;/);assert(!p.els.customSuggest.innerHTML.includes('<i '));p.run('closeAllOverlays()');
 }
 // Real OSM suggestion normalizer, with stubbed upstream results.
 p.context.osmMatch={lat:String(old.lat),lon:String(old.lng),name:'普通店',category:'amenity',type:'restaurant',extratags:{cuisine:'ramen'}};
 p.run('nominatimRequest=async path=>path==="search"?[osmMatch]:{category:"amenity",address:{city:"福岡市"}}');
 assert.equal(p.run('normalizeGoogleResult({type_label:"燒肉"}).suggestedTag'),'燒肉');
 assert.equal((await p.run('lookupMapsSuggestions({lat:33.5918,lng:130.4183},"普通店",new AbortController().signal)')).suggestedTag,'ramen');
 assert.match(html,/#customForm #customTagInput\{[^}]*font-size:16px/);assert.match(html,/custom-tag-filters button[^}]*min-height:36px/);assert.match(html,/custom-tag-filters\{[^}]*overflow-x:auto/);
 p.close();

 // Exercise client transport through mocks, including Firebase's empty-array compaction.
 // JsonfileDatabase accepts extension fields; the bundled old PHP validator rejects
 // tags/tagVersion and needs a separate server update (outside this task's scope).
 class HistoryJsonDB extends JsonfileDatabase{async fetch(owner,url,opts={}){const u=new URL(url),op=u.searchParams.get('op');if(op==='version')return this.response(200,this.read(['kyushu2027','history',String(u.searchParams.get('rev')).padStart(6,'0')]));if(op==='history')return this.response(200,Object.values(this.read(['kyushu2027','history'])||{}).map(({rev,at,by,byId,summary})=>({rev,at,by,byId,summary})).reverse());return super.fetch(owner,url,opts);}}
 for(const [DB,backend]of [[Database,'firebase'],[HistoryJsonDB,'jsonfile']]){
  const db=new DB(),a=page({db,backend});await initial(a);
  const id=a.run('saveCustomSpot({zh:"同步店",cat:"餐廳",tags:["＃燒肉","拉麵"],lat:33.59,lng:130.42})'),key=JSON.stringify(id);
  await a.run('flushPending()');const taggedRev=a.run('sync.rev');assert.deepEqual(db.tree.kyushu2027.state.customs[id].tags,['燒肉','拉麵']);
  const b=page({db,backend});await initial(b);assert.deepEqual(json(b,`CUSTOMS[${key}].tags`),['燒肉','拉麵']);
  // A remote wish races a local wish, exercising the automatic rebase path.
  a.run(`toggleWish(${key},"want")`);db.beforePut=path=>{const current=db.read(path);current.rev++;(current.wishes??={}).canal={remote:{pool:'want',nick:'乙',at:1}};db.set(path,current);};await a.run('flushPending()');assert.deepEqual(db.tree.kyushu2027.state.customs[id].tags,['燒肉','拉麵']);assert(db.tree.kyushu2027.state.wishes.canal);
  await b.run('refreshShared()');
  // Current old-client sanitizer drops both tag fields on a full state write.
  const legacyWrite=()=>{const current=db.read(['kyushu2027','state']);current.rev++;delete current.customs[id].tags;delete current.customs[id].tagVersion;db.set(['kyushu2027','state'],current);};
  legacyWrite();await a.run('refreshShared()');assert.deepEqual(json(a,`CUSTOMS[${key}].tags`),['燒肉','拉麵']);
  a.run('toggleWish("tower","maybe")');await a.run('flushPending()');assert.deepEqual(db.tree.kyushu2027.state.customs[id].tags,['燒肉','拉麵']);
  if(backend==='firebase'){
   const next=String(a.run('sync.rev')+1).padStart(6,'0');db.failPath='/history/'+next;a.run('toggleWish("science","maybe")');await a.run('flushPending()');await a.run('adapter.load()');assert.deepEqual(db.tree.kyushu2027.history[next].customs[id].tags,['燒肉','拉麵']);
  }
  // Authoritative [] must clear, including after Firebase removes the array field.
  a.run(`saveCustomSpot({zh:"同步店",cat:"餐廳",tags:[]},${key})`);await a.run('flushPending()');await b.run('refreshShared()');assert.deepEqual(json(b,`CUSTOMS[${key}].tags`),[]);
  const cleared=await a.run(`adapter.version(${a.run('sync.rev')})`);assert.deepEqual(Array.from(cleared.customs[id].tags),[]);
  // Historical snapshots stay immutable/exact; restoring reinstates original tags.
  await a.run(`previewVersion(${taggedRev})`);await a.els.historyBody.onclick({target:{closest:()=>({dataset:{},hasAttribute:k=>k==='data-history-restore'})}});await a.run('flushPending()');assert.deepEqual(db.tree.kyushu2027.state.customs[id].tags,['燒肉','拉麵']);
  const archived=await a.run(`adapter.version(${taggedRev})`);assert.deepEqual(Array.from(archived.customs[id].tags),['燒肉','拉麵']);
  // Export/import retains tags and explicit empty imports do not inherit current tags.
  a.els.exportBtn.onclick();const exported=JSON.parse(a.els.mText.value);assert.deepEqual(exported.customs[id].tags,['燒肉','拉麵']);a.run('closeAllOverlays()');
  exported.customs[id].tags=['匯入'];assert(a.run('importJSON('+JSON.stringify(JSON.stringify(exported))+')'));await a.run('flushPending()');assert.deepEqual(db.tree.kyushu2027.state.customs[id].tags,['匯入']);
  delete exported.customs[id].tags;assert(a.run('importJSON('+JSON.stringify(JSON.stringify(exported))+')'));await a.run('flushPending()');assert.deepEqual(json(a,`CUSTOMS[${key}].tags`),[]);
  // Two offline batches persist through reload and upload in order.
  a.owner.online=false;a.run(`saveCustomSpot({zh:"同步店",cat:"餐廳",tags:["離線"]},${key})`);await a.run('flushPending()');a.run(`toggleWish(${key},"maybe")`);await a.run('flushPending()');assert.equal(a.run('sync.queue.length'),2);
  const offlineStore=new Map(a.storage);a.close();const resumed=page({db,backend,storage:offlineStore});await initial(resumed);await resumed.run('flushPending()');assert.deepEqual(db.tree.kyushu2027.state.customs[id].tags,['離線']);assert.equal(resumed.run('sync.queue.length'),0);
  // A plan conflict retains local tags in its draft and remote tags in the accepted state.
  resumed.run(`saveCustomSpot({zh:"同步店",cat:"餐廳",tags:["衝突草稿"]},${key})`);db.beforePut=path=>{const current=db.read(path);current.rev++;current.plan.pool=['tower'];db.set(path,current);};await resumed.run('flushPending()');assert.deepEqual(json(resumed,`CUSTOMS[${key}].tags`),['離線']);
  assert.deepEqual(json(resumed,`stored("kyushuPlanner.conflicts",[]).at(-1).customs[${key}].tags`),['衝突草稿']);
  resumed.run('historyPreview={...stored("kyushuPlanner.conflicts",[]).at(-1),draft:true}');await resumed.els.historyBody.onclick({target:{closest:()=>({dataset:{},hasAttribute:k=>k==='data-history-restore'})}});await resumed.run('flushPending()');assert.deepEqual(db.tree.kyushu2027.state.customs[id].tags,['衝突草稿']);
  // Legacy mitigation is conservative, creation-bound and never changes actual history/imports.
  const known=json(resumed,'CUSTOMS'),spot=known[id],legacy={...spot};delete legacy.tags;delete legacy.tagVersion;resumed.context.knownTags=known;resumed.context.legacyTags={[id]:legacy};
  assert.deepEqual(json(resumed,`preserveLegacyTags(legacyTags,knownTags)[${key}].tags`),['衝突草稿']);
  resumed.run(`legacyTags[${key}].zh="舊內容";legacyTags[${key}].editAt=0`);assert.deepEqual(json(resumed,`preserveLegacyTags(legacyTags,knownTags)[${key}].tags`),['衝突草稿']);
  resumed.run(`legacyTags[${key}].editAt=Number.MAX_SAFE_INTEGER`);assert.deepEqual(json(resumed,`preserveLegacyTags(legacyTags,knownTags)[${key}].tags`),[]);
  resumed.run(`legacyTags[${key}].zh=knownTags[${key}].zh;legacyTags[${key}].byId="other"`);assert.deepEqual(json(resumed,`preserveLegacyTags(legacyTags,knownTags)[${key}].tags`),[]);
  assert.deepEqual(json(resumed,`sanitizeCustoms(legacyTags)[${key}].tags`),[]);
  b.close();resumed.close();
 }
 // Case folding may expand characters beyond the 12-codepoint display limit.
 const unicodeSession=new Map(),unicode=page({session:unicodeSession});await initial(unicode);unicode.run('saveCustomSpot({zh:"Unicode",cat:"餐廳",tags:["İ".repeat(12)]});setCustomTagFilter("İ".repeat(12))');await unicode.run('flushPending()');assert.equal(unicode.run('ATTR.filter(matchesCustomTagFilter).length'),1);
 const unicodeReload=page({session:unicodeSession,storage:new Map(unicode.storage)});await initial(unicodeReload);assert.equal(unicodeReload.run('customTagFilter.size'),1);assert.equal(unicodeReload.run('ATTR.filter(matchesCustomTagFilter).length'),1);unicode.close();unicodeReload.close();
 // No Leaflet and blocked sessionStorage still allow tags/filtering/form input.
 const plain=page();await initial(plain);plain.context.sessionStorage={getItem(){throw Error('disabled');},setItem(){throw Error('disabled');}};plain.run('setCustoms({u_plain:{zh:"純文字",cat:"餐廳",tags:["燒肉"],by:ME.nick,byId:ME.id,at:1}});setCustomTagFilter("燒肉");openCustomForm("u_plain")');assert.match(plain.els.customTagChips.innerHTML,/燒肉/);plain.close();
 console.log('PASS custom tags: Unicode/limits/legacy sanitize, IME/input/Enter/chips/edit/stack, frequency/picks/no-auto-add/escaping, session OR/全部/5 bars, pool sorting/markers/nearby, Firebase+JSON mock sync/rebase/offline/conflict/history/restore/export/import/legacy preservation/explicit clearing');
};
