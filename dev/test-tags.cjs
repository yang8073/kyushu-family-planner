// Run by test-planner.cjs. All sync calls use in-memory REST/RTDB adapters.
const assert=require('assert/strict');
module.exports=async function({html,page,initial,sleep,leaflet,Database,JsonfileDatabase}){
 const json=(p,code)=>JSON.parse(p.run('JSON.stringify('+code+')'));
 const L=leaflet(),p=page({L});await initial(p);
 const allTags=json(p,'TAGS'),tags=allTags.filter(t=>t!=='已訂'),norm=raw=>json(p,'normalizeCustomTags('+JSON.stringify(raw)+')');
 assert(tags.length>8);assert.deepEqual(allTags,json(p,'[...new Set(BUILTIN_ATTR.flatMap(a=>a.tags))]'));
 assert(allTags.includes('已訂'));assert.deepEqual([...p.els.tagChips.innerHTML.matchAll(/data-tag="([^"]+)"/g)].map(m=>m[1]),allTags);
 assert.deepEqual(norm(['已訂','　＃已訂　','燒肉']),['燒肉']);
 for(const tag of tags){assert(tag.trim());assert([...tag].length<=12,tag);assert(!/[\p{Cc}\p{Cf}]/u.test(tag),tag);assert.deepEqual(norm([tag]),[tag]);}
 assert.deepEqual(norm(['　＃燒肉　','燒肉','＃ # 拉麵','自創標籤','RAMEN','<b>',null,4,{}]),['燒肉','拉麵']);
 assert.deepEqual(norm(['拉\u200b麵','燒\u0000肉','燒肉多餘內容','😀'.repeat(20)]),[]);
 for(const raw of ['燒肉',null,{},[{},[],true,0,' # ','\u0000']])assert.deepEqual(norm(raw),[]);
 assert.deepEqual(norm(tags),tags.slice(0,8));assert.deepEqual(norm([...tags].reverse()),[...tags].reverse().slice(0,8));
 // Removed free-tag UI and filters must not survive as inactive code paths.
 for(const id of ['listTagFilters','wishTagFilters','poolTagFilters','mapTagFilters','nearbyTagFilters','customTagInput','customTagAdd','customTagPicks','CUSTOM_TAG_FILTER_KEY','customTagFilter','matchesCustomTagFilter','renderCustomTagFilters','setCustomTagFilter','custom-tag-filters'])assert(!html.includes(id),id);
 assert.match(html,/id="customTagPicker" role="group" aria-labelledby="customTagLabel" aria-describedby="customTagHint"/);
 assert.match(html,/分類標籤（可複選，最多 8 個）/);
 assert.match(html,/#customTagPicker\{[^}]*flex-wrap:wrap/);
 assert.match(html,/#customTagPicker \.chip\{[^}]*min-width:36px;min-height:36px;[^}]*max-width:100%/);
 assert.match(html,/#customBody,#nickBody\{[^}]*overflow:auto/);
 const categories=['親子景點','購物街/商圈','安全帽店','樂高店','PS5遊戲片店','餐廳'];
 const catOptions=html.match(/<select id="customCat"[^>]*>(.*?)<\/select>/)[1];
 assert.deepEqual([...catOptions.matchAll(/<option value="([^"]+)"/g)].map(m=>m[1]),categories);
 const old={zh:'普通店甲',cat:'餐廳',by:'甲',byId:'tagtest',at:1,lat:33.5918,lng:130.4183};p.context.oldSpot=old;
 assert.deepEqual(json(p,'sanitizeCustoms({u_old:oldSpot}).u_old.tags'),[]);
 assert.deepEqual(json(p,'sanitizeCustoms({u_old:{...oldSpot,tags:"燒肉"}}).u_old.tags'),[]);
 assert.deepEqual(json(p,'sanitizeCustoms({u_old:{...oldSpot,tags:[null,"＃拉麵","拉麵",{},"<b>","燒肉"]}}).u_old.tags'),['拉麵','燒肉']);
 assert.deepEqual(json(p,'sanitizeCustoms({u_bad:{tags:["燒肉"]},canal:{...oldSpot,tags:["燒肉"]}})'),{});
 // Loading PR #14 data drops unknown free tags and the lodging status tag.
 const legacyStorage=new Map([['kyushuPlanner.customs',JSON.stringify({u_legacy:{...old,tags:['已訂','自創標籤','燒肉','拉麵'],tagVersion:1}})]]);
 const legacyPage=page({storage:legacyStorage});await initial(legacyPage);assert.deepEqual(json(legacyPage,'CUSTOMS.u_legacy.tags'),['燒肉','拉麵']);legacyPage.close();
 p.run('setCustoms({u_a:{...oldSpot,tags:["燒肉","室內"]},u_b:{...oldSpot,zh:"普通店乙",tags:["拉麵","燒肉"],lng:130.419},u_c:{...oldSpot,zh:"普通店丙",tags:["拉麵","自創標籤"]},u_empty:oldSpot});S.pool=["canal","u_a","u_b","u_c","u_empty"];S.days.forEach(d=>d.items=[]);WISH={u_a:{[ME.id]:{pool:"want",nick:ME.nick,at:1}},u_b:{[ME.id]:{pool:"want",nick:ME.nick,at:1}},canal:{[ME.id]:{pool:"want",nick:ME.nick,at:1}}};renderAll()');
 assert.deepEqual(json(p,'BY.u_a.tags'),['燒肉','室內']);assert.deepEqual(json(p,'DETAIL.u_a.tags'),['燒肉','室內']);
 assert.match(p.els.cards.innerHTML,/<span class="tag">燒肉/);assert.match(p.els.wishSections.innerHTML,/<span class="tag">燒肉/);assert.match(p.els.days.innerHTML,/<span class="tag">燒肉/);
 assert(!p.els.cards.innerHTML.includes('<span class="tag area"></span>'));assert.match(p.els.cards.innerHTML,/<span class="tag area">福岡市區<\/span>/);
 p.run('openDetail("u_a")');assert.match(p.els.detailBody.innerHTML,/<dt>標籤<\/dt>/);assert.match(p.els.detailBody.innerHTML,/<span class="tag">燒肉/);assert.match(p.els.detailBody.innerHTML,/<dt>🏷️ 類別／地區<\/dt><dd>餐廳<\/dd>/);assert(!p.els.detailBody.innerHTML.includes('<span class="tag area"></span>'));p.run('closeAllOverlays()');
 const snapshot=p.run('JSON.stringify(snapshot())'),rev=p.run('sync.rev');
 const filterClick=tag=>p.els.tagChips.onclick({target:{dataset:{tag},classList:{toggle(){}}}});
 filterClick('燒肉');
 let listIDs=()=>[...p.els.cards.innerHTML.matchAll(/class="nm title-button" data-detail="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(listIDs(),json(p,'ATTR.filter(a=>a.tags.includes("燒肉")).map(a=>a.id)'));
 assert(listIDs().includes('u_a'));assert(listIDs().includes('food_tagyu'));assert(!listIDs().includes('u_c'));assert(!listIDs().includes('canal'));
 filterClick('拉麵');assert.deepEqual(listIDs(),['u_b']); // Existing AND semantics.
 p.els.clearF.onclick();assert(listIDs().includes('canal'));
 p.els.cat.onchange({target:{value:'餐廳'}});assert(listIDs().includes('u_a'));assert(listIDs().includes('food_tagyu'));assert(!listIDs().includes('canal'));p.els.clearF.onclick();
 // Other views have no built-in tag filters; all spots stay available there.
 filterClick('燒肉');p.run('document.getElementById("showAll").checked=true;renderAll()');
 assert(p.els.wishSections.innerHTML.includes('data-detail="canal"'));assert(p.els.wishSections.innerHTML.includes('data-detail="u_a"'));
 for(const id of ['canal','u_a','u_b','u_c','u_empty']){assert(p.els.days.innerHTML.includes('data-id="'+id+'"'));assert(p.run('!!markers['+JSON.stringify(id)+']'));}
 assert.equal(p.run('JSON.stringify(snapshot())'),snapshot);assert.equal(p.run('sync.rev'),rev);assert.equal(p.run('sync.stage'),null);p.els.clearF.onclick();
 // Sorting the complete pool and moving a custom spot to a day retain all items.
 const originalQuery=p.context.document.querySelectorAll;
 p.context.document.querySelectorAll=q=>q==='#days ul'?[{dataset:{idx:'-1'},querySelectorAll:()=>['u_b','canal','u_c','u_empty'].map(id=>({dataset:{id}}))},{dataset:{idx:'0'},querySelectorAll:()=>[{dataset:{id:'u_a'}}]}]:originalQuery(q);
 p.run('dragging=true;syncFromDom()');await p.run('flushPending()');
 assert.deepEqual(json(p,'S.pool'),['u_b','canal','u_c','u_empty']);assert.deepEqual(json(p,'S.days[0].items'),['u_a']);p.context.document.querySelectorAll=originalQuery;
 p.run('openNearby("hotel")');
 for(const query of ['燒肉','焼肉','YAKINIKU']){assert(p.run('filteredNearbySpots("hotel",'+JSON.stringify(query)+').some(s=>s.id==="u_a")'));assert(p.run('filteredNearbySpots("hotel",'+JSON.stringify(query)+').some(s=>s.id==="food_tagyu")'));}
 assert(p.run('nearbyMatches(BY.u_b,"RAMEN")'));assert(p.run('nearbyMatches(BY.u_a,"室內")'));
 // Aliases must work for tags in any position for both kinds of spot.
 for(const custom of [false,true])assert(p.run('nearbyMatches({zh:"普通店",cat:"親子景點",tags:["室內","拉麵"],custom:'+custom+'},"RAMEN")'));
 p.els.nearbySearch.value='燒肉';p.els.nearbySearch.oninput({});assert.match(p.els.nearbyRows.innerHTML,/普通店甲/);assert.match(p.els.nearbyRows.innerHTML,/普通店乙/);assert(!p.els.nearbyRows.innerHTML.includes('普通店丙'));
 assert(L.groups.at(-1).children.some(pin=>pin._nearbyId==='u_a'));assert(L.groups.at(-1).children.some(pin=>pin._nearbyId==='food_tagyu'));
 p.run('closeAllOverlays();openCustomForm("u_a")');
 const picker=()=>[...p.els.customTagPicker.innerHTML.matchAll(/<button type="button" class="chip(?: on)?" data-tag-toggle="(\d+)" aria-pressed="(true|false)">([^<]+)<\/button>/g)].map(m=>({index:+m[1],pressed:m[2]==='true',text:m[3]}));
 assert.deepEqual(picker().map(b=>b.text),tags);assert.deepEqual(picker().filter(b=>b.pressed).map(b=>b.text),tags.filter(t=>['燒肉','室內'].includes(t)));
 const formClick=(data,selector)=>p.els.customForm.dispatchEvent({type:'click',target:{closest:q=>q===selector?{dataset:data}:null}});
 const toggle=tag=>formClick({tagToggle:String(tags.indexOf(tag))},'[data-tag-toggle]');
 toggle('拉麵');assert.deepEqual(json(p,'overlayTop().state.tags'),['燒肉','室內','拉麵']);assert(picker().find(b=>b.text==='拉麵').pressed);
 toggle('室內');assert.deepEqual(json(p,'overlayTop().state.tags'),['燒肉','拉麵']);assert(!picker().find(b=>b.text==='室內').pressed);
 p.run('openModal("子層","",null)');p.els.modalClose.onclick();await sleep(15);assert.deepEqual(json(p,'overlayTop().state.tags'),['燒肉','拉麵']);assert(picker().find(b=>b.text==='拉麵').pressed);
 p.els.customForm.onsubmit({preventDefault(){}});await p.run('flushPending()');assert.deepEqual(json(p,'CUSTOMS.u_a.tags'),['燒肉','拉麵']);assert.equal(p.run('CUSTOMS.u_a.tagVersion'),1);
 p.run('openCustomForm("u_a")');toggle('燒肉');toggle('拉麵');p.els.customForm.onsubmit({preventDefault(){}});await p.run('flushPending()');assert.deepEqual(json(p,'CUSTOMS.u_a.tags'),[]);
 // Eight selectable chips, a visible limit hint, and the ninth remains unselected.
 p.run('openCustomForm()');assert.deepEqual(picker().map(b=>b.text),tags);assert(!picker().some(b=>b.pressed));p.els.customZh.value='新店';p.els.customCat.value='餐廳';
 for(const tag of tags.slice(0,8))toggle(tag);toggle(tags[8]);assert.deepEqual(json(p,'overlayTop().state.tags'),tags.slice(0,8));assert(!picker()[8].pressed);assert.match(p.els.customTagHint.textContent,/最多可選 8 個/);assert.match(p.els.toast.textContent,/最多可選 8 個/);
 toggle(tags[0]);toggle(tags[8]);const chosen=[...tags.slice(1,8),tags[8]];assert.deepEqual(json(p,'overlayTop().state.tags'),chosen);
 p.els.customForm.onsubmit({preventDefault(){}});await p.run('flushPending()');
 const added=p.run('Object.keys(CUSTOMS).find(id=>CUSTOMS[id].zh==="新店")');assert.deepEqual(json(p,`CUSTOMS[${JSON.stringify(added)}].tags`),chosen);
 // Autofill may suggest a known tag; applying fields never selects it.
 for(const source of ['google','osm']){
  p.run('openCustomForm();Object.assign(overlayTop().state,{suggestSource:'+JSON.stringify(source)+',suggestions:normalizeGoogleResult({name:"建議店",type:"ramen_restaurant",primaryTypeDisplayName:{text:"拉麵"}})});renderCustomSuggestions();applyCustomSuggestion("cat");applyCustomSuggestion("all")');
  assert.deepEqual(json(p,'overlayTop().state.tags'),[]);assert(!picker().some(b=>b.pressed));assert.match(p.els.customSuggest.innerHTML,/data-tag-add="拉麵"/);
  formClick({tagAdd:'拉麵'},'[data-tag-add]');assert.deepEqual(json(p,'overlayTop().state.tags'),['拉麵']);
  p.run('overlayTop().state.suggestions.suggestedTag="不存在的標籤";renderCustomSuggestions()');assert(!p.els.customSuggest.innerHTML.includes('data-tag-add='));formClick({tagAdd:'不存在的標籤'},'[data-tag-add]');assert.deepEqual(json(p,'overlayTop().state.tags'),['拉麵']);p.run('closeAllOverlays()');
 }
 assert.equal(p.run('normalizeGoogleResult({type_label:"燒肉"}).suggestedTag'),'燒肉');assert.equal(p.run('normalizeGoogleResult({type_label:"自創標籤"}).suggestedTag'),'');
 p.close();

 // Assert the deployed server's field and tag rules against every outbound state,
 // rather than relying on the permissive REST mock to accept invalid extensions.
 const fields=new Set(['zh','cat','area','addr','lat','lng','note','url','by','byId','at','editBy','editAt','tags','tagVersion']);
 let validatedPayloads=0;
 function validatePayload(state){for(const spot of Object.values(state.customs||{})){
  for(const key of Object.keys(spot))assert(fields.has(key),'unexpected custom field '+key);
  assert(categories.includes(spot.cat));assert(Array.isArray(spot.tags));assert(spot.tags.length<=8);assert.equal(new Set(spot.tags).size,spot.tags.length);
  for(const tag of spot.tags){assert.equal(typeof tag,'string');assert(tag.trim());assert([...tag].length<=12);assert(!/[\p{Cc}\p{Cf}]/u.test(tag));assert(tags.includes(tag));}
  assert(Number.isInteger(spot.tagVersion)&&spot.tagVersion>=0&&spot.tagVersion<=100);
 }validatedPayloads++;}
 class TaggedDatabase extends Database{async fetch(owner,url,opts={}){if(opts.method==='PUT'&&new URL(url).pathname.endsWith('/state.json'))validatePayload(JSON.parse(opts.body));return super.fetch(owner,url,opts);}}
 class HistoryJsonDB extends JsonfileDatabase{async fetch(owner,url,opts={}){const u=new URL(url),op=u.searchParams.get('op');if(op==='save')validatePayload(JSON.parse(opts.body).state);if(op==='version')return this.response(200,this.read(['kyushu2027','history',String(u.searchParams.get('rev')).padStart(6,'0')]));if(op==='history')return this.response(200,Object.values(this.read(['kyushu2027','history'])||{}).map(({rev,at,by,byId,summary})=>({rev,at,by,byId,summary})).reverse());return super.fetch(owner,url,opts);}}
 for(const [DB,backend]of [[TaggedDatabase,'firebase'],[HistoryJsonDB,'jsonfile']]){
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
  exported.customs[id].tags=['匯入自創標籤','室內'];assert(a.run('importJSON('+JSON.stringify(JSON.stringify(exported))+')'));await a.run('flushPending()');assert.deepEqual(db.tree.kyushu2027.state.customs[id].tags,['室內']);
  delete exported.customs[id].tags;assert(a.run('importJSON('+JSON.stringify(JSON.stringify(exported))+')'));await a.run('flushPending()');assert.deepEqual(json(a,`CUSTOMS[${key}].tags`),[]);
  // Two offline batches persist through reload and upload in order.
  a.owner.online=false;a.run(`saveCustomSpot({zh:"同步店",cat:"餐廳",tags:["美食"]},${key})`);await a.run('flushPending()');a.run(`toggleWish(${key},"maybe")`);await a.run('flushPending()');assert.equal(a.run('sync.queue.length'),2);
  const offlineStore=new Map(a.storage);a.close();const resumed=page({db,backend,storage:offlineStore});await initial(resumed);await resumed.run('flushPending()');assert.deepEqual(db.tree.kyushu2027.state.customs[id].tags,['美食']);assert.equal(resumed.run('sync.queue.length'),0);
  // A plan conflict retains local tags in its draft and remote tags in the accepted state.
  resumed.run(`saveCustomSpot({zh:"同步店",cat:"餐廳",tags:["必比登"]},${key})`);db.beforePut=path=>{const current=db.read(path);current.rev++;current.plan.pool=['tower'];db.set(path,current);};await resumed.run('flushPending()');assert.deepEqual(json(resumed,`CUSTOMS[${key}].tags`),['美食']);
  assert.deepEqual(json(resumed,`stored("kyushuPlanner.conflicts",[]).at(-1).customs[${key}].tags`),['必比登']);
  resumed.run('historyPreview={...stored("kyushuPlanner.conflicts",[]).at(-1),draft:true}');await resumed.els.historyBody.onclick({target:{closest:()=>({dataset:{},hasAttribute:k=>k==='data-history-restore'})}});await resumed.run('flushPending()');assert.deepEqual(db.tree.kyushu2027.state.customs[id].tags,['必比登']);
  // Legacy mitigation is conservative, creation-bound and never changes actual history/imports.
  const known=json(resumed,'CUSTOMS'),spot=known[id],legacy={...spot};delete legacy.tags;delete legacy.tagVersion;resumed.context.knownTags=known;resumed.context.legacyTags={[id]:legacy};
  assert.deepEqual(json(resumed,`preserveLegacyTags(legacyTags,knownTags)[${key}].tags`),['必比登']);
  resumed.run(`legacyTags[${key}].zh="舊內容";legacyTags[${key}].editAt=0`);assert.deepEqual(json(resumed,`preserveLegacyTags(legacyTags,knownTags)[${key}].tags`),['必比登']);
  resumed.run(`legacyTags[${key}].editAt=Number.MAX_SAFE_INTEGER`);assert.deepEqual(json(resumed,`preserveLegacyTags(legacyTags,knownTags)[${key}].tags`),[]);
  resumed.run(`legacyTags[${key}].zh=knownTags[${key}].zh;legacyTags[${key}].byId="other"`);assert.deepEqual(json(resumed,`preserveLegacyTags(legacyTags,knownTags)[${key}].tags`),[]);
  assert.deepEqual(json(resumed,`sanitizeCustoms(legacyTags)[${key}].tags`),[]);
  b.close();resumed.close();
 }
 assert(validatedPayloads>20);
 // No Leaflet or session storage is needed to edit existing planner tags.
 const plain=page();await initial(plain);plain.context.sessionStorage={getItem(){throw Error('disabled');},setItem(){throw Error('disabled');}};plain.run('setCustoms({u_plain:{zh:"純文字",cat:"餐廳",tags:["燒肉"],by:ME.nick,byId:ME.id,at:1}});openCustomForm("u_plain")');assert.match(plain.els.customTagPicker.innerHTML,/aria-pressed="true">燒肉/);plain.close();
 console.log('PASS existing planner tags: picker excludes 已訂/aria/toggle/8-cap/edit/stack, canonical normalization/legacy status removal, unchanged main filters, non-empty area chips, cards/detail/pool/map/nearby, validated Firebase+JSON payloads, sync/rebase/offline/conflict/history/restore/import/export/legacy merge/explicit clearing');
};
