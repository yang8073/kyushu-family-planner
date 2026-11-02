// Shared category definitions, using the planner's DOM and two REST adapter doubles.
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
module.exports=async function({html,page,initial,sleep,leaflet,Database,JsonfileDatabase}){
 const json=(p,code)=>JSON.parse(p.run('JSON.stringify('+code+')'));
 const event=(type,target,extra={})=>({type,target,pointerType:'touch',pointerId:7,clientX:20,clientY:20,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...extra});
 function chip(p,name,picker=false){const el=new p.els.tagChips.constructor(),key=picker?'tagToggle':'tag';el.tagName='BUTTON';el.dataset[key]=picker?String(p.run('pickerTags().indexOf('+JSON.stringify(name)+')')):name;el.setAttribute(picker?'data-tag-toggle':'data-tag',el.dataset[key]);el.parentElement=p.els[picker?'customTagPicker':'tagChips'];return el;}
 function send(p,name,type,picker=false,extra={}){const target=chip(p,name,picker),e=event(type,target,extra);target.parentElement.dispatchEvent(e);return e;}
 function tap(p,name,picker=false){send(p,name,'pointerdown',picker);send(p,name,'pointerup',picker);const target=chip(p,name,picker);if(picker)p.els.customForm.dispatchEvent(event('click',target));else p.els.tagChips.dispatchEvent(event('click',target));}
 function plus(p){const el=new p.els.tagChips.constructor();el.setAttribute('data-tag-new','');p.els.customForm.dispatchEvent(event('click',el));assert(!p.els.tagDefRow.hidden);}
 function create(p,name){plus(p);p.els.tagDefName.value=name;return p.els.tagDefSave.onclick();}
 async function hold(p,name,picker=false){send(p,name,'pointerdown',picker);await sleep(580);send(p,name,'pointerup',picker);}
 const p=page({L:leaflet()});await initial(p);p.run('openCustomForm()');
 assert.match(p.els.customTagPicker.innerHTML,/<button[^>]*data-tag-new[^>]*>＋ 新增分類<\/button>$/);
 assert(!p.els.customTagPicker.innerHTML.includes('>已訂</button>'));
 assert.match(html,/#tagChips \.chip,#customTagPicker \.chip\{[^}]*-webkit-touch-callout:none;user-select:none;-webkit-user-select:none;touch-action:manipulation/);
 for(const [name,message]of [['　 ','請輸入'],['字'.repeat(13),'最多 12'],['名\u0000稱','控制'],['名\u200b稱','隱藏']]){assert.equal(create(p,name),null);assert.match(p.els.tagDefError.textContent,new RegExp(message));assert.equal(p.run('Object.keys(TAGDEFS).length'),0);}
 const id=create(p,'　自訂分類　');assert.match(id,/^[a-z0-9_]{1,40}$/);assert.equal(p.run(`TAGDEFS.${id}.name`),'自訂分類');assert.deepEqual(json(p,'overlayTop().state.tags'),['自訂分類']);assert.match(p.els.tagChips.innerHTML,/data-tag="自訂分類"/);assert(p.run('sync.stage.planChanged'));
 assert.deepEqual(Object.keys(json(p,`TAGDEFS.${id}`)),['name','by','byId','at']);
 assert.equal(create(p,'自訂分類'),null);assert.match(p.els.tagDefError.textContent,/已存在，已選取/);assert.equal(p.run('Object.keys(TAGDEFS).length'),1);
 assert.equal(create(p,'燒肉'),null);assert.deepEqual(json(p,'overlayTop().state.tags'),['自訂分類','燒肉']);assert.match(p.els.tagDefError.textContent,/已存在/);
 const latin=create(p,'　Ｆａｍｉｌｙ　');assert.equal(p.run(`TAGDEFS.${latin}.name`),'Family');assert.equal(create(p,'family'),null);assert.match(p.els.tagDefError.textContent,/已存在/);
 assert.equal(create(p,'已訂'),null);assert(!p.run('overlayTop().state.tags.includes("已訂")'));
 // Enter saves without submitting the spot, Escape and Cancel retain the form.
 plus(p);p.els.tagDefName.value='鍵盤分類';let e=event('keydown',p.els.tagDefName,{key:'Enter'});p.els.tagDefName.dispatchEvent(e);assert(e.defaultPrevented);assert(p.run('overlayTop().state.tags.includes("鍵盤分類")'));assert.equal(p.run('Object.keys(CUSTOMS).length'),0);
 plus(p);e=event('keydown',p.els.tagDefName,{key:'Escape'});p.els.tagDefName.dispatchEvent(e);assert(e.defaultPrevented&&e.stopped);assert(p.els.tagDefRow.hidden);assert.equal(p.run('overlayTop().kind'),'custom');plus(p);p.els.tagDefCancel.onclick();assert(p.els.tagDefRow.hidden);
 // Unicode code-point limit permits twelve emoji; the ninth selection stays unselected.
 const emoji=create(p,'😀'.repeat(12));assert(emoji);p.run('overlayTop().state.tags=CUSTOM_TAGS.slice(0,8);renderCustomTags()');const full=create(p,'超出選取');assert(full);assert.equal(p.run('overlayTop().state.tags.length'),8);assert(!p.run('overlayTop().state.tags.includes("超出選取")'));assert.match(p.els.customTagHint.textContent,/最多可選 8 個/);
 // Cancelling the spot still persists its newly created categories in local mode.
 p.els.customCancel.onclick();await p.run('flushPending()');assert(p.run(`sync.current.tagDefs.${id}`));assert(p.storage.has('kyushuPlanner.tagDefs'));assert.equal(p.run('Object.keys(CUSTOMS).length'),0);
 const localCopy=page({storage:new Map(p.storage)});await initial(localCopy);assert.equal(localCopy.run(`TAGDEFS.${id}.name`),'自訂分類');assert.match(localCopy.els.tagChips.innerHTML,/自訂分類/);localCopy.close();
 // All existing tag consumers use the same category names, including AND filters.
 p.run('openCustomForm();overlayTop().state.tags=[];renderCustomTags()');tap(p,'自訂分類',true);tap(p,'百名店',true);assert.deepEqual(json(p,'overlayTop().state.tags'),['自訂分類','百名店']);
 p.els.customZh.value='普通甲店';p.els.customCat.value='餐廳';p.els.customCoords.value='33.5918, 130.4183';p.els.customForm.onsubmit(event('submit'));await p.run('flushPending()');
 const spot=p.run('Object.keys(CUSTOMS)[0]');assert.deepEqual(json(p,`CUSTOMS[${JSON.stringify(spot)}].tags`),['自訂分類','百名店']);
 const second=p.run('saveCustomSpot({zh:"普通乙店",cat:"餐廳",tags:["自訂分類"],lat:33.592,lng:130.419})');p.run(`planner.select(${JSON.stringify(spot)});planner.select(${JSON.stringify(second)});toggleWish(${JSON.stringify(spot)},"want");toggleWish(${JSON.stringify(second)},"want")`);await p.run('flushPending()');
 p.run(`saveCustomSpot({zh:"普通甲店",cat:"餐廳",tags:["自訂分類","百名店"],area:"博多",addr:"測試地址",note:"保留備註",url:"https://example.com/spot",lat:33.5918,lng:130.4183},${JSON.stringify(spot)})`);await p.run('flushPending()');
 const list=()=>[...p.els.cards.innerHTML.matchAll(/class="nm title-button" data-detail="([^"]+)"/g)].map(m=>m[1]);
 tap(p,'自訂分類');assert.deepEqual(list(),[spot,second]);tap(p,'百名店');assert.deepEqual(list(),[spot]);tap(p,'自訂分類');assert(list().includes(spot));assert(!list().includes(second));p.els.clearF.onclick();
 for(const el of ['wishSections','days'])assert.match(p.els[el].innerHTML,/<span class="tag">自訂分類<\/span>/);
 assert(p.run(`!!markers[${JSON.stringify(spot)}]`)); // The main map retains the same availability as built-in tags.
 assert(p.run(`nearbyMatches(BY[${JSON.stringify(spot)}],"自訂分類 百名店")`));assert(!p.run(`nearbyMatches(BY[${JSON.stringify(second)}],"自訂分類 百名店")`));
 p.run('openNearby("hotel")');p.els.nearbySearch.value='自訂分類';p.els.nearbySearch.oninput({});assert.match(p.els.nearbyRows.innerHTML,/普通甲店/);assert.match(p.els.nearbyRows.innerHTML,/普通乙店/);p.run('closeAllOverlays()');
 // Movement, release, scrolling and pointercancel cancel a pending long press.
 for(const action of ['move','up','scroll','cancel']){send(p,'自訂分類','pointerdown');if(action==='move')send(p,'自訂分類','pointermove',false,{clientX:31});if(action==='up')send(p,'自訂分類','pointerup');if(action==='cancel')send(p,'自訂分類','pointercancel');if(action==='scroll')for(const cb of p.owner.docListeners.scroll)cb({});await sleep(570);assert.equal(p.run('overlayStack.length'),0,action);}
 tap(p,'自訂分類');assert(p.run('F.tags.has("自訂分類")'));tap(p,'自訂分類');assert(!p.run('F.tags.has("自訂分類")'));
 // Built-ins only toast, including the picker path; no browser confirm is used.
 p.context.confirm=()=>{throw Error('category deletion must use an in-app dialog');};
 await hold(p,'燒肉');assert.match(p.els.toast.textContent,/內建分類無法刪除/);assert.equal(p.run('overlayStack.length'),0);
 // Top-bar hold counts built-in and custom places, and its following click is suppressed.
 p.run('BY.canal.tags.push("自訂分類")');await hold(p,'自訂分類');assert.equal(p.run('overlayTop().kind'),'modal');assert.match(p.els.mMessage.textContent,/有 3 個景點/);assert.equal(p.els.modal.attributes['aria-describedby'],'mMessage');
 p.els.tagChips.dispatchEvent(event('click',chip(p,'自訂分類')));assert(!p.run('F.tags.has("自訂分類")'));send(p,'自訂分類','contextmenu');assert.equal(p.run('overlayStack.length'),1);p.els.mCancel.onclick();await sleep(15);p.run('BY.canal.tags=BY.canal.tags.filter(t=>t!=="自訂分類")');
 send(p,'燒肉','pointerdown',false,{pointerType:'mouse'});assert(send(p,'燒肉','contextmenu').defaultPrevented);assert.equal(p.run('overlayStack.length'),0);
 p.run(`openCustomForm(${JSON.stringify(spot)})`);await hold(p,'百名店',true);assert.equal(p.run('overlayTop().kind'),'custom');assert.match(p.els.toast.textContent,/內建分類無法刪除/);
 // Count includes all registered spots, even those outside the selected plan.
 p.run(`planner.unselect(${JSON.stringify(second)});F.tags.add("自訂分類");renderTagChips()`);await p.run('flushPending()');const before=json(p,'snapshot()');
 await hold(p,'自訂分類',true);assert.equal(p.run('overlayTop().kind'),'modal');assert.equal(p.els.mOk.textContent,'刪除');assert.equal(p.els.mCancel.textContent,'取消');assert(p.els.mText.hidden&&p.els.mCopy.hidden);assert.equal(p.els.mMessage.textContent,'有 2 個景點在這個分類，確定要刪除嗎？刪除不影響現存景點，只會刪除分類標籤。');
 // The synthetic click after a hold cannot toggle the underlying picker/filter.
 p.els.customForm.dispatchEvent(event('click',chip(p,'自訂分類',true)));assert.deepEqual(json(p,'overlayStack.find(l=>l.kind==="custom").state.tags'),['自訂分類','百名店']);
 p.els.mCancel.onclick();await sleep(15);assert.equal(p.run('overlayTop().kind'),'custom');assert.deepEqual(json(p,'snapshot()'),before);
 send(p,'自訂分類','pointerdown',true,{pointerType:'mouse'});const context=send(p,'自訂分類','contextmenu',true);assert(context.defaultPrevented);
 assert.equal(p.run('overlayTop().kind'),'modal');p.els.mOk.onclick();await sleep(15);await p.run('flushPending()');
 const after=json(p,'snapshot()');assert(after.tagDefs[id].deleted);assert.equal(after.tagDefs[id].deletedBy,'小明');assert(Number.isInteger(after.tagDefs[id].deletedAt));assert.deepEqual({...after.tagDefs[id],deleted:undefined,deletedAt:undefined,deletedBy:undefined},{...before.tagDefs[id],deleted:undefined,deletedAt:undefined,deletedBy:undefined});
 for(const [key,value]of Object.entries(before.customs))assert.deepEqual(after.customs[key],{...value,tags:value.tags.filter(t=>t!=='自訂分類'),tagVersion:1});
 assert.deepEqual(after.plan,before.plan);assert.deepEqual(after.wishes,before.wishes);assert(!p.run('F.tags.has("自訂分類")'));assert(!p.run('overlayTop().state.tags.includes("自訂分類")'));assert(!p.els.tagChips.innerHTML.includes('自訂分類'));assert(!p.els.customTagPicker.innerHTML.includes('自訂分類'));assert.match(p.run('sync.current.summary'),/刪除分類「自訂分類」/);
 assert.deepEqual(json(p,'normalizeCustomTags(["自訂分類","百名店"])'),['百名店']);
 assert.deepEqual(json(p,'normalizeCustomTags(["＃燒肉"],{t_removed:{name:"#燒肉",deleted:true}})'),[]); // A deleted name cannot fall back to a legacy built-in alias.
 assert.deepEqual(json(p,`sanitizeCustoms({u_legacy:{...CUSTOMS[${JSON.stringify(spot)}],tags:["自訂分類","百名店"]}}).u_legacy.tags`),['百名店']);
 const recreated=create(p,'自訂分類');assert(recreated&&recreated!==id);assert(p.run(`TAGDEFS.${id}.deleted`));
 // Active cap excludes tombstones and duplicate selection still works at the cap.
 p.run('setTagDefs(Object.fromEntries(Array.from({length:50},(_,i)=>["t_cap"+i,{name:"分類"+i,by:ME.nick,byId:ME.id,at:1}])));openCustomForm()');assert.equal(create(p,'第51類'),null);assert.match(p.els.tagDefError.textContent,/最多 50/);assert.equal(create(p,'分類0'),null);assert(p.run('overlayTop().state.tags.includes("分類0")'));p.run('TAGDEFS.t_cap0={...TAGDEFS.t_cap0,deleted:true,deletedAt:2,deletedBy:ME.nick}');assert(create(p,'空出一類'));
 p.close();

 // Definitions and spot tags survive both adapters, rebases, retries and offline reloads.
 let payloads=0;
 function validate(state){for(const [id,d]of Object.entries(state.tagDefs||{})){assert.match(id,/^[a-z0-9_]{1,40}$/);assert(d.name.trim()&&[...d.name].length<=12);assert(!/[\p{Cc}\p{Cf}]/u.test(d.name));assert(d.by&&d.byId&&Number.isInteger(d.at));assert(Object.keys(d).every(k=>['name','by','byId','at','deleted','deletedAt','deletedBy'].includes(k)));if(Object.hasOwn(d,'deleted'))assert.equal(d.deleted,true);}assert(Object.keys(state.tagDefs||{}).length<=200);payloads++;}
 class TagsFirebase extends Database{async fetch(owner,url,opts={}){if(opts.method==='PUT'&&new URL(url).pathname.endsWith('/state.json'))validate(JSON.parse(opts.body));return super.fetch(owner,url,opts);}}
 class TagsJson extends JsonfileDatabase{async fetch(owner,url,opts={}){const u=new URL(url),op=u.searchParams.get('op');if(op==='save')validate(JSON.parse(opts.body).state);if(op==='version')return this.response(200,this.read(['kyushu2027','history',String(u.searchParams.get('rev')).padStart(6,'0')]));return super.fetch(owner,url,opts);}}
 for(const [DB,backend]of [[TagsFirebase,'firebase'],[TagsJson,'jsonfile']]){
  const db=new DB(),a=page({db,backend});await initial(a);assert(!Object.hasOwn(db.tree.kyushu2027.state,'tagDefs'));a.run('openCustomForm()');const def=create(a,'同步分類');a.els.customCancel.onclick();await a.run('flushPending()');assert.equal(db.tree.kyushu2027.state.tagDefs[def].name,'同步分類');
  const tagged=a.run('saveCustomSpot({zh:"同步店",cat:"餐廳",tags:["同步分類","百名店"],lat:33.59,lng:130.42})');await a.run('flushPending()');const rev=a.run('sync.rev');
  const b=page({db,backend,nick:'乙',storage:new Map([['kyushuPlanner.me',JSON.stringify({id:'ZZZZabcd5678',nick:'乙'})]])});await initial(b);assert.equal(b.run(`TAGDEFS.${def}.name`),'同步分類');assert.deepEqual(json(b,`CUSTOMS.${tagged}.tags`),['同步分類','百名店']);assert.match(b.els.tagChips.innerHTML,/同步分類/);
  // Wish-only reconstruction must retain authoritative definitions in both paths.
  a.run('toggleWish("canal","want")');db.beforePut=path=>{const current=db.read(path);current.rev++;(current.wishes??={}).tower={remote:{pool:'want',nick:'丙',at:1}};db.set(path,current);};await a.run('flushPending()');assert(db.tree.kyushu2027.state.tagDefs[def]);await b.run('refreshShared()');
  // Offline queue survives reload and category changes use customs' conflict policy.
  b.owner.online=false;b.run('openCustomForm()');const offline=create(b,'離線分類');b.els.customCancel.onclick();await b.run('flushPending()');b.run('toggleWish("science","maybe")');await b.run('flushPending()');assert.equal(b.run('sync.queue.length'),2);const storage=new Map(b.storage);b.close();const resumed=page({db,backend,storage});await initial(resumed);await resumed.run('flushPending()');assert.equal(resumed.run('sync.queue.length'),0);assert(db.tree.kyushu2027.state.tagDefs[offline]);await a.run('refreshShared()');
  // On Firebase a lost response retries the identical snapshot including tagDefs.
  if(backend==='firebase'){a.run('openCustomForm()');const retry=create(a,'重試分類');a.els.customCancel.onclick();db.dropStateResponse=true;await a.run('flushPending()');assert.equal(a.run('sync.queue.length'),1);await a.run('flushPending()');assert.equal(a.run('sync.queue.length'),0);assert(db.tree.kyushu2027.state.tagDefs[retry]);assert.equal(a.run('stored("kyushuPlanner.conflicts",[]).length'),0);}
  await resumed.run('refreshShared()');resumed.owner.online=false;resumed.run(`saveCustomSpot({zh:"過時修改",cat:"餐廳",tags:["同步分類","百名店"]},"${tagged}")`);await resumed.run('flushPending()');
  const original=json(a,`CUSTOMS.${tagged}`);a.run(`deleteTagDef("${def}")`);await a.run('flushPending()');const dead=db.tree.kyushu2027.state.tagDefs[def];assert(dead.deleted);assert.deepEqual(json(a,`CUSTOMS.${tagged}`),{...original,tags:['百名店']});
  resumed.owner.online=true;await resumed.run('refreshShared()');await resumed.run('flushPending()');assert(resumed.run(`TAGDEFS.${def}.deleted`));assert(db.tree.kyushu2027.state.tagDefs[def].deleted);assert.deepEqual(json(resumed,`CUSTOMS.${tagged}.tags`),['百名店']);assert(resumed.run(`stored("kyushuPlanner.conflicts",[]).at(-1).tagDefs.${def}&&!stored("kyushuPlanner.conflicts",[]).at(-1).tagDefs.${def}.deleted`));
  // A fresh device sees tombstones and never interprets legacy removed tag strings.
  const fresh=page({db,backend});await initial(fresh);assert(fresh.run(`TAGDEFS.${def}.deleted`));const raw=db.read(['kyushu2027','state']);raw.customs[tagged].tags=['同步分類','百名店'];assert.deepEqual(json(fresh,'normalLiveState('+JSON.stringify(raw)+').customs.'+tagged+'.tags'),['百名店']);fresh.close();
  // Historical preview and deliberate restore carry their own definitions, not today's.
  const archived=await a.run(`adapter.version(${rev})`);assert.equal(archived.tagDefs[def].deleted,undefined);assert.deepEqual(Array.from(archived.customs[tagged].tags),['同步分類','百名店']);await a.run(`previewVersion(${rev})`);assert.match(a.els.historyBody.innerHTML,/新增分類「同步分類」/);
  await a.els.historyBody.onclick({target:{closest:()=>({dataset:{},hasAttribute:k=>k==='data-history-restore'})}});await a.run('flushPending()');assert(!a.run(`TAGDEFS.${def}.deleted`));assert.deepEqual(json(a,`CUSTOMS.${tagged}.tags`),['同步分類','百名店']);
  a.els.exportBtn.onclick();const exported=JSON.parse(a.els.mText.value);assert.equal(exported.tagDefs[def].name,'同步分類');a.run('closeAllOverlays()');exported.tagDefs[def]={...exported.tagDefs[def],deleted:true,deletedAt:5,deletedBy:'甲'};assert(a.run('importJSON('+JSON.stringify(JSON.stringify(exported))+')'));await a.run('flushPending()');assert(a.run(`TAGDEFS.${def}.deleted`));assert.deepEqual(json(a,`CUSTOMS.${tagged}.tags`),['百名店']);
  // A new id can reuse the deleted name without changing the old tombstone.
  a.run('openCustomForm()');const again=create(a,'同步分類');assert(again!==def);a.els.customCancel.onclick();await a.run('flushPending()');await resumed.run('refreshShared()');assert(resumed.run(`TAGDEFS.${def}.deleted`));assert.equal(resumed.run(`TAGDEFS.${again}.name`),'同步分類');a.close();resumed.close();
 }
 assert(payloads>15);
 const rules=JSON.parse(fs.readFileSync(path.join(__dirname,'firebase-rules.json'),'utf8')).rules.kyushu2027;for(const container of [rules.state,rules.history.$rev,rules.historyIndex.$rev])assert.deepEqual(container.tagDefs,container.customs);
 console.log('PASS tagDefs: inline +/validation/duplicates/caps, shared creation, multi-select and all tag consumers, pointer hold/cancel/scroll/callout/click/right-click, counted confirmation/tombstones/unchanged spots, Firebase+JSON two-device/offline/rebase/retry/conflict/history/import/export/local cache');
};
