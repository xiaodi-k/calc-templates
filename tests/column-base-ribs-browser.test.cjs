'use strict';
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css'};
(async()=>{
 const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');fs.readFile(file,(e,b)=>{if(e)res.writeHead(404).end();else{res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(b);}});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined),headless:true});
  const page=await browser.newPage({viewport:{width:1500,height:1050},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/column-base/index.html#anchors`);await page.waitForFunction(()=>window.ColumnBaseApp);
  const toggle=page.locator('[data-path="rib.enabled"]');assert(await toggle.isChecked());
  const original=await page.evaluate(()=>({rib:ColumnBaseApp.getState().rib,rows:ColumnBaseApp.getResult().rows,faces:BaseViewer.getRenderInfo().faceCounts.rib}));assert(original.faces>0);
  await toggle.uncheck();assert.equal(await page.locator('#rib-hx').count(),0);
  assert.equal(await page.evaluate(()=>BaseViewer.getRenderInfo().faceCounts.rib),0);
  assert.equal(await page.locator('[data-focus^="rib."]').count(),0);assert(await page.locator('[data-legend="rib"]').isHidden());
  assert(await page.locator('[data-design="plate"]').isDisabled());assert((await page.locator('#summary').innerText()).includes('未计算'));
  await page.screenshot({path:path.resolve(root,'../column-base-no-ribs-preview.png'),fullPage:true});
  await page.reload();assert(!(await toggle.isChecked()));assert.equal(await page.evaluate(()=>BaseViewer.getRenderInfo().faceCounts.rib),0);
  let waiting=page.waitForEvent('download');await page.locator('#export-btn').click();let dl=await waiting;const saved=fs.readFileSync(await dl.path());assert.equal(JSON.parse(saved).rib.enabled,false);
  await toggle.check();assert.equal(await page.locator('#rib-hx').inputValue(),String(original.rib.hx));assert.equal(await page.evaluate(()=>BaseViewer.getRenderInfo().faceCounts.rib),original.faces);
  assert.deepEqual(await page.evaluate(()=>ColumnBaseApp.getResult().rows),original.rows);
  await page.locator('#import-file').setInputFiles({name:'no-ribs.json',mimeType:'application/json',buffer:saved});await page.waitForFunction(()=>ColumnBaseApp.getState().rib.enabled===false);
  await page.locator('a[href="#results"]').first().click();await page.locator('#only-fail').check();assert((await page.locator('#page-content').innerText()).includes('无肋底板厚度'));
  waiting=page.waitForEvent('download');await page.locator('#csv-btn').click();dl=await waiting;const csv=fs.readFileSync(await dl.path(),'utf8');assert(csv.includes('无肋底板厚度'));assert(csv.includes('需复核'));assert(!csv.includes('向加劲肋'));
  await page.locator('a[href="#report"]').first().click();const reportText=await page.locator('.report').innerText();assert(reportText.includes('不设加劲肋板'));assert(!reportText.includes('X向肋：'));assert(!reportText.includes('X向加劲肋'));assert(!reportText.includes('控制区格：'));
  waiting=page.waitForEvent('download');await page.locator('#download-report').click();dl=await waiting;const html=fs.readFileSync(await dl.path(),'utf8');assert(html.includes('无肋底板所需厚度尚未计算'));assert(!html.includes('X向肋：'));
  await page.locator('#close-document').click();
  const old=JSON.parse(saved);delete old.rib.enabled;await page.locator('#import-file').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});await page.waitForFunction(()=>ColumnBaseApp.getState().rib.enabled===true);assert.equal(await page.evaluate(()=>BaseViewer.getRenderInfo().faceCounts.rib),original.faces);
  await page.locator('a[href="#report"]').first().click();assert((await page.locator('.report').innerText()).includes('X向加劲肋'));assert((await page.locator('.report').innerText()).includes('控制区格：'));await page.locator('#close-document').click();
  await page.setViewportSize({width:390,height:844});await page.locator('#navigation a[href="#anchors"]').click();await toggle.uncheck();await toggle.scrollIntoViewIfNeeded();
  await page.screenshot({path:path.resolve(root,'../column-base-no-ribs-mobile.png'),fullPage:true});assert(!(await toggle.isChecked()));assert.deepEqual(errors,[]);
  console.log('PASS optional ribs browser: default/legacy, toggle geometry+dimensions, restoration, reload, JSON export/import, pending filter, CSV, HTML report, mobile; no page errors');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
