// Run separately: URL=http://127.0.0.1:8765/ CHROME=/usr/bin/google-chrome node dev/test-sheetscroll-browser.cjs
const assert=require('assert/strict');
const {chromium}=require('playwright-core');
const url=process.env.URL||'http://127.0.0.1:8765/';
const devices=[
 {name:'Android',viewport:{width:412,height:915},deviceScaleFactor:2.625},
 {name:'iPhone',viewport:{width:390,height:844},deviceScaleFactor:3}
];
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--no-sandbox']});
 let checked=0;
 try{
  for(const {name,...device}of devices){
   const context=await browser.newContext({...device,isMobile:true,hasTouch:true,serviceWorkers:'block'});
   try{
    // Prevent shared-state writes, including initialization, before any page script runs.
    await context.route(/op=save|firebase/i,route=>route.abort());
    await context.addInitScript(()=>localStorage.setItem('kyushuPlanner.me',JSON.stringify({id:'testBot00001',nick:'測試'})));
    const page=await context.newPage();page.setDefaultTimeout(15000);
    await page.goto(url,{waitUntil:'networkidle'});
    await page.locator('[data-tab="planPane"]').tap();
    const items=page.locator('#planPane .it .info');await items.first().waitFor();
    const count=await items.count();assert(count>=8,`${name}: need at least eight itinerary items, found ${count}`);
    for(let i=count-8;i<count;i++){
     const item=items.nth(i),method=['backdrop','close','back'][(i-(count-8))%3];
     await item.evaluate(el=>window.scrollBy(0,el.getBoundingClientRect().top-innerHeight*.6));
     await page.waitForTimeout(100);
     const before=await item.evaluate(el=>({y:scrollY,top:el.getBoundingClientRect().top}));
     assert(before.y>device.viewport.height,`${name} item ${i}: regression must run beyond one viewport (Y=${before.y})`);
     await item.tap();
     assert(await page.locator('#detailPanel').evaluate(el=>el.classList.contains('on')),`${name} item ${i}: detail sheet did not open`);
     const painted=await page.evaluate(()=>{
      const element=document.elementsFromPoint(200,120).filter(el=>el.id!=='overlayBackdrop')[0];
      return element?.tagName;
     });
     assert(painted&&painted!=='HTML'&&painted!=='BODY',`${name} item ${i}: blank background (${painted})`);
     const top=await item.evaluate(el=>el.getBoundingClientRect().top);
     assert(Math.abs(top-before.top)<=2,`${name} item ${i}: background moved ${top-before.top}px on open`);
     if(method==='backdrop')await page.touchscreen.tap(200,30);
     else if(method==='close')await page.locator('#detailClose').click();
     else await page.goBack();
     await page.waitForTimeout(600);
     assert(await page.locator('#detailPanel').evaluate(el=>!el.classList.contains('on')),`${name} item ${i}: sheet stayed open via ${method}`);
     const after=await page.evaluate(()=>window.scrollY);
     assert(Math.abs(after-before.y)<=2,`${name} item ${i}: ${method} restored Y=${after}, expected ${before.y}`);
     checked++;
    }
    console.log(`PASS ${name}: last 8 itinerary spots stay painted and preserve scroll via backdrop / close / browser Back`);
   }finally{await context.close();}
  }
  console.log(`PASS sheet scroll browser regression: ${checked} opens/closes across both mobile viewports`);
 }finally{await browser.close();}
})().catch(error=>{console.error('FAIL sheet scroll browser regression:',error);process.exitCode=1;});
