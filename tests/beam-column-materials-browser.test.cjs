'use strict';
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css'};
(async()=>{
  const server=http.createServer((req,res)=>{
    let target=path.join(root,decodeURIComponent(req.url.split('?')[0]));
    if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');
    fs.readFile(target,(error,body)=>{if(error)res.writeHead(404).end();else{res.setHeader('Content-Type',mime[path.extname(target)]||'text/plain; charset=utf-8');res.end(body);}});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined),headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const base=`http://127.0.0.1:${server.address().port}`;
    await page.goto(base+'/index.html');await page.locator('a[href="developing.html"]').click();await page.locator('a[href="steel-beam-column-demo.html"]').click();
    assert.match(await page.locator('#report').innerText(),/GB 50017/);
    async function fill(id,value){await page.locator('#'+id).fill(String(value));await page.locator('#'+id).press('Tab');}
    async function dim(key,value){const loc=page.locator('[data-dim="'+key+'"]');await loc.fill(String(value));await loc.press('Tab');}
    async function shape(key){await page.locator('label.section-option').filter({has:page.locator('input[value="'+key+'"]')}).click();}
    await shape('box');await dim('H',200);await dim('B',160);await dim('tf',16);await dim('tw',16);
    await fill('N',40);await fill('Mx',2);await fill('My',1);
    const expected=await page.evaluate(()=>BeamColumnMaterials.grades);
    for(const family of ['stainless','aluminium']){
      await page.selectOption('#family',family);
      assert.deepEqual(await page.locator('#grade option').evaluateAll(nodes=>nodes.map(n=>n.value)),expected[family]);
      for(const grade of expected[family]){
        await page.selectOption('#grade',grade);
        if(family==='aluminium')await page.selectOption('#product',grade==='AL5083'?'tube':'profile');
        assert.match(await page.locator('#status').innerText(),/范围内满足/,grade);
        const report=await page.locator('#report').innerText();
        assert.match(report,family==='stainless'?/CECS 410:2015/:/GB 50429-2007/);
        assert.doesNotMatch(report,/GB 50017|D\.0\.5|S3 限值/);
        assert.doesNotMatch(await page.locator('#report').innerHTML(),/NaN|undefined/);
        const expectedRatio=await page.evaluate(({family,grade})=>BeamColumnMaterials.calculate({family,grade,type:'box',H:200,B:160,tf:16,tw:16,N:40,Mx:2,My:1,Lx:2,Ly:2,bmx:1,bmy:1,process:family==='stainless'?'ss-welded':'al-unwelded',product:grade==='AL5083'?'tube':'profile'}).checks.map(v=>v.value),{family,grade});
        const displayed=await page.locator('#checks .check-head strong').allTextContents();
        displayed.forEach((v,i)=>assert.ok(Math.abs(Number(v)-expectedRatio[i])<.000501,grade));
      }
    }
    // 5083 is selectable for I sections, but no made-up automatic proof strength.
    await shape('ibeam');assert.equal(await page.locator('#report').innerText(),'');assert.match(await page.locator('#status').innerText(),/管材数据仅用于/);
    await page.selectOption('#product','verified');assert.equal(await page.locator('#report').innerText(),'');
    await fill('f02',125);await dim('H',200);await dim('B',100);await dim('tf',16);await dim('tw',12);
    assert.match(await page.locator('#status').innerText(),/待复核/);assert.match(await page.locator('#report').innerText(),/用户输入/);
    // HAZ / invalid input must immediately clear previously valid report.
    await page.selectOption('#process','al-welded');assert.match(await page.locator('#status').innerText(),/热影响区/);assert.equal(await page.locator('#checks').innerText(),'');assert.equal(await page.locator('#report').innerText(),'');
    await page.selectOption('#process','al-unwelded');await fill('N','');assert.equal(await page.locator('#report').innerText(),'');await fill('N',40);
    await fill('N',100000);assert.match(await page.locator('#status').innerText(),/不满足/);await fill('N',40);
    await dim('tw',2);assert.match(await page.locator('#status').innerText(),/需进一步计算/);assert.equal(await page.locator('#checks .check').count(),1);await dim('tw',12);
    // All supported shapes render; unsupported section modes never reuse results.
    await page.selectOption('#family','stainless');
    for(const key of ['tube','box','ibeam']){await shape(key);assert.match(await page.locator('#report').innerText(),/CECS 410/);}
    await shape('csh');assert.match(await page.locator('#status').innerText(),/待补充/);assert.equal(await page.locator('#checks .check').count(),0);
    await shape('ibeam');
    await page.screenshot({path:path.resolve(root,'../materials-desktop.png'),fullPage:true});
    await page.evaluate(()=>{window.__printCount=0;window.print=()=>{window.__printCount++;};});await page.locator('#print').click();assert.equal(await page.evaluate(()=>window.__printCount),1);
    await page.emulateMedia({media:'print'});assert.equal(await page.locator('#report').isVisible(),true);await page.pdf({path:path.resolve(root,'../materials-report.pdf'),format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page overflow');
    await page.selectOption('#family','aluminium');await page.selectOption('#grade','AL6063T5');await page.selectOption('#product','profile');
    await page.screenshot({path:path.resolve(root,'../materials-mobile.png'),fullPage:true});
    await page.locator('#reset').click();assert.equal(await page.locator('#family').inputValue(),'steel');assert.equal(await page.locator('#grade').inputValue(),'Q235');assert.match(await page.locator('#report').innerText(),/GB 50017/);
    await page.reload();assert.equal(await page.locator('#family').inputValue(),'steel');assert.deepEqual(errors,[]);
    console.log('PASS browser: navigation, all 10 grades, displayed ratios, report standards, product/HAZ/invalid/local gates, 3 shapes, pending shapes, print/PDF, mobile overflow, reset, reload; no page errors');
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
