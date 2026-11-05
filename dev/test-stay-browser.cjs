// Requires playwright-core. Run against isolated local servers (see README-shared.md):
// NODE_PATH=<playwright-core parent> CHROME=<Chrome path> node dev/test-stay-browser.cjs
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const url=process.env.URL||'http://127.0.0.1:8000/?backend=jsonfile&db=http://127.0.0.1:8899/api.php';
const local=u=>['localhost','127.0.0.1'].includes(new URL(u).hostname);
assert(local(url)&&new URL(url).searchParams.get('backend')==='jsonfile');
assert(local(new URL(url).searchParams.get('db')),'An isolated local API is required');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const output=path.resolve(process.env.SCREENSHOTS||'.qa/screenshots');fs.mkdirSync(output,{recursive:true});
 try{
  for(const device of [
   {name:'desktop',viewport:{width:1366,height:900}},
   {name:'mobile',viewport:{width:390,height:844},isMobile:true,hasTouch:true},
   {name:'narrow-mobile',viewport:{width:320,height:740},isMobile:true,hasTouch:true}
  ]){
   const {name,...options}=device,context=await browser.newContext({...options,serviceWorkers:'block'}),errors=[],blockedWrites=[];
   try{
    // Route before navigation: only the local API may receive writes. No production reads either.
    await context.route('**/*',route=>{
     const request=route.request(),u=new URL(request.url());
     if(local(u.href))return route.continue();
     if(request.method()!=='GET')blockedWrites.push(request.url());
     if(request.method()==='GET'&&['unpkg.com','cdn.jsdelivr.net','tile.openstreetmap.org'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))return route.continue();
     return route.abort();
    });
    await context.addInitScript(()=>localStorage.setItem('kyushuPlanner.me',JSON.stringify({id:'staybrowser1',nick:'測試'})));
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>sync.ready);
    await page.locator('[data-tab="planPane"]').click();
    // Seed test-only spots through the app, saving only to the local PHP backend.
    await page.evaluate(()=>{
     planner.setCustoms({...planner.customs,u_stay_browser:{zh:'自訂測試景點',cat:'親子景點',by:'測試',byId:'staybrowser1',at:1}});
     for(const [id,day]of [['sanriogal',0],['markis',0],['u_stay_browser',0],['food_hirao',-1]])planner.moveTo(id,day);
    });
    await page.waitForTimeout(900);
    const item=id=>page.locator(`#days .it[data-id="${id}"]`);
    assert.equal(await item('sanriogal').locator('.stay').innerText(),'🕒 0.5–1 hr');
    assert.equal(await item('markis').locator('.stay').innerText(),'🕒 遊玩 3–4／逛街 1.5–2 hr');
    assert.equal(await item('u_stay_browser').locator('.stay').innerText(),'🕒 待補');
    assert.equal(await item('food_hirao').locator('.stay').innerText(),'🕒 0.5–0.75 hr');
    assert.match(await item('food_hirao').locator('.stay').getAttribute('aria-label'),/另計排隊/);
    assert.equal(await item('sanriogal').locator('.stay').getAttribute('role'),'note');
    assert.equal(await page.locator('#days .it').count(),await page.locator('#days .it .stay').count());
    // Check painted text wraps in its own column and stays clear of all controls, even at 320px.
    for(const id of ['sanriogal','markis','u_stay_browser','food_hirao']){
     const layout=await item(id).evaluate(el=>{
      const stay=el.querySelector('.stay'),r=stay.getBoundingClientRect(),style=getComputedStyle(stay);
      const controls=[...el.querySelectorAll('.h,select,.x')].map(e=>e.getBoundingClientRect());
      const range=document.createRange();range.selectNodeContents(stay);
      return {font:parseFloat(style.fontSize),height:r.height,lines:[...range.getClientRects()].every(t=>t.left>=r.left-1&&t.right<=r.right+1),clear:controls.every(c=>c.right<=r.left||c.left>=r.right),width:document.documentElement.scrollWidth,viewport:innerWidth};
     });
     assert(layout.font>=12&&layout.height>0&&layout.lines&&layout.clear,`${name}/${id}: ${JSON.stringify(layout)}`);
     assert(layout.width<=layout.viewport,`${name}: horizontal overflow`);
    }
    await item('sanriogal').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`${name}-stays.png`),fullPage:false});
    await item('sanriogal').locator('.stay').click();assert(await page.locator('#detailPanel').evaluate(el=>el.classList.contains('on')));
    await page.locator('#detailClose').click();await page.waitForTimeout(400);
    await item('sanriogal').locator('select').selectOption('1');assert(await page.locator('#days ul[data-idx="1"] [data-id="sanriogal"] .stay').count());
    await item('u_stay_browser').locator('.x').click();assert.equal(await item('u_stay_browser').count(),0);
    await page.waitForTimeout(900);await page.reload({waitUntil:'networkidle'});await page.locator('[data-tab="planPane"]').click();
    assert.equal(await page.locator('#days ul[data-idx="1"] [data-id="sanriogal"] .stay').innerText(),'🕒 0.5–1 hr');
    assert.deepEqual(blockedWrites,[]);assert.deepEqual(errors,[]);
    console.log(`PASS ${name}: compact hour labels, conditional/unknown/pool spots, wrapping, controls, details, move/delete/reload; no remote writes or page errors`);
   }finally{await context.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
