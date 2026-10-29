// Run: node dev/test-planner.cjs — dependency-free DOM/REST harness.
const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),assert=require('assert/strict');
const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8'),script=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!m[1].includes('src='))[0][2].replace(/const SYNC_CFG = \{[^}]*\}/,'const SYNC_CFG = { type: "none", url: "", path: "kyushu2027" }');
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x)),sleep=ms=>new Promise(r=>setTimeout(r,ms));
function compact(v){if(Array.isArray(v)){const a=v.map(compact);while(a.length&&a.at(-1)==null)a.pop();return a.length?a:null;}if(v&&typeof v==='object'){const o={};for(const [k,x]of Object.entries(v)){const n=compact(x);if(n!==null)o[k]=n;}return Object.keys(o).length?o:null;}return v==null?null:v;}
class Database{
 constructor(){this.tree={};this.streams=[];this.beforePut=null;this.writes=0;}
 read(path){let v=this.tree;for(const p of path)v=v?.[p];return clone(v??null);}
 tag(v){return '"'+crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex')+'"';}
 set(path,value){let n=this.tree;for(const p of path.slice(0,-1))n=n[p]??={};const key=path.at(-1);if(value==null)delete n[key];else n[key]=compact(clone(value));this.writes++;for(const s of this.streams){if(s.closed||!s.owner.online)continue;const watched=s.path;if(path.slice(0,watched.length).join('/')===watched.join('/')){s.emit('put',{path:'/'+path.slice(watched.length).join('/'),data:this.read(path)});}}}
 async fetch(owner,url,opts={}){if(!owner.online)throw Error('offline');await sleep(2);const path=new URL(url).pathname.replace(/\.json$/,'').split('/').filter(Boolean);const current=this.read(path),tag=this.tag(current),method=opts.method||'GET';if(method==='PUT'&&path.at(-1)==='state'&&this.beforePut){const cb=this.beforePut;this.beforePut=null;cb(path);}
 const now=this.read(path),nowTag=this.tag(now);if(opts.headers?.['if-match']&&opts.headers['if-match']!==nowTag)return this.response(412,now,nowTag);
 if(this.failPath&&url.includes(this.failPath)){this.failPath=null;throw Error('simulated connection drop');}if(method==='PUT'||method==='DELETE'){this.set(path,method==='DELETE'?null:JSON.parse(opts.body));if(this.dropStateResponse&&path.at(-1)==='state'){this.dropStateResponse=false;throw Error('response lost after commit');}return this.response(200,this.read(path),this.tag(this.read(path)));}const query=new URL(url).searchParams;let data=current;if(query.get('orderBy')==='"$key"'&&data){data=Object.fromEntries(Object.keys(data).sort().slice(-Number(query.get('limitToLast')||200)).map(k=>[k,data[k]]));}return this.response(200,data,opts.headers?.['X-Firebase-ETag']?tag:null);}
 response(status,data,etag){return {ok:status<400,status,json:async()=>clone(data),headers:{get:k=>k.toLowerCase()==='etag'?etag:null}};}
}
// Exercise the production adapter through an in-memory JSON-file REST endpoint.
class JsonfileDatabase extends Database{
 async fetch(owner,url,opts={}){if(!owner.online)throw Error('offline');await sleep(2);const op=new URL(url).searchParams.get('op'),path=['kyushu2027','state'];
  if(op==='state')return this.response(200,this.read(path));
  if(op==='rev'){const {rev,at,by}=this.read(path)||{rev:0};return this.response(200,{rev,at,by});}
  if(op==='save'){const {baseRev,state}=JSON.parse(opts.body);if(this.beforePut){const cb=this.beforePut;this.beforePut=null;cb(path);}const current=this.read(path);if(baseRev!==(current?.rev||0))return this.response(409,{conflict:true,state:current});const entry={...state,rev:baseRev+1,at:Date.now()};this.set(path,entry);this.set(['kyushu2027','history',String(entry.rev).padStart(6,'0')],entry);return this.response(200,{ok:true,state:entry});}
  throw Error('Unexpected JSON-file operation: '+op);
 }
}
class El{
 constructor(id=''){this.id=id;this.value='';this.dataset={};this.style={};this.hidden=false;this.listeners={};this.textContent='';this.innerHTML='';this.open=false;this.classes=new Set;this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),contains:x=>this.classes.has(x),toggle:(x,on)=>{if(on===undefined)on=!this.classes.has(x);on?this.classes.add(x):this.classes.delete(x);}};this.isConnected=true;}
 addEventListener(k,cb){(this.listeners[k]??=[]).push(cb);}querySelector(){return null;}querySelectorAll(){return [];}focus(){}setCustomValidity(s){this.validation=s;}reportValidity(){}hasAttribute(key){return Object.hasOwn(this,key);}getBoundingClientRect(){return {left:parseFloat(this.style.left)||0,top:parseFloat(this.style.top)||0,width:380,height:500};}closest(){return null;}setPointerCapture(){}
}
const instances=[];
function page({db=null,backend='firebase',hostname='127.0.0.1',storage=new Map(),nick='小明',source=script}={}){
 const owner={online:true};const timers=new Set,els={};for(const [,id]of html.matchAll(/\bid="([^"]+)"/g))els[id]=new El(id);
 const notes=new El('notes-body');notes.textContent=html.match(/<div class="notes-body">([\s\S]*?)<\/div><\/details>/)[1].replace(/<[^>]+>/g,'');els.notes.querySelector=()=>notes;
 const tabs=['listPane','planPane','mapPane','wishPane'].map(id=>{const e=new El;e.dataset.tab=id;return e;});const panes=tabs.map(t=>els[t.dataset.tab]);
 if(nick&&!storage.has('kyushuPlanner.me'))storage.set('kyushuPlanner.me',JSON.stringify({id:'ABCDefgh1234',nick}));
 const uri=new URL('http://'+hostname+':8000/'+(db?'?backend='+backend+'&db=http://127.0.0.1:9000':''));
 const context={console,URL,URLSearchParams,AbortController,Uint8Array,crypto:crypto.webcrypto,location:uri,innerWidth:390,innerHeight:844,navigator:{clipboard:{writeText:async t=>{owner.clipboard=t;}}},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},history:{replaceState:(_,__,url)=>{const next=new URL(url,uri);context.location=next;}},document:{getElementById:id=>els[id]??(els[id]=new El(id)),querySelectorAll:q=>q==='nav.tabs button'?tabs:q==='section.pane'?panes:[],querySelector:()=>new El('header'),addEventListener(){},removeEventListener(){},visibilityState:'visible',activeElement:null,documentElement:{style:{setProperty(){}}}},setTimeout:(cb,ms)=>{const id=setTimeout(()=>{timers.delete(id);cb();},ms);timers.add(id);return id;},clearTimeout:id=>{clearTimeout(id);timers.delete(id);},setInterval:()=>1,clearInterval(){},scrollTo(){},addEventListener:(name,cb)=>{(owner.listeners??={})[name]=cb;},confirm:()=>true,prompt:()=>null,alert:msg=>{throw Error('Alert: '+msg);}};
 if(db){context.fetch=(url,opts)=>db.fetch(owner,url,opts);context.EventSource=class{
 constructor(url){this.path=new URL(url).pathname.replace(/\.json$/,'').split('/').filter(Boolean);this.owner=owner;this.listeners={};db.streams.push(this);context.setTimeout(()=>{if(!this.closed){this.onopen?.();this.emit('put',{path:'/',data:db.read(this.path)});}},3);}
 addEventListener(k,cb){(this.listeners[k]??=[]).push(cb);}emit(type,data){for(const cb of this.listeners[type]||[])cb({type,data:JSON.stringify(data)});}close(){this.closed=true;}
 };}else context.fetch=()=>{throw Error('local should not fetch');};
 context.removeEventListener=()=>{};context.window=context;vm.createContext(context);vm.runInContext(source,context);const run=code=>vm.runInContext(code,context);const p={context,run,els,storage,owner,close(){for(const t of timers)clearTimeout(t);run('sync.unsubscribe?.()');}};instances.push(p);return p;
}
const waitFor=async(predicate)=>{for(let i=0;i<100;i++){if(await predicate())return;await sleep(10);}throw Error('timed out');};
const initial=async p=>{await waitFor(()=>p.run('sync.ready'));await p.run('flushPending()');};
(async()=>{
 const p=page({nick:''});await initial(p);assert(p.els.nickModal.classes.has('on'));assert.equal(p.run('ME.id.length'),12);assert.equal(p.els.notes.open,false);assert.equal(p.els.notesSummary.textContent,`⚠️ 注意事項（${(html.match(/<div class="notes-body">([\s\S]*?)<\/div><\/details>/)[1].match(/•/g)||[]).length} 項）`);assert.match(p.els.notesSummary.textContent,/19 項/);assert.equal(p.run('S.days.length'),6);assert.match(p.els.syncStatus.textContent,/本機模式/);
 p.run('renameMe("媽媽<小明>");toggleWish("canal","want")');await p.run('flushPending()');assert.equal(p.run('sync.rev'),1);assert.match(p.run('sync.current.summary'),/許願：媽媽<小明> 好想去/);assert.match(p.els.cards.innerHTML,/媽媽&lt;小明&gt;/);assert(!p.els.cards.innerHTML.includes('媽媽<小明>'));
 p.run('toggleWish("canal","maybe");toggleWish("canal","meh")');await p.run('flushPending()');assert.equal(p.run('sync.rev'),2);const version1=p.run('JSON.stringify(stored(HISTORYKEY,[])[0])');assert.equal(p.run('stored(HISTORYKEY,[])[0].wishes.canal[ME.id].pool'),'want');
 p.run('toggleWish("canal","meh")');await p.run('flushPending()');assert.equal(p.run('sync.rev'),3);assert.match(p.run('sync.current.summary'),/取消許願/);
 p.run('planner.select("tower");planner.moveTo("tower",1)');await sleep(650);assert.equal(p.run('sync.rev'),4);assert.match(p.run('sync.current.summary'),/新增 福岡塔 到 2\/9/);assert.equal(p.run('JSON.stringify(stored(HISTORYKEY,[])[0])'),version1);
 p.run('openDetail("canal")');assert.match(p.els.detailBody.innerHTML,/detailTitle/);p.run('closeDetail()');p.run('document.getElementById("exportBtn").onclick()');assert(Object.hasOwn(JSON.parse(p.els.mText.value),'wishes'));assert.match(p.run('planText()'),/住宿（已訂）/);
 await p.run('openHistory()');assert.match(p.els.historyBody.innerHTML,/#4/);assert.match(p.els.historyBody.innerHTML,/台北/);await p.run('previewVersion(1)');assert.match(p.els.historyBody.innerHTML,/與目前行程比較/);assert.match(p.els.historyBody.innerHTML,/移除 福岡塔/);
 await p.els.historyBody.onclick({target:{closest:()=>({dataset:{},hasAttribute:key=>key==='data-history-restore'})}});await p.run('flushPending()');assert.equal(p.run('sync.rev'),5);assert.equal(p.run('sync.current.summary'),'還原至第 1 版');assert.equal(p.run('WISH.canal[ME.id].pool'),'want');assert(!p.run('selected().has("tower")'));assert.equal(p.run('JSON.stringify(stored(HISTORYKEY,[])[0])'),version1);
 p.run('importJSON(JSON.stringify({v:2,days:[],pool:[]}))');await p.run('flushPending()');assert.equal(p.run('sync.current.summary'),'匯入 JSON');assert.equal(p.run('S.days.length'),6);p.run('document.getElementById("sampleBtn").onclick()');await p.run('flushPending()');assert.equal(p.run('sync.current.summary'),'載入預設行程');p.run('document.getElementById("clearBtn").onclick()');await p.run('flushPending()');assert.equal(p.run('sync.current.summary'),'清空行程');
 for(let i=0;i<102;i++){p.run('S.days[0].label="測試 "+'+i+';update()');await p.run('flushPending()');}assert.equal(p.run('stored(HISTORYKEY,[]).length'),100);assert.equal(p.run('sync.rev'),110);
 const old=JSON.parse(p.run('OLD_DEFAULTS[0]')),oldPlan={days:old[0].map(([label,items])=>({label,items})),pool:old[1]},oldStore=new Map([['kyushuPlanner.v2',JSON.stringify(oldPlan)]]),upgrade=page({storage:oldStore});assert(upgrade.run('fp(S)===fp(sample())'));oldPlan.days[0].label+=' 自訂';oldStore.set('kyushuPlanner.v2',JSON.stringify(oldPlan));const edited=page({storage:oldStore});assert.match(edited.run('S.days[0].label'),/自訂/);
 const v1=page({storage:new Map([['kyushuPlanner.v1',JSON.stringify({days:[{label:'2/7(日)',items:['tower']},{label:'2/9(二)',items:['dazaifu']}],pool:[]})]])});await initial(v1);v1.run('document.getElementById("oldBtn").onclick()');await v1.run('flushPending()');assert.equal(v1.run('sync.current.summary'),'載入舊版存檔');assert(v1.run('S.pool.includes("tower")'));
 // Built-in restaurant category (餐廳): data, ids, map style; custom categories unchanged for api.php allowedCats.
 {const food=JSON.parse(p.run('JSON.stringify(ATTR.filter(a=>a.cat==="餐廳"))'));assert.equal(food.length,29);
  const ids=JSON.parse(p.run('JSON.stringify(ATTR.map(a=>a.id))'));assert.equal(new Set(ids).size,ids.length);
  for(const a of food){assert.match(a.id,/^food_[a-z0-9_]{1,35}$/);assert(Number.isFinite(a.lat)&&Number.isFinite(a.lng));assert(['燒肉','拉麵','其他'].includes(a.tags[0]));assert(a.zh&&a.ja&&a.addr&&a.hours&&a.url&&a.sources.length);}
  const byType=t=>food.filter(a=>a.tags[0]===t).length;assert.equal(byType('燒肉'),7);assert.equal(byType('拉麵'),12);assert.equal(byType('其他'),10);
  assert.equal(p.run('CATEGORY_STYLE["餐廳"].emoji'),'🍜');assert(!p.run('CUSTOM_CATEGORIES.includes("餐廳")'));
  assert.match(html.match(/<select id="cat"[^]*?<\/select>/)[0],/<option>餐廳<\/option>/);assert(!/<option value="餐廳">/.test(html.match(/<select id="customCat"[^]*?<\/select>/)[0]));
  const counts=JSON.parse(p.run('JSON.stringify(ATTR.reduce((m,a)=>(m[a.cat]=(m[a.cat]||0)+1,m),{}))'));assert.deepEqual(Object.keys(counts).sort(),['PS5遊戲片店','安全帽店','樂高店','親子景點','購物街/商圈','餐廳'].sort());
  p.run('openDetail("food_daitoen")');assert.match(p.els.detailBody.innerHTML,/大東園/);p.run('closeDetail()');
  console.log('PASS 餐廳 category: 29 entries (燒肉7/拉麵12/其他10), unique ids, coords, map style, not a custom category',JSON.stringify(counts));}
 // Confirmed lodging labels and public-page privacy.
 assert.match(html,/<div class="sub">🏨 住宿（已訂）：/);
 assert.equal(p.run('HOTEL.zh'),'住宿（已訂）');
 assert(!/住宿（暫定）/.test(html));
 for(const privateValue of ['189,520','189520','1791493524','6222338535','60626719'])assert(!html.includes(privateValue));
 console.log('PASS confirmed lodging header, export and map labels; no booking amount or private identifiers');
 // Confirmed flight labels upgrade only exact old defaults, with no load-time save/version.
 assert(!/tokyo|東京|TYO/i.test(html));assert(!/\.sw(?:[\s.{]|$)|<nav class="sw"/.test(html));
 assert(!/暫定/.test(html.match(/<div class="sub">([^<]+)/)[1]));
 assert(!p.run('DEFAULT_LABELS.some(label=>label.includes("暫定"))'));
 const oldLabels=['2/8(一) 去程 CI116 16:25→19:35（暫定）','2/13(六) 回程 CI117 20:35 起飛（暫定）'];
 const newLabels=['2/8(一) 去程 CI116 桃園T2 16:25→福岡 19:35','2/13(六) 回程 CI117 福岡 20:35→桃園T2 22:20'];
 const flightPlan=JSON.parse(p.run('JSON.stringify(sample())'));flightPlan.days[0].label=oldLabels[0];flightPlan.days[5].label=oldLabels[1];flightPlan.days[1].label='2/9(二) 家人自訂';
 const flightState={rev:7,at:1000,by:'家人',byId:'remote123456',summary:'既有行程',plan:flightPlan,wishes:{}};
 const flightStore=new Map([['kyushuPlanner.v2',JSON.stringify(flightPlan)],['kyushuPlanner.history',JSON.stringify([flightState])]]);
 const localFlights=page({storage:flightStore});await initial(localFlights);
 function confirmedLabels(view){for(const [i,label]of [[0,newLabels[0]],[5,newLabels[1]]]){assert.equal(view.run(`S.days[${i}].label`),label);assert(view.els.days.innerHTML.includes(label));}assert.equal(view.run('S.days[1].label'),'2/9(二) 家人自訂');}
 confirmedLabels(localFlights);
 const renamedPlan=clone(flightPlan);renamedPlan.days[0].label+=' 自訂';renamedPlan.days[5].label=' '+oldLabels[1];
 const renamedFlights=page({storage:new Map([['kyushuPlanner.v2',JSON.stringify(renamedPlan)]])});await initial(renamedFlights);
 assert.equal(renamedFlights.run('S.days[0].label'),renamedPlan.days[0].label);assert.equal(renamedFlights.run('S.days[5].label'),renamedPlan.days[5].label);
 const sharedFlights=[];
 for(const [DB,backend]of [[Database,'firebase'],[JsonfileDatabase,'jsonfile']]){
  const flightsDb=new DB(),key='000007';flightsDb.tree={kyushu2027:{state:clone(flightState),history:{[key]:clone(flightState)},historyIndex:{[key]:{rev:7,at:1000,by:'家人',byId:'remote123456',summary:'既有行程'}}}};
  const view=page({db:flightsDb,backend,storage:new Map([['kyushuPlanner.v2',JSON.stringify(flightPlan)]])});await initial(view);confirmedLabels(view);assert(!view.storage.has('kyushuPlanner.v2.beforeShare'));sharedFlights.push({view,flightsDb});
 }
 await sleep(650);
 for(const view of [localFlights,renamedFlights,...sharedFlights.map(x=>x.view)]){assert.equal(view.run('sync.queue.length'),0);assert.equal(view.run('sync.stage'),null);}
 assert.equal(localFlights.run('sync.rev'),7);assert.equal(flightStore.get('kyushuPlanner.history'),JSON.stringify([flightState]));assert.equal(renamedFlights.run('sync.rev'),0);assert(!renamedFlights.storage.has('kyushuPlanner.history'));
 for(const {view,flightsDb}of sharedFlights){assert.equal(view.run('sync.rev'),7);assert.equal(flightsDb.writes,0);assert.deepEqual(flightsDb.tree.kyushu2027.state,flightState);
  view.run('planner.select("tower")');await view.run('flushPending()');assert.equal(view.run('sync.rev'),8);assert.equal(flightsDb.tree.kyushu2027.state.plan.days[0].label,newLabels[0]);assert.equal(flightsDb.tree.kyushu2027.state.plan.days[5].label,newLabels[1]);assert.deepEqual(flightsDb.tree.kyushu2027.history['000007'],flightState);
  // A concurrent old client can still return old defaults during a real plan conflict.
  view.run('planner.moveTo("teamlab",0)');flightsDb.beforePut=path=>{const current=flightsDb.read(path);current.rev++;current.plan=clone(flightPlan);flightsDb.set(path,current);};await view.run('flushPending()');confirmedLabels(view);assert.equal(view.run('sync.rev'),9);assert.equal(view.run('stored("kyushuPlanner.conflicts",[]).length'),1);
  view.run('acceptState({...sync.current,rev:10,plan:{...sync.current.plan,days:sync.current.plan.days.map((d,i)=>({...d,label:i===0?"家人改名":d.label}))}})');assert.equal(view.run('S.days[0].label'),'家人改名');
 }
 const importedFlights=page();await initial(importedFlights);assert(importedFlights.run('importJSON('+JSON.stringify(JSON.stringify({v:2,...flightPlan}))+')'));await importedFlights.run('flushPending()');confirmedLabels(importedFlights);assert.equal(importedFlights.run('sync.rev'),1);assert.equal(importedFlights.run('sync.current.summary'),'匯入 JSON');
 assert(p.run('diffState('+JSON.stringify(flightState)+',normalState('+JSON.stringify(flightState)+')).filter(change=>change.startsWith("修改日標題")).length===2'));
 console.log('PASS exact flight-label upgrades: local/Firebase/JSON-file load without saves or rev changes, custom labels, next save, immutable history, conflict, import, notes count, Kyushu-only content');
 console.log('PASS local versions, 600 ms debounce, snapshot immutability, diff, preview/restore, JSON/default/clear/v1, 100-version cap, old defaults, escaping');
 const db=new Database(),a=page({db});await initial(a);assert.equal(db.tree.kyushu2027.state.rev,1);assert.match(db.tree.kyushu2027.state.summary,/建立共享行程/);assert(db.tree.kyushu2027.history['000001']);assert(db.tree.kyushu2027.historyIndex['000001']);const original=clone(db.tree.kyushu2027.history['000001']);
 const b=page({db,storage:new Map([['kyushuPlanner.me',JSON.stringify({id:'ZZZZabcd5678',nick:'阿姨'})]])});await initial(b);a.run('planner.moveTo("zoo",1)');await a.run('flushPending()');await waitFor(()=>b.run('S.days[1].items.includes("zoo")'));
 a.run('toggleWish("zoo","want")');await a.run('flushPending()');await waitFor(()=>b.run('!!WISH.zoo?.ABCDefgh1234'));
 b.run('toggleWish("zoo","meh")');await b.run('flushPending()');await waitFor(()=>a.run('!!WISH.zoo?.ZZZZabcd5678'));assert.equal(Object.keys(db.tree.kyushu2027.state.wishes.zoo).length,2);
 a.run('renameMe("新暱稱")');await a.run('flushPending()');await waitFor(()=>b.run('WISH.zoo.ABCDefgh1234.nick==="新暱稱"'));
 a.run('toggleWish("tower","want")');db.beforePut=path=>{const current=db.read(path);current.rev++;current.by='競爭者';current.byId='remote123456';current.plan.pool=['science'];current.wishes.harmony={remote123456:{pool:'want',nick:'競爭者',at:Date.now()}};db.set(path,current);};await a.run('flushPending()');assert(db.tree.kyushu2027.state.wishes.tower.ABCDefgh1234);assert(db.tree.kyushu2027.state.wishes.harmony.remote123456);assert.equal(db.tree.kyushu2027.state.plan.pool[0],'science');assert(a.run('S.pool.includes("science")'));
 // Plan conflict preserves remote and exposes an immutable local candidate in history UI.
 a.run('planner.moveTo("teamlab",0)');db.beforePut=path=>{const current=db.read(path);current.rev++;current.by='競爭者';current.plan.pool=['tower'];db.set(path,current);};await a.run('flushPending()');assert.equal(a.run('S.pool.join(",")'),'tower');assert.match(a.els.toast.textContent,/你的變更可在「版本紀錄」找到/);assert.equal(a.run('stored("kyushuPlanner.conflicts",[]).length'),1);await a.run('openHistory()');assert.match(a.els.historyBody.innerHTML,/衝突備份/);assert.deepEqual(db.tree.kyushu2027.history['000001'],original);
 // Conditional history repair after a connection drop cannot lose an accepted state.
 a.run('planner.moveTo("ohori",2)');db.failPath='/history/'+String(db.tree.kyushu2027.state.rev+1).padStart(6,'0');await a.run('flushPending()');const repairRev=db.tree.kyushu2027.state.rev;await a.run('adapter.load()');assert(db.tree.kyushu2027.history[String(repairRev).padStart(6,'0')]);assert(db.tree.kyushu2027.historyIndex[String(repairRev).padStart(6,'0')]);
 // A successful commit whose response was lost is recognized rather than saved twice or flagged as a conflict.
 a.run('planner.moveTo("lalaport",3)');db.dropStateResponse=true;await a.run('flushPending()');const committed=db.tree.kyushu2027.state.rev;assert.equal(a.run('sync.queue.length'),1);await a.run('flushPending()');assert.equal(a.run('sync.queue.length'),0);assert.equal(db.tree.kyushu2027.state.rev,committed);
 // Two separately debounced offline batches survive a page reload and upload in order.
 a.owner.online=false;a.run('planner.moveTo("teamlab",4)');await a.run('flushPending()');a.run('toggleWish("teamlab","want")');await a.run('flushPending()');assert.equal(a.run('sync.queue.length'),2);assert.match(a.els.syncStatus.textContent,/離線/);const saved=new Map(a.storage);a.close();const reload=page({db,storage:saved});await initial(reload);await reload.run('flushPending()');assert(db.tree.kyushu2027.state.plan.days[4].items.includes('teamlab'));assert.equal(db.tree.kyushu2027.state.wishes.teamlab.ABCDefgh1234.pool,'want');assert.equal(reload.run('sync.queue.length'),0);
 // An offline wish followed by a plan edit must not overwrite a newer plan when the wish rebases.
 reload.owner.online=false;reload.run('toggleWish("canal","want")');await reload.run('flushPending()');reload.run('planner.moveTo("teamlab",0)');await reload.run('flushPending()');await b.run('refreshShared()');b.run('planner.moveTo("tower",5)');await b.run('flushPending()');reload.owner.online=true;await reload.run('flushPending()');assert(reload.run('S.days[5].items.includes("tower")'));assert(!reload.run('S.days[0].items.includes("teamlab")'));assert(reload.run('stored("kyushuPlanner.conflicts",[]).length>=2'));
 const local=page();await initial(local);local.run('planner.moveTo("lalaport",0)');await local.run('flushPending()');const joined=page({db,storage:new Map(local.storage)});await initial(joined);assert(joined.storage.has('kyushuPlanner.v2.beforeShare'));assert(!joined.els.beforeShareBtn.hidden);
 b.run('dragging=true');const before=b.els.days.innerHTML;reload.run('planner.moveTo("higashihirao",2)');await reload.run('flushPending()');await sleep(30);assert.equal(b.els.days.innerHTML,before);assert(b.run('renderQueued'));b.run('dragging=false;acceptMirror()');assert(b.run('S.days[2].items.includes("higashihirao")'));
 const histories=await reload.run('adapter.history(2)');assert.equal(histories.length,2);assert(histories[0].rev>histories[1].rev);assert(!Object.hasOwn(histories[0],'plan'));assert.deepEqual(db.tree.kyushu2027.history['000001'],original);
 reload.run('document.getElementById("shareBtn").onclick()');assert.equal(reload.owner.clipboard,'http://127.0.0.1:8000/');const prod=page({db,hostname:'yang8073.github.io'});await initial(prod);assert.equal(prod.run('shared()'),false);

 // 自訂景點（Custom Spots）測試
 // 1. Old state without customs loads; payload omits customs when empty
 const legacy=reload.run('normalState({rev:1,at:1000,by:"老友",byId:"olddev123456",summary:"舊行程",plan:{days:[{id:"d1",label:"第1天",items:["canal"]}],pool:[]},wishes:{}})')
 assert(legacy&&legacy.customs&&Object.keys(legacy.customs).length===0);
 assert(!Object.hasOwn(db.tree.kyushu2027.state,'customs'));

 // 2. Adding a custom spot creates a version and syncs to a second device
 const revBeforeAdd=db.tree.kyushu2027.state.rev;
 const cid=reload.run('saveCustomSpot({zh:"博多一雙拉麵",cat:"購物街/商圈",area:"博多",addr:"福岡市博多區博多駅東3-1-6",lat:33.588,lng:130.422,note:"濃郁豚骨",url:"https://example.com/ramen"})');
 assert(cid&&cid.startsWith("u_"));
 await reload.run('flushPending()');
 assert.equal(db.tree.kyushu2027.state.rev,revBeforeAdd+1);
 assert.match(db.tree.kyushu2027.state.summary,/新增自訂景點：博多一雙拉麵/);
 assert.equal(db.tree.kyushu2027.state.customs[cid].zh,"博多一雙拉麵");
 const plannedRevBase=db.tree.kyushu2027.state.rev;

 await waitFor(()=>b.run('!!planner.customs["'+cid+'"]'));
 assert.equal(b.run('BY["'+cid+'"].zh'),"博多一雙拉麵");
 assert.equal(b.run('BY["'+cid+'"].cat'),"購物街/商圈");
 assert.equal(b.run('BY["'+cid+'"].custom'),true);

 // 3. Custom spot can be added to a day and wished
 reload.run('planner.moveTo("'+cid+'",1)');
 reload.run('toggleWish("'+cid+'","want")');
 await reload.run('flushPending()');
 await waitFor(()=>b.run('S.days[1].items.includes("'+cid+'")'));
 await waitFor(()=>b.run('WISH["'+cid+'"]?.ABCDefgh1234?.pool === "want"'));
 b.run('toggleWish("'+cid+'","maybe")');
 await b.run('flushPending()');
 await waitFor(()=>reload.run('WISH["'+cid+'"]?.ZZZZabcd5678?.pool === "maybe"'));
 const restoreTargetRev=db.tree.kyushu2027.state.rev;

 // 4. Deleting removes it from plan and wishes on both devices
 reload.run('deleteCustomSpot("'+cid+'")');
 await reload.run('flushPending()');
 assert.match(db.tree.kyushu2027.state.summary,/刪除自訂景點：博多一雙拉麵/);
 assert(!reload.run('S.days[1].items.includes("'+cid+'")'));
 assert(!reload.run('!!WISH["'+cid+'"]'));
 assert(!reload.run('!!BY["'+cid+'"]'));
 await waitFor(()=>b.run('!planner.customs["'+cid+'"]'));
 assert(!b.run('S.days[1].items.includes("'+cid+'")'));
 assert(!b.run('!!WISH["'+cid+'"]'));
 assert(!b.run('!!BY["'+cid+'"]'));

 // 5. Restore of an earlier version brings back a deleted custom spot
 await reload.run('openHistory()');
 await reload.run('previewVersion('+restoreTargetRev+')');
 await reload.els.historyBody.onclick({target:{closest:()=>({dataset:{},hasAttribute:key=>key==="data-history-restore"})}});
 await reload.run('flushPending()');
 assert.match(reload.run('sync.current.summary'),new RegExp('還原至第 '+restoreTargetRev+' 版'));
 assert.equal(reload.run('BY["'+cid+'"]?.zh'),"博多一雙拉麵");
 assert(reload.run('S.days[1].items.includes("'+cid+'")'));
 assert.equal(reload.run('WISH["'+cid+'"]?.ABCDefgh1234?.pool'),"want");
 await waitFor(()=>b.run('!!planner.customs["'+cid+'"]'));
 assert.equal(b.run('BY["'+cid+'"]?.zh'),"博多一雙拉麵");
 assert(b.run('S.days[1].items.includes("'+cid+'")'));

 console.log('PASS Firebase initial migration, unified two-device sync, wish conflict merge, plan conflict draft, archive repair, offline batch/reload, pre-share backup, drag deferral, history index, plain share URL, production override guard, custom spots sync/plan/wish/delete/restore/compat');
 for(const x of instances)x.close();
})().catch(e=>{for(const x of instances)x.close();console.error(e);process.exitCode=1;});
