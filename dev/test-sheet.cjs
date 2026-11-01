// Called by test-planner.cjs; real sheet handlers + static DOM ancestry, offline.
const assert=require('assert/strict');
module.exports=async function({html,page,initial,sleep,leaflet}){
 const p=page();await initial(p);const decide=p.context.planner.sheetGesture;
 assert.equal(decide(),'none');assert.equal(decide({state:'unknown',dy:-80}),'none');
 for(const state of ['normal','expanded'])for(const scrollTop of [-3,0,.5,100]){
  for(const dy of [-31.9,-1,0,1,31.9,NaN,Infinity,-Infinity])assert.equal(decide({state,scrollTop,dy}),'none');
  for(const dy of [-200,-32,32,200]){
   assert.equal(decide({state,scrollTop,dy,startOnMap:true}),'none');
   assert.equal(decide({state,scrollTop,dy}),state==='normal'?(dy<0?'expand':'none'):(dy>0&&scrollTop<=0?'collapse':'scroll'));
  }
 }
 const depth=q=>q.run('overlayStack.length'),expanded=q=>q.run('overlayTop().expanded');
 function touch(target,type,dy=0,extra={}){const point={identifier:1,clientX:100,clientY:400+dy},e={type,bubbles:true,cancelable:true,touches:type==='touchend'||type==='touchcancel'?[]:[point],defaultPrevented:false,preventDefault(){assert.equal(type,'touchmove');this.defaultPrevented=true;},...extra};target.dispatchEvent(e);return e;}
 function swipe(target,dy){touch(target,'touchstart');const e=touch(target,'touchmove',dy);touch(target,'touchend',dy);return e;}
 function transition(surface,propertyName='height',target=surface){surface.dispatchEvent({type:'transitionend',bubbles:true,target,propertyName});}
 const surface=(q,id)=>q.els[id].querySelector('.box')||q.els[id];
 p.run('openNearby("hotel")');const panel=p.els.nearbyPanel,body=p.els.nearbyBody,box=surface(p,'nearbyPanel');
 const plan=p.run('JSON.stringify(snapshot())'),rev=p.run('sync.rev');
 assert.equal(expanded(p),false);assert(body.classes.has('sheet-scroll'));assert(box.classes.has('sheet-surface'));
 // Map/button/hint and header are siblings of the only scrolling region.
 assert.equal(p.els.nearbyMap.parentElement,p.els.nearbyMapRegion);assert.equal(p.els.nearbyMapRegion.parentElement,box);
 assert(!body.contains(p.els.nearbyMap));assert(!body.contains(p.els.nearbyBigMap));assert(!body.contains(p.els.nearbyTitle));
 for(const id of ['nearbySearch','nearbySearchClear','nearbyCount'])assert(p.els.nearbySearchBar.contains(p.els[id]));
 assert(body.contains(p.els.nearbySearchBar));assert(body.contains(p.els.nearbyRows));
 assert.match(html,/#nearbySearchBar\{[^}]*position:sticky;top:0/);assert.match(html,/height:100vh!important;height:100dvh!important/);
 for(const edge of ['top','right','bottom','left'])assert(html.includes('env(safe-area-inset-'+edge+')'));
 assert.match(html,/@media\(prefers-reduced-motion:reduce\)\{\.sheet-surface\{transition:none/);
 assert.match(html,/\.sheet-scroll\{[^}]*overscroll-behavior:contain/);
 assert.equal(panel.listenerOptions.touchstart[0].passive,true);assert.equal(panel.listenerOptions.touchmove[0].passive,false);
 for(const type of ['touchend','touchcancel'])assert.equal(panel.listenerOptions[type][0].passive,true);
 // Small movement keeps taps alive; a normal upward gesture is locked until lift.
 assert(!touch(body,'touchstart').defaultPrevented);assert(panel.classes.has('sheet-gesture'));
 assert(!touch(body,'touchmove',-20).defaultPrevented);assert(!expanded(p));
 assert(touch(body,'touchmove',-32).defaultPrevented);assert(expanded(p));assert.equal(body.scrollTop,0);
 assert(touch(body,'touchmove',100).defaultPrevented);assert(expanded(p),'reversing a consumed gesture cannot collapse');
 touch(body,'touchend');assert(!panel.classes.has('sheet-gesture'));assert(panel.classes.has('sheet-expanded'));
 // Later swipes scroll normally. A downward gesture only collapses at the top.
 assert(!swipe(body,-90).defaultPrevented);assert(expanded(p));body.scrollTop=120;
 assert(!swipe(body,100).defaultPrevented);assert(expanded(p));body.scrollTop=0;
 assert(swipe(body,80).defaultPrevented);assert(!expanded(p));assert.equal(depth(p),1);
 for(let i=0;i<3;i++){assert(!swipe(body,100).defaultPrevented);assert(!expanded(p));assert.equal(depth(p),1);}
 // Header and buttons can initiate an expansion, but taps never change state.
 assert(!swipe(p.els.nearbyClose,-8).defaultPrevented);assert(!expanded(p));
 assert(swipe(p.els.nearbyTitle,-80).defaultPrevented);assert(expanded(p));swipe(body,80);
 // Horizontal, multi-touch and cancellation release the temporary scroll lock.
 touch(body,'touchstart');assert(!touch(body,'touchmove',-20,{touches:[{clientX:180,clientY:380}]}).defaultPrevented);assert(!panel.classes.has('sheet-gesture'));touch(body,'touchend');
 touch(body,'touchstart');assert(!touch(body,'touchmove',-90,{touches:[{},{}]}).defaultPrevented);assert(!panel.classes.has('sheet-gesture'));touch(body,'touchend');assert(!expanded(p));
 touch(body,'touchstart');touch(body,'touchcancel');assert(!panel.classes.has('sheet-gesture'));assert(swipe(body,-80).defaultPrevented);assert(expanded(p));
 swipe(body,80);touch(body,'touchstart');assert(!touch(body,'touchmove',-80,{cancelable:false}).defaultPrevented);touch(body,'touchend');assert(!expanded(p));
 // Map-start gestures stay ignored even after moving out over the list.
 for(const dy of [-120,120]){touch(p.els.nearbyMap,'touchstart');assert(!panel.classes.has('sheet-gesture'));assert(!touch(body,'touchmove',dy).defaultPrevented);touch(body,'touchend');assert(!expanded(p));}
 touch(p.els.nearbyMap,'touchstart',0,{touches:[{},{}]});assert(!touch(p.els.nearbyMap,'touchmove',-80,{touches:[{},{}]}).defaultPrevented);touch(p.els.nearbyMap,'touchend');assert(!expanded(p));
 p.els.nearbyRows.classes.add('leaflet-container');assert(!swipe(p.els.nearbyRows,-80).defaultPrevented);p.els.nearbyRows.classes.delete('leaflet-container');assert(!expanded(p));
 // An input gesture preserves native editing; focus expands without replacing it.
 const input=p.els.nearbySearch;assert(!swipe(input,-100).defaultPrevented);assert(!expanded(p));input.focus();assert(expanded(p));assert.equal(p.context.document.activeElement,input);
 input.value='燒肉';input.oninput({});const result=p.els.nearbyRows.innerHTML;body.scrollTop=257;
 // Children inherit expanded, then keep independent height/query/scroll state.
 p.run('openDetail("canal")');assert(expanded(p));p.els.detailBody.scrollTop=143;
 p.run('openNearby("canal")');assert(expanded(p));assert.equal(input.value,'');
 assert(swipe(body,90).defaultPrevented);assert(!expanded(p));input.value='住宿';input.oninput({});
 input.focus();assert(expanded(p));swipe(body,90);assert(!expanded(p));assert.equal(p.context.document.activeElement,input);body.scrollTop=92;
 p.run('openDetail("tower")');assert(!expanded(p));assert(swipe(p.els.detailHead,-90).defaultPrevented);assert(expanded(p));
 p.els.detailBack.onclick();assert(!expanded(p),'restoring input focus must preserve the layer height');assert.equal(p.context.document.activeElement,input);assert.equal(input.value,'住宿');assert.equal(body.scrollTop,92);
 p.els.nearbyBack.onclick();assert(expanded(p));assert.equal(p.els.detailBody.scrollTop,143);
 await sleep(20);p.context.history.back();await sleep(20);assert.equal(p.run('overlayTop().kind'),'nearby');assert(expanded(p));assert.equal(input.value,'燒肉');assert.equal(body.scrollTop,257);assert.equal(p.els.nearbyRows.innerHTML,result);
 assert.equal(p.run('JSON.stringify(snapshot())'),plan);assert.equal(p.run('sync.rev'),rev);p.run('closeAllOverlays()');await sleep(20);
 // Every other layer shares the same header/scroll behavior, even without Leaflet.
 for(const [open,id,scroll]of [['openDetail("canal")','detailPanel','detailBody'],['openDocuments()','documentsPanel','documentsBody'],['openHistory()','historyPanel','historyBody'],['openCustomForm()','customModal','customBody'],['openNick()','nickModal','nickBody'],['openModal("測試","文字",null)','modal','mText']]){
  await p.run(open);const node=p.els[id],head=node.querySelector('.detail-head')||node.querySelector('.overlay-tools');assert(head);assert(p.els[scroll].classes.has('sheet-scroll'));assert(!p.els[scroll].contains(head));
  assert(swipe(head,-80).defaultPrevented);assert(expanded(p));p.els[scroll].scrollTop=0;assert(swipe(head,80).defaultPrevented);assert(!expanded(p));assert.equal(depth(p),1);p.run('closeAllOverlays()');await sleep(10);
 }
 // Lock body/root while stacked; restore their previous styles and page offset.
 const bodyStyle={overflow:'auto',position:'relative',top:'2px',left:'3px',right:'4px',width:'98%'};Object.assign(p.context.document.body.style,bodyStyle);p.context.document.documentElement.style.overflow='clip';p.context.scrollY=318;
 const scrolls=[];p.context.scrollTo=(x,y)=>scrolls.push([x,y]);p.run('openDetail("canal");openNearby("canal")');assert.equal(p.context.document.body.style.position,'fixed');assert.equal(p.context.document.body.style.top,'-318px');assert.equal(p.context.document.documentElement.style.overflow,'hidden');assert(p.context.document.body.classes.has('sheet-open'));
 p.els.nearbyClose.onclick();assert.equal(p.context.document.body.style.position,'fixed');p.els.detailClose.onclick();assert.deepEqual(p.context.document.body.style,bodyStyle);assert.equal(p.context.document.documentElement.style.overflow,'clip');assert(!p.context.document.body.classes.has('sheet-open'));assert.deepEqual(scrolls,[[0,318]]);
 // Transitionend updates only the current map; timeout also covers reduced motion.
 const L=leaflet(),m=page({L});await initial(m);m.run('openNearby("hotel")');await sleep(80);const mini=L.maps.at(-1),mBox=surface(m,'nearbyPanel');assert.equal(mini.invalidations,1);
 swipe(m.els.nearbyBody,-80);transition(mBox,'opacity');transition(mBox,'height',m.els.nearbyRows);assert.equal(mini.invalidations,1);
 transition(mBox);assert.equal(mini.invalidations,2);assert(!m.els.nearbyPanel.classes.has('sheet-resizing'));await sleep(350);assert.equal(mini.invalidations,2);
 for(const dy of [-100,100])assert(!swipe(m.els.nearbyMap,dy).defaultPrevented);assert(expanded(m));
 swipe(m.els.nearbyBody,80);await sleep(350);assert.equal(mini.invalidations,3);assert(!expanded(m));assert.equal(mBox.style.height,'');
 swipe(m.els.nearbyBody,-80);m.run('openDetail("canal")');assert(mini.removed);await sleep(350);assert.equal(mini.invalidations,3);
 m.els.detailBack.onclick();assert(expanded(m));const restored=L.maps.at(-1);await sleep(80);assert.equal(restored.invalidations,1);m.run('closeAllOverlays()');
 p.run('openNearby("hotel")');swipe(body,-80);transition(box);swipe(body,80);await sleep(350);assert(!expanded(p));assert.equal(depth(p),1);assert.match(p.els.nearbyMap.innerHTML,/地圖載入失敗/);p.els.nearbyClose.onclick();assert.equal(depth(p),0);
 console.log('PASS sheets: 32px decisions, synthetic touch expand/scroll/collapse/no-dismiss, pinned map/header + sticky search, map/pinch/input exclusions, cancellation, per-layer height/query/scroll/history, all layers, body lock, transition/fallback invalidation and no Leaflet');
};
