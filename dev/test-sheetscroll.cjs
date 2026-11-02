// Called by test-planner.cjs; real overlay handlers with controlled animation frames.
const assert=require('assert/strict');
module.exports=async function({html,page,initial,sleep}){
 assert.match(html,/html,body\{[^}]*height:100%/);
 async function setup(options={}){
  const p=page(options);await initial(p);p.context.history.scrollRestoration='auto';
  const frames=new Map(),scrolls=[];let nextFrame=0;
  p.context.requestAnimationFrame=cb=>{frames.set(++nextFrame,cb);return nextFrame;};
  p.context.cancelAnimationFrame=id=>frames.delete(id);
  p.context.scrollTo=(x,y)=>{scrolls.push({x,y,pending:p.run('overlayHistoryPending'),depth:p.run('overlayStack.length')});p.context.scrollY=y;};
  const flush=()=>{const callbacks=[...frames.values()];frames.clear();for(const cb of callbacks)cb();};
  return {p,frames,scrolls,flush};
 }
 // The fixed body covers its content; repeated locks preserve the first offset/styles.
 const {p,scrolls,flush}=await setup(),body=p.context.document.body,root=p.context.document.documentElement;
 const original={overflow:'auto',position:'relative',top:'2px',left:'3px',right:'4px',width:'98%',height:'95%',minHeight:'44px'};
 Object.assign(body.style,original);root.style.overflow='clip';p.context.scrollY=1943;
 p.run('lockOverlayScroll()');assert.equal(body.style.height,'auto');assert.equal(body.style.position,'fixed');assert.equal(body.style.top,'-1943px');assert.equal(body.style.overflow,'hidden');assert.equal(root.style.overflow,'hidden');assert(body.classes.has('sheet-open'));assert.equal(p.context.history.scrollRestoration,'manual');
 p.context.scrollY=0;p.run('lockOverlayScroll()');assert.equal(p.run('overlayPageY'),1943);assert.equal(body.style.top,'-1943px');
 p.run('unlockOverlayScroll()');assert.deepEqual(body.style,original);assert.equal(root.style.overflow,'clip');assert(!body.classes.has('sheet-open'));assert.deepEqual(scrolls.map(({x,y})=>[x,y]),[[0,1943]]);
 p.run('unlockOverlayScroll()');assert.equal(scrolls.length,1,'unlock is idempotent too');
 p.run('syncOverlayHistory()');flush();assert.equal(p.context.history.scrollRestoration,'auto');assert.equal(p.context.scrollY,1943);
 // Each exit keeps manual restoration through popstate and reapplies Y after traversal.
 for(const previous of ['auto','manual'])for(const exit of ['closeAllOverlays','popOverlay','popstate','Escape']){
  const {p,scrolls,flush,frames}=await setup();const y=1943;
  p.context.history.scrollRestoration=previous;p.context.scrollY=y;
  // pushState must already see manual restoration, before the browser saves fixed-body Y=0.
  const push=p.context.history.pushState;p.context.history.pushState=function(...args){assert.equal(this.scrollRestoration,'manual');p.context.scrollY=0;return push.apply(this,args);};
  p.run('openDetail("canal")');assert.equal(p.context.history.scrollRestoration,'manual');
  if(exit==='popstate')p.context.history.back();
  else if(exit==='Escape')for(const cb of p.owner.docListeners.keydown)cb({key:'Escape',target:p.context.document.activeElement,preventDefault(){}});
  else p.run(exit+'()');
  assert.equal(p.context.history.scrollRestoration,'manual');assert.equal(frames.size,0,'wait for history before the final frame');
  await sleep(15);assert.equal(p.run('overlayStack.length'),0);assert.equal(p.run('overlayHistoryPending'),false);assert.equal(p.owner.history.index,0);
  assert(scrolls.some(s=>s.x===0&&s.y===y&&!s.pending&&s.depth===0),exit+' restores after history settles');
  assert.equal(p.context.history.scrollRestoration,'manual');assert.equal(frames.size,1);
  // Model a late browser restoration after popstate; the next frame must win.
  p.context.scrollY=0;flush();assert.equal(p.context.scrollY,y);assert.equal(scrolls.at(-1).y,y);assert.equal(p.context.history.scrollRestoration,previous);assert.equal(p.run('overlayRestoreY'),null);
 }
 // Nearby -> Back returns to detail with the same lock, then closing restores the page.
 for(const exit of ['button','browser','backdrop']){
  const {p,flush}=await setup();p.context.scrollY=2300;p.run('openDetail("canal")');p.context.scrollY=0;p.run('openNearby("canal")');
  if(exit==='backdrop')p.els.overlayBackdrop.onclick();
  else{
   if(exit==='browser')p.context.history.back();else p.els.nearbyBack.onclick();
   await sleep(15);assert.equal(p.run('overlayTop().kind'),'detail');assert.equal(p.context.document.body.style.height,'auto');assert.equal(p.context.history.scrollRestoration,'manual');assert.equal(p.run('overlayPageY'),2300);
   p.els.detailClose.onclick();
  }
  await sleep(15);flush();assert.equal(p.context.scrollY,2300);assert.equal(p.context.history.scrollRestoration,'auto');assert.equal(p.owner.history.index,0);
 }
 // Reopen during pending history navigation or before the final frame: no stale restore.
 for(const duringPending of [true,false]){
  const {p,flush,frames}=await setup();p.context.scrollY=2500;p.run('openDetail("canal");closeAllOverlays()');
  if(!duringPending){await sleep(15);assert.equal(frames.size,1);}
  p.context.scrollY=2700;p.run('openDetail("tower")');assert.equal(frames.size,0);await sleep(15);flush();assert.equal(p.context.document.body.style.top,'-2700px');assert.equal(p.context.history.scrollRestoration,'manual');
  p.run('popOverlay()');await sleep(15);flush();assert.equal(p.context.scrollY,2700);assert.equal(p.context.history.scrollRestoration,'auto');
 }
 // Denied History API restores without a popstate; absent/throwing restoration is safe.
 for(const restoration of ['supported','missing','throwing']){
  const {p,scrolls,flush,frames}=await setup({historyThrows:true});
  if(restoration==='missing')delete p.context.history.scrollRestoration;
  if(restoration==='throwing')Object.defineProperty(p.context.history,'scrollRestoration',{get(){throw Error('denied');},set(){throw Error('denied');}});
  p.context.scrollY=3100;p.run('openDetail("canal")');assert.equal(p.run('overlayHistoryEnabled'),false);p.context.scrollY=0;
  p.run('closeAllOverlays()');assert.equal(p.context.scrollY,3100);assert.equal(p.run('overlayHistoryPending'),false);assert.equal(frames.size,1);assert.equal(scrolls.at(-1).y,3100);
  p.context.scrollY=0;flush();assert.equal(p.context.scrollY,3100);if(restoration==='supported')assert.equal(p.context.history.scrollRestoration,'auto');
  assert.equal(p.context.document.body.style.height,'');assert.equal(p.context.document.body.style.position,'');assert(!p.context.document.body.classes.has('sheet-open'));
 }
 console.log('PASS sheet scroll: full-content body height, style/idempotent lock restoration, manual history, all exits, nested layers, late restoration, reopen races and unavailable History API');
};
