// Called by test-planner.cjs; real sheet handlers + static DOM ancestry, offline.
const assert=require('assert/strict');
module.exports=async function({html,page,initial,sleep,leaflet}){
 const p=page();await initial(p);const decide=p.context.planner.sheetGesture;
 assert.equal(decide(),'none');assert.equal(decide({state:'unknown',dy:-80}),'none');
 for(const state of ['normal','expanded'])for(const scrollTop of [-3,0,.5,100])for(const startScrollTop of [-2,0,1,100]){
  for(const dy of [-200,-48,-12,-11.9,-1,0,1,47.9,48,200,NaN,Infinity,-Infinity]){
   assert.equal(decide({state,scrollTop,startScrollTop,dy}),!Number.isFinite(dy)?'none':state==='normal'?(dy<=-12?'expand':'none'):(dy>=48&&scrollTop<=0&&startScrollTop<=0?'collapse':'none'));
   for(const ignored of [{startOnMap:true},{startOnInput:true},{dx:1000}])assert.equal(decide({state,scrollTop,startScrollTop,dy,...ignored}),'none');
  }
 }
 const depth=q=>q.run('overlayStack.length'),expanded=q=>q.run('overlayTop().expanded');
 function touch(target,type,dy=0,extra={}){const point={identifier:1,clientX:100,clientY:400+dy},e={type,bubbles:true,cancelable:true,touches:type==='touchend'||type==='touchcancel'?[]:[point],defaultPrevented:false,preventDefault(){assert.fail('sheet handlers must preserve native touch scrolling');},...extra};target.dispatchEvent(e);return e;}
 function swipe(target,dy){touch(target,'touchstart');const e=touch(target,'touchmove',dy);touch(target,'touchend',dy);return e;}
 function scrollTo(body,top){body.scrollTop=top;body.dispatchEvent({type:'scroll',bubbles:false});}
 function transition(surface,propertyName='transform',target=surface){surface.dispatchEvent({type:'transitionend',bubbles:true,target,propertyName});}
 const surface=(q,id)=>q.els[id].querySelector('.box')||q.els[id];
 p.run('openNearby("hotel")');const panel=p.els.nearbyPanel,body=p.els.nearbyBody,box=surface(p,'nearbyPanel');
 const plan=p.run('JSON.stringify(snapshot())'),rev=p.run('sync.rev');
 assert.equal(expanded(p),false);assert(body.classes.has('sheet-scroll'));assert(box.classes.has('sheet-surface'));
 // 只有地圖與標頭固定，按鈕、說明、搜尋與清單共用一個捲動區。
 assert.equal(p.els.nearbyMap.parentElement,p.els.nearbyMapRegion);assert.equal(p.els.nearbyMapRegion.parentElement,box);
 assert(!body.contains(p.els.nearbyMap));assert(body.contains(p.els.nearbyBigMap));assert(body.querySelector('.hint'));assert(!p.els.nearbyMapRegion.querySelector('.hint'));assert(!body.contains(p.els.nearbyTitle));
 for(const id of ['nearbySearch','nearbySearchClear','nearbyCount'])assert(p.els.nearbySearchBar.contains(p.els[id]));
 assert(body.contains(p.els.nearbySearchBar));assert(body.contains(p.els.nearbyRows));
 assert(!/#nearbySearchBar\{[^}]*position:sticky/.test(html));assert(!html.includes('sheet-gesture'));assert(!/transition:height/.test(html));assert.match(html,/height:100vh!important;height:100dvh!important/);
 for(const edge of ['top','right','bottom','left'])assert(html.includes('env(safe-area-inset-'+edge+')'));
 assert.match(html,/@media\(prefers-reduced-motion:reduce\)\{[^}]*transition:none/);
 assert.match(html,/\.sheet-scroll\{[^}]*overflow-y:auto;[^}]*-webkit-overflow-scrolling:touch;[^}]*overscroll-behavior:contain/);
 const handlers=html.slice(html.indexOf('function sheetGesture'),html.indexOf('function saveOverlay'));
 assert(!/preventDefault|cancelable|passive:false|offsetHeight|style\.height/.test(handlers));
 for(const type of ['touchstart','touchmove','touchend','touchcancel'])assert.equal(panel.listenerOptions[type][0].passive,true);
 assert.equal(body.listenerOptions.scroll[0].passive,true);
 // 慢速手勢後續事件不可取消時，仍以起點累計距離展開，且一個手勢只切換一次。
 let toggles=0;const toggle=panel.classList.toggle;panel.classList.toggle=(name,on)=>{if(name==='sheet-expanded')toggles++;return toggle(name,on);};
 assert(!touch(body,'touchstart').defaultPrevented);assert(!touch(body,'touchmove',-10).defaultPrevented);assert(!expanded(p));
 for(let i=2;i<=30;i++)assert(!touch(body,'touchmove',-i*10,{cancelable:false}).defaultPrevented);
 assert(expanded(p));assert.equal(toggles,1);assert.equal(body.scrollTop,0);
 assert(!touch(body,'touchmove',100,{cancelable:false}).defaultPrevented);assert(expanded(p));touch(body,'touchend');assert(panel.classes.has('sheet-expanded'));
 panel.classList.toggle=toggle;
 // Later swipes scroll normally. A downward gesture only collapses at the top.
 assert(!swipe(body,-90).defaultPrevented);assert(expanded(p));body.scrollTop=120;
 assert(!swipe(body,100).defaultPrevented);assert(expanded(p));body.scrollTop=0;
 assert(!swipe(body,80).defaultPrevented);assert(!expanded(p));assert.equal(depth(p),1);
 for(let i=0;i<3;i++){assert(!swipe(body,100).defaultPrevented);assert(!expanded(p));assert.equal(depth(p),1);}
 // 清單原生 scroll 是獨立展開路徑；每個手勢只切換一次，縮回不關閉。
 scrollTo(body,0);assert(!expanded(p));touch(body,'touchstart');touch(body,'touchmove',-5,{cancelable:false});assert(!expanded(p));scrollTo(body,1);assert(expanded(p));
 touch(body,'touchmove',100,{cancelable:false});assert(expanded(p));touch(body,'touchend');scrollTo(body,0);
 touch(body,'touchstart');touch(body,'touchmove',47.9,{cancelable:false});assert(expanded(p));touch(body,'touchmove',48,{cancelable:false});assert(!expanded(p));touch(body,'touchend');assert.equal(depth(p),1);
 scrollTo(body,2);assert(expanded(p),'scroll events expand without a touch sequence');
 // 起手不在頂端，即使同一次手勢捲回頂端也不能縮回。
 touch(body,'touchstart');scrollTo(body,0);touch(body,'touchmove',100);assert(expanded(p));touch(body,'touchend');
 touch(body,'touchstart');scrollTo(body,2);touch(body,'touchmove',100);assert(expanded(p),'the scroller must still be at the top');touch(body,'touchend');scrollTo(body,0);swipe(body,48);assert(!expanded(p));
 // 被排除的手勢也不能經 scroll 事件誤觸發展開。
 for(const target of [p.els.nearbyMap,p.els.nearbySearch]){touch(target,'touchstart');scrollTo(body,3);assert(!expanded(p));touch(body,'touchend');scrollTo(body,0);}
 touch(body,'touchstart');touch(body,'touchmove',-10,{touches:[{clientX:180,clientY:390}]});scrollTo(body,3);assert(!expanded(p));touch(body,'touchend');scrollTo(body,0);
 touch(body,'touchstart',0,{touches:[{},{}]});touch(body,'touchend',0,{touches:[{clientX:100,clientY:400}]});scrollTo(body,3);touch(body,'touchmove',-80);assert(!expanded(p));touch(body,'touchend');scrollTo(body,0);
 // Header and buttons can initiate an expansion, but taps never change state.
 assert(!swipe(p.els.nearbyClose,-8).defaultPrevented);assert(!expanded(p));
 assert(!swipe(p.els.nearbyTitle,-80).defaultPrevented);assert(expanded(p));swipe(body,80);
 // 水平、多指、取消與不可取消事件均不會阻塞捲動。
 touch(body,'touchstart');assert(!touch(body,'touchmove',-20,{touches:[{clientX:180,clientY:380}]}).defaultPrevented);touch(body,'touchend');
 touch(body,'touchstart');assert(!touch(body,'touchmove',-90,{touches:[{},{}]}).defaultPrevented);touch(body,'touchend');assert(!expanded(p));
 touch(body,'touchstart');touch(body,'touchcancel');assert(!swipe(body,-80).defaultPrevented);assert(expanded(p));
 swipe(body,80);touch(body,'touchstart');assert(!touch(body,'touchmove',-80,{cancelable:false}).defaultPrevented);touch(body,'touchend');assert(expanded(p));swipe(body,80);
 // Map-start gestures stay ignored even after moving out over the list.
 for(const dy of [-120,120]){touch(p.els.nearbyMap,'touchstart');assert(!touch(body,'touchmove',dy).defaultPrevented);touch(body,'touchend');assert(!expanded(p));}
 touch(p.els.nearbyMap,'touchstart',0,{touches:[{},{}]});assert(!touch(p.els.nearbyMap,'touchmove',-80,{touches:[{},{}]}).defaultPrevented);touch(p.els.nearbyMap,'touchend');assert(!expanded(p));
 p.els.nearbyRows.classes.add('leaflet-container');assert(!swipe(p.els.nearbyRows,-80).defaultPrevented);p.els.nearbyRows.classes.delete('leaflet-container');assert(!expanded(p));
 // An input gesture preserves native editing; focus expands without replacing it.
 const input=p.els.nearbySearch;assert(!swipe(input,-100).defaultPrevented);assert(!expanded(p));input.focus();assert(expanded(p));assert.equal(p.context.document.activeElement,input);
 input.value='燒肉';input.oninput({});const result=p.els.nearbyRows.innerHTML;body.scrollTop=257;
 // Children inherit expanded, then keep independent height/query/scroll state.
 p.run('openDetail("canal")');assert(expanded(p));p.els.detailBody.scrollTop=143;
 p.run('openNearby("canal")');assert(expanded(p));assert.equal(input.value,'');
 assert(!swipe(body,90).defaultPrevented);assert(!expanded(p));input.value='住宿';input.oninput({});
 input.focus();assert(expanded(p));swipe(body,90);assert(!expanded(p));assert.equal(p.context.document.activeElement,input);body.scrollTop=92;
 p.run('openDetail("tower")');assert(!expanded(p));assert(!swipe(p.els.detailHead,-90).defaultPrevented);assert(expanded(p));
 p.els.detailBack.onclick();assert(!expanded(p),'restoring input focus must preserve the layer height');assert.equal(p.context.document.activeElement,input);assert.equal(input.value,'住宿');assert.equal(body.scrollTop,92);scrollTo(body,92);assert(!expanded(p),'restored scroll events must preserve the layer state');
 p.els.nearbyBack.onclick();assert(expanded(p));assert.equal(p.els.detailBody.scrollTop,143);
 await sleep(20);p.context.history.back();await sleep(20);assert.equal(p.run('overlayTop().kind'),'nearby');assert(expanded(p));assert.equal(input.value,'燒肉');assert.equal(body.scrollTop,257);assert.equal(p.els.nearbyRows.innerHTML,result);
 assert.equal(p.run('JSON.stringify(snapshot())'),plan);assert.equal(p.run('sync.rev'),rev);p.run('closeAllOverlays()');await sleep(20);
 // Every other layer shares the same header/scroll behavior, even without Leaflet.
 for(const [open,id,scroll]of [['openDetail("canal")','detailPanel','detailBody'],['openDocuments()','documentsPanel','documentsBody'],['openHistory()','historyPanel','historyBody'],['openCustomForm()','customModal','customBody'],['openNick()','nickModal','nickBody'],['openModal("測試","文字",null)','modal','mText']]){
  await p.run(open);const node=p.els[id],head=node.querySelector('.detail-head')||node.querySelector('.overlay-tools');assert(head);for(const type of ['touchstart','touchmove','touchend','touchcancel'])assert(node.listenerOptions[type].every(options=>options.passive===true));assert.equal(p.els[scroll].listenerOptions.scroll[0].passive,true);assert(p.els[scroll].classes.has('sheet-scroll'));assert(!p.els[scroll].contains(head));
  scrollTo(p.els[scroll],1);assert(expanded(p));scrollTo(p.els[scroll],0);swipe(head,48);assert(!expanded(p));assert(!swipe(head,-80).defaultPrevented);assert(expanded(p));p.els[scroll].scrollTop=0;assert(!swipe(head,80).defaultPrevented);assert(!expanded(p));assert.equal(depth(p),1);p.run('closeAllOverlays()');await sleep(10);
 }
 // Lock body/root while stacked; restore their previous styles and page offset.
 const bodyStyle={overflow:'auto',position:'relative',top:'2px',left:'3px',right:'4px',width:'98%'};Object.assign(p.context.document.body.style,bodyStyle);p.context.document.documentElement.style.overflow='clip';p.context.scrollY=318;
 const scrolls=[];p.context.scrollTo=(x,y)=>scrolls.push([x,y]);p.run('openDetail("canal");openNearby("canal")');assert.equal(p.context.document.body.style.position,'fixed');assert.equal(p.context.document.body.style.top,'-318px');assert.equal(p.context.document.documentElement.style.overflow,'hidden');assert(p.context.document.body.classes.has('sheet-open'));
 p.els.nearbyClose.onclick();assert.equal(p.context.document.body.style.position,'fixed');p.els.detailClose.onclick();assert.deepEqual(p.context.document.body.style,bodyStyle);assert.equal(p.context.document.documentElement.style.overflow,'clip');assert(!p.context.document.body.classes.has('sheet-open'));assert.deepEqual(scrolls,[[0,318]]);
 // 只接受表面本身的 transform 結束事件；重複事件與備援計時器只更新一次地圖。
 const L=leaflet(),m=page({L});await initial(m);m.run('openNearby("hotel")');await sleep(80);const mini=L.maps.at(-1),mBox=surface(m,'nearbyPanel');assert.equal(mini.invalidations,1);
 swipe(m.els.nearbyBody,-80);transition(mBox,'opacity');transition(mBox,'height');transition(mBox,'transform',m.els.nearbyRows);assert.equal(mini.invalidations,1);
 transition(mBox);transition(mBox);assert.equal(mini.invalidations,2);assert(!m.els.nearbyPanel.classes.has('sheet-resizing'));await sleep(350);assert.equal(mini.invalidations,2);
 for(const dy of [-100,100])assert(!swipe(m.els.nearbyMap,dy).defaultPrevented);assert(expanded(m));
 swipe(m.els.nearbyBody,80);await sleep(350);assert.equal(mini.invalidations,3);assert(!expanded(m));assert.equal(mBox.style.transform,'');assert.equal(mBox.style.transition,'');
 swipe(m.els.nearbyBody,-80);m.run('openDetail("canal")');assert(mini.removed);await sleep(350);assert.equal(mini.invalidations,3);
 m.els.detailBack.onclick();assert(expanded(m));const restored=L.maps.at(-1);await sleep(80);assert.equal(restored.invalidations,1);m.run('closeAllOverlays()');
 // 量測只發生在切換前後；排程只啟動一次 CSS 位移，結束即釋放 will-change。
 m.run('openNearby("hotel")');await sleep(80);const animated=L.maps.at(-1);let reads=0;
 mBox.getBoundingClientRect=()=>{reads++;return {top:m.els.nearbyPanel.classes.has('sheet-expanded')?0:200,height:500};};
 swipe(m.els.nearbyBody,-12);assert.equal(reads,2);assert.equal(mBox.style.transform,'translateY(200px)');assert.equal(mBox.style.transition,'none');assert(m.els.nearbyPanel.classes.has('sheet-resizing'));
 await sleep(60);assert.equal(reads,2);assert.equal(mBox.style.transform,'');assert.equal(mBox.style.transition,'');transition(mBox);assert.equal(animated.invalidations,2);assert(!m.els.nearbyPanel.classes.has('sheet-resizing'));
 m.context.matchMedia=query=>({matches:query==='(prefers-reduced-motion:reduce)'});
 swipe(m.els.nearbyBody,48);assert(!expanded(m));assert.equal(animated.invalidations,3);assert(!m.els.nearbyPanel.classes.has('sheet-resizing'));transition(mBox);await sleep(350);assert.equal(animated.invalidations,3);m.run('closeAllOverlays()');

 p.run('openNearby("hotel")');swipe(body,-80);transition(box);swipe(body,80);await sleep(350);assert(!expanded(p));assert.equal(depth(p),1);assert.match(p.els.nearbyMap.innerHTML,/地圖載入失敗/);p.els.nearbyClose.onclick();assert.equal(depth(p),0);
 console.log('PASS sheets: passive native scroll, cumulative 12px expand/48px top-only collapse, slow/noncancelable touch, scroll expand, pinned map + scrolling search, exclusions, per-layer restore, all layers, transform/fallback invalidation and no Leaflet');
};
