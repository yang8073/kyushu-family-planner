// Called by test-planner.cjs; exercise the real handlers with asynchronous browser history.
const assert=require('assert/strict');
module.exports=async function({html,page,initial,sleep,leaflet}){
 const panels=['detailPanel','nearbyPanel','documentsPanel','historyPanel','customModal','nickModal','modal'];
 const depth=p=>p.run('overlayStack.length'),settle=()=>sleep(15);
 function top(p,kind,id){assert.equal(p.run('overlayTop()?.kind'),kind);assert.equal(p.run('detailId'),kind==='detail'?id:null);assert.equal(p.run('nearbyId'),kind==='nearby'?id:null);assert.equal(panels.filter(k=>p.els[k].classes.has('on')).length,kind?1:0);if(kind)assert.equal(p.els[kind+'Back'].hidden,depth(p)<2);}
 function key(p,key){const event={key,target:p.context.document.activeElement||p.els.cards,preventDefault(){this.defaultPrevented=true;}};for(const cb of p.owner.docListeners.keydown)cb(event);return event;}
 function nearbyDetail(p,id){const button={dataset:{nearDetail:id},closest(){return this;}};p.run('handleNearbyClick')({target:button,preventDefault(){},stopPropagation(){}});}
 // Forward first enters a stale overlay entry, then cleanup traverses back asynchronously.
 // Subscribe before traversal so an already-idle base entry cannot satisfy the wait early.
 function forwardToBase(p){return new Promise((resolve,reject)=>{
  const listeners=p.owner.eventListeners.popstate;
  const cleanup=()=>{clearTimeout(timer);const i=listeners.indexOf(onPop);if(i>=0)listeners.splice(i,1);};
  const onPop=()=>{if(p.owner.history.index===0&&p.run('overlayHistoryDepth')===0&&!p.run('overlayHistoryPending')){cleanup();resolve();}};
  const timer=setTimeout(()=>{cleanup();reject(Error('Forward did not return to the base history entry within 1000ms'));},1000);
  listeners.push(onPop);
  try{p.context.history.forward();}catch(error){cleanup();reject(error);}
 });}
 const p=page({search:'?view=family&test=1',hash:'#itinerary'});await initial(p);const url=p.context.location.href,before=p.run('JSON.stringify(snapshot())'),baseState={view:'family',foreign:{value:7}};p.context.history.replaceState(baseState,'');p.els.cards.focus();
 p.run('openDetail("canal")');top(p,'detail','canal');assert.equal(depth(p),1);p.els.detailBody.scrollTop=143;
 p.run('openNearby("canal")');top(p,'nearby','canal');p.els.nearbyBody.scrollTop=725;
 nearbyDetail(p,'tower');top(p,'detail','tower');assert.equal(depth(p),3);assert.equal(p.context.location.href,url);
 p.els.detailBack.onclick();top(p,'nearby','canal');assert.equal(p.els.nearbyBody.scrollTop,725);assert.match(p.els.nearbyTitle.textContent,/キャナル|運河/);await settle();
 p.els.nearbyBack.onclick();top(p,'detail','canal');assert.equal(p.els.detailBody.scrollTop,143);assert(p.els.detailBack.hidden);await settle();
 p.els.detailClose.onclick();top(p,undefined);assert.equal(depth(p),0);assert.equal(p.context.document.activeElement,p.els.cards);await settle();assert.equal(p.owner.history.index,0);
 // Repeated singleton panels preserve different ids and scroll offsets at arbitrary depth.
 p.run('openDetail("canal");openNearby("canal");openDetail("tower");openNearby("tower");openDetail("zoo")');assert.equal(depth(p),5);top(p,'detail','zoo');
 for(const [kind,id]of [['nearby','tower'],['detail','tower'],['nearby','canal'],['detail','canal']]){key(p,'Escape');top(p,kind,id);await settle();}
 assert.equal(depth(p),1);p.run('closeAllOverlays()');await settle();assert.equal(p.owner.history.index,0);
 // Nearby opened directly from the list has no detail underneath. Browser back pops once.
 p.run('openNearby("canal")');p.els.nearbyBody.scrollTop=620;nearbyDetail(p,'tower');p.context.history.back();await settle();top(p,'nearby','canal');assert.equal(depth(p),1);assert.equal(p.els.nearbyBody.scrollTop,620);
 p.context.history.back();await settle();assert.equal(depth(p),0);assert.equal(p.owner.history.index,0);
 // Modal wrappers close all only when the actual backdrop is tapped.
 p.run('openDetail("canal");openNearby("canal")');const inside={target:p.els.nearbyMap,currentTarget:p.els.nearbyPanel};p.els.nearbyPanel.onclick(inside);assert.equal(depth(p),2);
 p.els.nearbyPanel.onclick({target:p.els.nearbyPanel,currentTarget:p.els.nearbyPanel});assert.equal(depth(p),0);await settle();assert.equal(p.owner.history.index,0);assert.equal(p.run('overlayHistoryPending'),false);assert.deepEqual(p.context.history.state,baseState);
 p.context.history.back();await settle();assert(p.owner.leftPage,'back after cleanup should behave normally');assert.equal(depth(p),0);p.owner.leftPage=false;
 // Rapid UI closes followed by opening a new root cannot consume the new layer's popstate.
 p.run('openDetail("canal");openNearby("canal");popOverlay();popOverlay();openDetail("zoo")');await settle();top(p,'detail','zoo');assert.equal(depth(p),1);assert.equal(p.owner.history.index,1);
 p.els.overlayBackdrop.onclick();await settle();assert.equal(depth(p),0);assert.equal(p.owner.history.index,0);
 // Re-entering a closed entry with Forward does not resurrect stale layers.
 await forwardToBase(p);assert.equal(depth(p),0);assert.equal(p.owner.history.index,0);
 assert.equal(p.context.location.href,url);assert.equal(p.run('JSON.stringify(snapshot())'),before);
 // Documents, generic modals, nicknames, history previews and custom drafts also nest.
 p.run('openDocuments("lodging",document.getElementById("hotelDocsBtn"))');p.els.documentsBody.scrollTop=234;
 const lodging=p.context.document.getElementById('documents-lodging'),flights=p.context.document.getElementById('documents-flights');lodging.open=false;flights.open=true;p.els.documentsGroups.querySelectorAll=()=>[lodging,flights];
 p.run('openModal("first","draft",text=>{window.modalResult=text;});');p.els.mText.value='changed';p.els.mText.scrollTop=76;
 p.run('openModal("second","other",null)');p.els.modalClose.onclick();assert.equal(p.els.mTitle.textContent,'first');assert.equal(p.els.mText.value,'changed');assert.equal(p.els.mText.scrollTop,76);p.els.mOk.onclick();assert.equal(p.context.modalResult,'changed');top(p,'documents');assert.equal(p.els.documentsBody.scrollTop,234);assert(!lodging.open);assert(flights.open);
 p.run('openNick()');p.els.nickInput.value='草稿暱稱';p.run('openModal("copy","text",null)');p.els.mCancel.onclick();assert.equal(p.els.nickInput.value,'草稿暱稱');p.els.nickClose.onclick();top(p,'documents');p.els.documentsClose.onclick();await settle();assert.equal(p.context.document.activeElement,p.els.hotelDocsBtn);
 await p.run('openHistory()');await p.run('previewVersion(0)'); // Missing-version error sub-state must survive a child modal.
 const errorHtml=p.els.historyBody.innerHTML;p.els.historyBody.scrollTop=93;p.run('openModal("copy","text",null)');p.els.modalClose.onclick();top(p,'history');assert.equal(p.els.historyBody.innerHTML,errorHtml);assert.equal(p.els.historyBody.scrollTop,93);p.els.historyClose.onclick();await settle();
 const id=p.run('saveCustomSpot({zh:"stack draft",cat:"餐廳",lat:33.59,lng:130.41})');p.run(`openDetail(${JSON.stringify(id)});openCustomForm(${JSON.stringify(id)})`);top(p,'custom');p.els.customZh.value='edited draft';p.els.customBody.scrollTop=180;
 p.run('openCustomForm()');p.els.customClose.onclick();assert.equal(p.els.customZh.value,'edited draft');assert.equal(p.els.customBody.scrollTop,180);p.els.customForm.onsubmit({preventDefault(){}});top(p,'detail',id);assert.match(p.els.detailBody.innerHTML,/edited draft/);assert.equal(depth(p),1);p.run('deleteCustomSpot('+JSON.stringify(id)+')');assert.equal(depth(p),0);await settle();
 // Leaflet containers are destroyed on suspension and recreated on restoration.
 const L=leaflet(),m=page({L});await initial(m);m.run('openDetail("canal");openNearby("canal")');const mini=L.maps.at(-1);mini.setView([33.6,130.42],17);m.els.nearbyBody.scrollTop=510;
 const target=m.run('nearbySpots("canal")[0].id'),button={dataset:{nearDetail:target},closest(){return this;}};
 for(const cb of mini.handlers.popupopen)cb({popup:{getElement:()=>({querySelectorAll:()=>[button]})}});button.onclick({target:button,preventDefault(){},stopPropagation(){}});top(m,'detail',target);assert(mini.removed);
 m.els.detailClose.onclick();top(m,'nearby','canal');const restored=L.maps.at(-1);assert.notEqual(restored,mini);assert.equal(m.els.nearbyBody.scrollTop,510);await sleep(80);assert.equal(mini.invalidations,undefined);assert.equal(restored.invalidations,1);assert.deepEqual(Array.from(restored.view.point),[33.6,130.42]);assert.equal(restored.view.zoom,17);assert(L.pins.some(pin=>pin.target===L.groups.at(-1)&&pin._nearbyId===target&&pin.opened));
 m.els.nearbyBigMap.onclick();assert.equal(depth(m),0);assert(restored.removed);assert(m.els.mapPane.classes.has('on'));await settle();assert.equal(m.owner.history.index,0);
 // Missing Leaflet and denied History APIs keep all UI navigation usable.
 const denied=page({historyThrows:true});await initial(denied);denied.run('openDetail("canal");openNearby("canal");openDetail("tower")');key(denied,'Escape');top(denied,'nearby','canal');assert.match(denied.els.nearbyMap.innerHTML,/地圖載入失敗/);denied.els.nearbyClose.onclick();top(denied,'detail','canal');denied.els.overlayBackdrop.onclick();assert.equal(depth(denied),0);
 for(const kind of ['detail','nearby','documents','history','custom','nick','modal'])assert(html.includes('id="'+kind+'Back"'));
 console.log('PASS modal stack: arbitrary depth, ids/scroll/drafts/sub-state, Back/✕/Esc/popstate, backdrop/history cleanup and races, focus, mini-map recreation/popups, big-map and missing Leaflet/History API');
};
