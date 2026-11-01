// Called by test-planner.cjs; no network or third-party dependencies.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
module.exports=async function({html,page,initial,sleep}){
 const root=path.join(__dirname,'..'),swPath=path.join(root,'sw.js');
 assert(fs.existsSync(swPath));const sw=fs.readFileSync(swPath,'utf8');
 assert.match(sw,/kfp-v\d+-\d{8}/);assert.match(sw,/const CACHE_VERSION = 'kfp-v7-20261102';/);assert.match(sw,/api\.php/);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
 assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./');assert.match(html,/rel="manifest" href="\.\/manifest.webmanifest"/);
 const p=page();await initial(p);
 const docs=JSON.parse(p.run('JSON.stringify(TRAVEL_DOCUMENTS)'));
 assert.deepEqual(docs.map(g=>g.id),['lodging','flights']);
 assert.deepEqual(docs[0].files.map(f=>f[0]),["禁菸高級雙床房 入住憑證","禁菸高級雙床房 英文入住憑證","禁菸高級雙床房 電子收據","禁菸標準雙人房（僅淋浴） 入住憑證","禁菸標準雙人房（僅淋浴） 英文入住憑證","禁菸標準雙人房（僅淋浴） 電子收據","訂單總覽截圖"]);
 assert.deepEqual(docs[1].files.map(f=>f[0]),["Lee Yang Mr (ADT)","Chen Jiefei Ms (ADT)","Li Yunna Miss (CHD)","Li Niansin Miss (CHD)","Tung Yihsiang Mr (ADT)","Mo Shihyi Ms (ADT)","Tung Weiche Mstr (CHD)"]);
 assert.equal(docs[0].files.length,7);assert.equal(docs[1].files.length,7);
 const allURLs=docs.flatMap(g=>[g.folder,...g.files.map(f=>f[1])]);assert.equal(new Set(allURLs).size,16);
 for(const url of allURLs)assert.match(url,/^https:\/\/drive\.google\.com\/(file\/d\/[-\w]+\/view|drive\/folders\/[-\w]+)$/);
 // Assert link destinations as a single fingerprint, without fetching documents.
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(allURLs)).digest('hex'),'12d5b7690cfb0b696ac6b354a8bb33b4cc77e23dad696c4e03f50849cbfc20e2');
 const before=p.run('JSON.stringify(snapshot())'),rev=p.run('sync.rev');
 const hotelTrigger=p.els.hotelDocsBtn,flightTrigger=p.els.flightDocsBtn;
 assert.equal(hotelTrigger.href,docs[0].folder);
 let prevented=false;p.els.hotelDocsBtn.onclick({currentTarget:hotelTrigger,preventDefault(){prevented=true;}});assert(prevented);
 assert(p.els.documentsPanel.classes.has('on'));assert.equal(p.context.document.activeElement,p.els.documentsClose);
 assert.match(p.els.documentsGroups.innerHTML,/<details id="documents-lodging" open>/);
 assert.equal((p.els.documentsGroups.innerHTML.match(/target="_blank" rel="noopener"/g)||[]).length,16);
 p.els.documentsClose.onclick();assert(!p.els.documentsPanel.classes.has('on'));assert.equal(p.context.document.activeElement,hotelTrigger);
 flightTrigger.onclick({currentTarget:flightTrigger});assert.match(p.els.documentsGroups.innerHTML,/<details id="documents-flights" open>/);
 const stops=[p.els.documentsClose,flightTrigger];p.els.documentsPanel.querySelectorAll=()=>stops;
 for(const [active,shiftKey,expected]of [[stops[0],true,stops[1]],[stops[1],false,stops[0]]]){
  p.context.document.activeElement=active;const event={key:'Tab',shiftKey,target:active,preventDefault(){this.prevented=true;}};
  for(const cb of p.owner.docListeners.keydown)cb(event);assert(event.prevented);assert.equal(p.context.document.activeElement,expected);
 }
 for(const cb of p.owner.docListeners.keydown)cb({key:'Escape',target:p.els.documentsClose,preventDefault(){}});
 assert(!p.els.documentsPanel.classes.has('on'));assert.equal(p.context.document.activeElement,flightTrigger);
 assert.equal(p.run('JSON.stringify(snapshot())'),before);assert.equal(p.run('sync.rev'),rev);
 assert.match(html,/min-height:4[04]px/);assert.match(html,/本頁可離線開啟，但雲端文件需先在 Drive App 設為離線/);
 assert.equal(p.run('HOTEL.lat'),33.591782);assert.equal(p.run('HOTEL.lng'),130.418198);
 assert.match(p.run('planText()'),/博多東急REI飯店/);assert.match(p.run('planText()'),/2\/13 10:00 前退房/);
 assert(!/quintessa|クインテッサ|292-6728|博多駅東 2-9-29|退房 11:00/i.test(html));
 assert.match(html,/每人託運 2 件（收據 2PC）/);assert.match(html,/已劃位/);
 assert.match(html,/2027\/2\/6 23:59/);assert.match(html,/每張床1名/);
 // Passenger names and room types are intentionally allowed in document labels (owner decision 2026-11-01).
 // Sensitive regression fingerprints are stored only as hashes, never raw data.
 const privateHashes={"3":["64f46a7526a186d2346552453ae478ca51244674f5b21ba150bd483b39f7c812"],"4":["c525ed5e2d690bd809986eb6b290805424e3eb90fc0d3de96c1eec2f13055c8b","82dab8cbf876dfb4eff990c10dde8d6317153b53176cab24c510199a52557fd0"],"5":["38bfc7bf50463aead2d374f8a8ffb75a08736dcac70005a5aa90082ba5aa131a","d9efadc641143c39a833aef978e67bc7b923ccd4831dfad4a10e94a893aac9bc"],"6":["0ed5111b142a088fade48bc3b734590e71e43aeb652652f75f58eaa90fb81d3b","83aadf2dae811b16151abadce79ca01a5d666a1def6552ba662e0d625d646b2e","65d43eb60094479dedb6c38bbdf33ab11cfbb05f4d462d597bf29620b3ced1cc","3cd628a142ac114cc8e9b38bed88c7af4766f2fd3d73ff653c21ab15a5779cec","69ea8bef8f8fcfab9612db048c4ca3cf9921dde54a72eed4972d6093f1140f0c"],"7":["936d5448e00798f30d2d7f20bb538cdb89436cc6ddcc45d0871c4da7f981f680"],"8":["81aa677dc42bce08f10103ad08607b48632d56dbb29de8259a28def6b9cee004"],"10":["f7f0a55613add875dd73402469949983c683dbd13df6ce95c3e3027681a7339f","1d9feffdb70b827e21b3178a1730822685811f3c6122e08ec6114ff473a96dca","45f95043884d30e3edc0ac2e618b1ee7080659ad0dd44654cfde4c04b48d1cdb","3cab88837fff9e467b3e2adec3432c97325e9fb40367643f84a153e0b60c211b","4d6ce9e97b25f881868290ede9c0d6a983e7b5b63575043bbcf4378332f9165f","55c52f31849213b9dfb2c95ec3f6efb9443c51eb45f88298a8ff359252928eb2","41d386fce6f8a12bd3197b52917f012ee4cad03e551c53771929b725d7e96301","1323978e1e427fcaeb611877e2a69512321296fa523fcea50049c21f4551f59f","c0da5a63a634c23fe18ea4b5a821991e83c7428bf70508d9885837a9989886e4","cba587e48bd1f69929e636764762a5bfc1594e54096598b9b73cc966ef59ce88"],"13":["e2e007446f366ac01a3ab9cb773e5d8aec42db02089c7d4ae36592edb1cc0bf2","5e169624f92597c8ffffc07ce4aa0816adcee0b19afd17f0280e8fa31807c434","912cb24b53ee855dec2b92d08014307775deba3555da9804d52b49850f3c1dfa","c9a8ef7ffba56c788d403e75187ef671a72ec77fa0c78e561acdccc2063c1959","cdaf91ade73e0ba0d6d7ae27972e908551a01cb7c96cb7ca535ddc162be9d07a","8ddb728f401421b8f69cff57f807343127424bfdf7d5e4fd3406079097b45f33","d595a84f454a4cef6944adaeccaf45592e4fbdb4aa7dd999d39cd3797e23e971"],"16":["2b515eeadd63033b59a26837d3f40a01bfe239a8fb65a17361168083bf95db12","504cbbae0443941102b065641e1bbadd746ef3f41290ca98627be0a8fc134063"]};
 function assertPublicPrivacy(html){
  // Exempt only the exact asserted document labels; keep all other fingerprint checks.
  const allowedLabels=new Set(docs.flatMap(g=>g.files.map(f=>f[0])));
  const scanSource=html.replace(/const TRAVEL_DOCUMENTS = \[[\s\S]*?\n\];/,section=>section.replace(/\["([^"]+)",/g,(entry,label)=>allowedLabels.has(label)?entry.replace(label,' '.repeat(label.length)):entry));
  const parts=[],offsets=[];
  for(let i=0;i<scanSource.length;i++)if(!/[\s,]/.test(scanSource[i])){parts.push(scanSource[i].toLowerCase());offsets.push(i);}
  const normalized=parts.join('');
  const pinLabelStarts=new Set([...html.matchAll(/\bPIN\b\s*(?:\d|[:：])/gi)].map(match=>match.index));
  for(const [length,hashes]of Object.entries(privateHashes)){
   const denied=new Set(hashes),size=Number(length);
   for(let i=0;i<=normalized.length-size;i++){
    const value=normalized.slice(i,i+size);if(!/^[a-z0-9]+$/.test(value))continue;
    // The map helper/classes use pin; reject it only as a credential label.
    if(value==='pin'&&!pinLabelStarts.has(offsets[i]))continue;
    // Alphabetic private values match words; public domains may contain matching syllables.
    if(/^[a-z]+$/.test(value)&&(/[a-z]/i.test(html[offsets[i]-1]||'')||/[a-z]/i.test(html[offsets[i+size-1]+1]||'')))continue;
    assert(!denied.has(crypto.createHash('sha256').update(value).digest('hex')),'Public page contains a forbidden private value');
   }
  }
  const publicText=html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,'');
  assert(!/(?:訂單|訂房|確認|機票|票券|座位)(?:編號|號碼)\s*[:：]|\bPNR\s*[:：]|\b\d{3}[- ]?\d{10}\b|\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b/i.test(publicText));
 }
 assertPublicPrivacy(html);
 // Synthetic examples verify the scan still rejects private labels and ticket-number patterns.
 for(const text of ["PNR: ABC123","297 1234567890"])assert.throws(()=>assertPublicPrivacy(text),assert.AssertionError);

 // Registration, update notification and offline events do not replace sync UI.
 const worker={state:'installing',addEventListener(k,cb){this[k]=cb;}};
 const reg={active:{},installing:worker,addEventListener(k,cb){this[k]=cb;}};
 const registrations=[],serviceWorker={controller:{},register:async(...args)=>{registrations.push(args);return reg;}};
 const online=page({serviceWorker,protocol:'https:',hostname:'example.test',pathname:'/kyushu-family-planner/'});await initial(online);await sleep(0);
 assert.equal(registrations[0][0],'./sw.js');assert.equal(registrations[0][1].scope,'./');
 const syncLabel=online.els.syncStatus.textContent;
 online.owner.online=false;await online.owner.listeners.offline();assert(!online.els.offlineIndicator.hidden);assert.equal(online.els.syncStatus.textContent,syncLabel);
 online.owner.online=true;await online.owner.listeners.online();assert(online.els.offlineIndicator.hidden);
 worker.state='installed';worker.statechange();assert(!online.els.pwaUpdate.hidden);assert.equal(online.els.toast.textContent,'已更新，重新整理即可使用新版');
 const firstWorker={...worker,state:'installing'},firstReg={...reg,active:null,installing:firstWorker};
 const first=page({serviceWorker:{controller:null,register:async()=>firstReg}});await initial(first);await sleep(0);firstWorker.state='installed';firstWorker.statechange();assert(first.els.pwaUpdate.hidden);
 const deniedCalls=[];const unsafe=page({hostname:'example.test',serviceWorker:{register:async()=>deniedCalls.push(1)}});await initial(unsafe);assert.equal(deniedCalls.length,0);
 const failed=page({serviceWorker:{register:async()=>{throw Error('unavailable');}}});await initial(failed);assert(failed.run('sync.ready'));
 await testWorker(sw);
 console.log('PASS REI hotel, public document links/privacy, accessible document panel, PWA registration/update/offline status; SW shell/CDN caching, timeout, exclusions and tile cap');
};

async function testWorker(source){
 const scope='https://example.test/kyushu-family-planner/',stores=new Map(),handlers={},requests=[];
 const key=request=>typeof request==='string'?request:request.url;
 class Cache{
  constructor(){this.data=new Map();}
  async match(r){return this.data.get(key(r))?.clone();}
  async put(r,v){this.data.set(key(r),v.clone());}
  async keys(){return [...this.data.keys()].map(url=>new Request(url));}
  async delete(r){return this.data.delete(key(r));}
  async addAll(urls){for(const r of urls)await this.put(r,new Response('precache:'+key(r)));}
 }
 const caches={open:async name=>{if(!stores.has(name))stores.set(name,new Cache());return stores.get(name);},keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name)};
 let network=async request=>new Response('network:'+key(request)),skipped=0,claimed=0;
 const context={URL,Request,Response,AbortController,Promise,console,caches,setTimeout:(cb,ms)=>setTimeout(cb,Math.min(ms,15)),clearTimeout,
  fetch:async(request,options)=>{requests.push(key(request));return network(request,options);},
  self:{registration:{scope},location:new URL(scope),skipWaiting:async()=>skipped++,clients:{claim:async()=>claimed++},addEventListener:(name,cb)=>handlers[name]=cb}};
 vm.createContext(context);vm.runInContext(source,context);
 const value=code=>vm.runInContext(code,context);
 async function lifecycle(type){const pending=[];handlers[type]({waitUntil:p=>pending.push(p)});await Promise.all(pending);}
 async function dispatch(url,extra={}){
  const pending=[],event={request:{url:new URL(url,scope).href,method:'GET',mode:'cors',destination:'',...extra},waitUntil:p=>pending.push(p),respondWith:p=>event.response=p};
  handlers.fetch(event);const response=await event.response;await Promise.all(pending);return response;
 }
 await lifecycle('install');assert.equal(skipped,1);assert.equal(requests.length,3);
 const shell=await caches.open(value('SHELL_CACHE')),assets=await caches.open(value('STATIC_CACHE'));
 for(const suffix of ['', 'index.html','manifest.webmanifest'])assert(await shell.match(scope+suffix));
 for(const url of value('CDN_ASSETS'))assert(await assets.match(url));
 stores.set('kfp-v0-20261031-shell',new Cache());for(const suffix of ['shell','static','tiles'])stores.set('kfp-v1-20261101-'+suffix,new Cache());stores.set('another-app',new Cache());await lifecycle('activate');for(const suffix of ['shell','static','tiles'])assert(!stores.has('kfp-v1-20261101-'+suffix));assert.equal(claimed,1);assert(!stores.has('kfp-v0-20261031-shell'));assert(stores.has('another-app'));
 for(const [url,extra]of [
  ['https://trip.yi-jia-zi.com/api.php?op=state',{}],['./api.php?op=rev',{}],['./index.html?file=api.php',{}],
  ['https://drive.google.com/file/d/public/view',{}],['https://accounts.google.com/login',{}],['./index.html',{method:'POST'}],
  ['https://example.test/another-app/data.js',{}],['https://unrelated.test/data.js',{}],['./state.json',{}]
 ]){const count=requests.length;assert.equal(await dispatch(url,extra),undefined);assert.equal(requests.length,count);}
 let response=await dispatch('./',{mode:'navigate'});assert.equal(await response.text(),'network:'+scope);
 network=async()=>{throw Error('offline');};response=await dispatch('./index.html?view=map',{mode:'navigate'});assert.equal(await response.text(),'network:'+scope);
 network=async()=>new Response('bad',{status:503});response=await dispatch('./',{mode:'navigate'});assert.equal(await response.text(),'network:'+scope);
 network=async(_,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout'))));
 response=await dispatch('./',{mode:'navigate'});assert.equal(await response.text(),'network:'+scope);
 const css=value('CDN_ASSETS[0]');network=async()=>new Response('fresh css');response=await dispatch(css);assert.match(await response.text(),/^network:/);assert.equal(await (await assets.match(css)).text(),'fresh css');
 network=async()=>{throw Error('offline');};assert.equal(await (await dispatch(css)).text(),'fresh css');assert(await dispatch('./manifest.webmanifest'));
 // Opaque CDN/tile responses are accepted without requiring ok === true.
 const opaque={ok:false,type:'opaque',clone(){return {...this};}};network=async()=>opaque;
 assert.equal((await dispatch('https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png')).type,'opaque');
 network=async()=>new Response('tile');const tileURL=i=>`https://a.tile.openstreetmap.org/15/${i}/1.png`;
 await Promise.all(Array.from({length:305},(_,i)=>dispatch(tileURL(i))));
 const tiles=await caches.open(value('TILE_CACHE'));assert.equal((await tiles.keys()).length,300);assert.equal(await tiles.match(tileURL(0)),undefined);
 const count=requests.length;network=async()=>{throw Error('offline');};assert.equal(await (await dispatch(tileURL(304))).text(),'tile');assert.equal(requests.length,count);
}
