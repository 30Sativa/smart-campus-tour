
const assert=require('node:assert/strict');
const fs=require('node:fs');
const puppeteer=require('C:/Users/ADMIN/AppData/Local/Temp/hallmark-preview-runtime/node_modules/puppeteer-core');
(async()=>{
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
 const report={functions:[],widths:[],errors:[]};
 try{
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(String(e)));await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
 await page.goto('http://localhost:5173/ben-trong-robot',{waitUntil:'networkidle0'});await page.waitForSelector('canvas');await new Promise(r=>setTimeout(r,2200));
 const tabs=await page.$$eval('.ri-tabs button',els=>els.map(e=>({id:e.id,label:e.textContent})));
 assert.equal(tabs.length,5);
 for(const tab of tabs){
  await page.click('#'+tab.id);await page.waitForFunction(id=>document.querySelector('#'+id).getAttribute('aria-selected')==='true',{},tab.id);
  const steps=await page.$$eval('.ri-step-buttons button',els=>els.map(e=>e.getAttribute('aria-label')));
  for(let i=0;i<steps.length;i++){
   await page.click('.ri-step-buttons button:nth-child('+(i+1)+')');
   await page.waitForFunction(n=>document.querySelector('.ri-step-count').textContent.includes('Bước '+n+' /'),{},i+1);
   const title=await page.$eval('.ri-explanation h3',e=>e.textContent);assert.equal(steps[i],'Bước '+(i+1)+': '+title);
   await page.click('.ri-disclosure');await page.waitForSelector('#signal-detail');assert((await page.$eval('#signal-detail',e=>e.textContent.length))>10);await page.click('.ri-disclosure');
  }
  report.functions.push({label:tab.label,steps:steps.length});
 }
 await page.click('#function-drive');await page.focus('#function-drive');await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.activeElement.id==='function-sense');
 assert(page.url().includes('flow=sense'));
 await page.click('.ri-step-buttons button:nth-child(2)');await page.reload({waitUntil:'networkidle0'});await page.waitForFunction(()=>document.querySelector('.ri-step-count').textContent.includes('Bước 2 /'));
 await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('canvas');await new Promise(r=>setTimeout(r,1800));
 const zoomBefore=await page.$eval('.lp3-zoom__level',e=>e.textContent);await page.click('button[aria-label="Phóng to"]');await page.waitForFunction(old=>document.querySelector('.lp3-zoom__level').textContent!==old,{},zoomBefore);
 await page.click('.lp3-zoom__level');await page.waitForFunction(()=>document.querySelector('.lp3-zoom__level').textContent==='100%');
 const pressed=await page.$eval('.ri-stage-bar button',e=>e.getAttribute('aria-pressed'));await page.click('.ri-stage-bar button');assert.notEqual(await page.$eval('.ri-stage-bar button',e=>e.getAttribute('aria-pressed')),pressed);
 for(const width of [320,390,768,1024,1280,1440,1920]){
  await page.setViewport({width,height:900,deviceScaleFactor:1});await page.click('#function-sense');
  const sizes=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));assert(sizes.scroll<=sizes.client+1,JSON.stringify({width,...sizes}));
  report.widths.push({width,...sizes});
 }
 await page.setViewport({width:1440,height:900,deviceScaleFactor:1});await page.click('#function-drive');await new Promise(r=>setTimeout(r,1600));
 await page.screenshot({path:'design-previews/robot-inside/applied-desktop.png'});
 await page.click('.lp-themebtn');await page.waitForFunction(()=>document.documentElement.classList.contains('dark'));await new Promise(r=>setTimeout(r,1800));await page.screenshot({path:'design-previews/robot-inside/applied-dark.png'});await page.click('.lp-themebtn');await page.waitForFunction(()=>!document.documentElement.classList.contains('dark'));await new Promise(r=>setTimeout(r,1800));
 await page.setViewport({width:390,height:844,deviceScaleFactor:1});await new Promise(r=>setTimeout(r,1800));await page.screenshot({path:'design-previews/robot-inside/applied-phone.png',fullPage:true});
 await page.click('.lp-burger');await page.waitForSelector('#lp-mobile-menu');assert((await page.$$('#lp-mobile-menu a')).length>=6);await page.click('.lp-burger');
 const failed=await browser.newPage();await failed.setRequestInterception(true);failed.on('request',r=>r.url().includes('campus-amr-explode.glb')?r.abort():r.continue());
 await failed.goto('http://localhost:5173/ben-trong-robot',{waitUntil:'networkidle0'});await failed.waitForSelector('.ri-fallback');assert.equal(await failed.$eval('.ri-fallback img',i=>i.complete&&i.naturalWidth>0),true);await failed.close();
 report.interactions=['Every function and step','Signal disclosure','Arrow-key tabs','URL reload','Zoom and reset','Pause toggle','Dark mode','Mobile navigation','Model-load error fallback'];
 assert.equal(report.errors.length,0);
 fs.writeFileSync('design-previews/robot-inside/.hallmark/applied-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
