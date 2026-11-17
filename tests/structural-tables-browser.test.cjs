'use strict';
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
  const server=http.createServer((req,res)=>{
    const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(data);});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined),headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1100},acceptDownloads:true}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const url=`http://127.0.0.1:${server.address().port}/structural-tables.html`;
    await page.goto(url+'?table=fatzer-flc-2017-p25');
    assert.equal(await page.locator('#catalog').inputValue(),'fatzer-flc-2017-p25');
    assert.equal(await page.locator('#catalog option').count(),3);assert.equal(await page.locator('#rows tr').count(),23);
    assert.equal(await page.locator('#columns th').count(),9);
    assert((await page.locator('#metrics').innerText()).includes('2,445'));
    assert((await page.locator('#source').textContent()).includes('印刷第 25 页（PDF 第 26 页）'));
    assert((await page.locator('#scope').textContent()).includes('单重包含内部填充物'));
    await page.locator('#diameter').selectOption('70');await page.locator('#minimum').fill('2446');
    assert(await page.locator('#empty').isVisible());assert(await page.locator('#export').isDisabled());
    await page.locator('#minimum').fill('2445');assert(!(await page.locator('#export').isDisabled()));
    let download=page.waitForEvent('download');await page.locator('#export').click();const dl=await download;
    assert(dl.suggestedFilename().includes('fatzer-flc-2017-p25'));
    const csv=fs.readFileSync(await dl.path(),'utf8');
    for(const text of ['FLC 全封闭索','印刷25页 PDF第26页','JGJ 257-2012','5.6.1','单重包含内部填充物','DIN EN 10264-3','2026-11-17','"70","4890","4890","2445","3444"'])assert(csv.includes(text),text);
    const dataLines=csv.split('\r\n').filter(l=>/^"\d+",/.test(l));assert.equal(dataLines.length,1);
    await page.locator('#reset').click();assert((await page.locator('#count').innerText()).includes('匹配 23 个'));
    await page.getByRole('button',{name:'查看 135 mm 索径换算',exact:true}).click();assert((await page.locator('#metrics').innerText()).includes('8,700'));
    await page.locator('#catalog').selectOption('fatzer-oss-2017-p23');assert.equal(await page.locator('#rows tr').count(),36);assert((await page.locator('#metrics').innerText()).includes('2,215'));
    await page.locator('#catalog').selectOption('kinlong-stainless-2021-p97');assert.equal(await page.locator('#rows tr').count(),20);assert((await page.locator('#basis-formula').textContent()).includes('标准值映射尚未确认'));
    await page.locator('#catalog').selectOption('fatzer-flc-2017-p25');assert.equal(await page.locator('#diameter').inputValue(),'');
    assert.equal(await page.locator('.table-scroll').evaluate(el=>el.scrollTop),0);
    await page.locator('#minimum').fill('-1');assert(await page.locator('#error').isVisible());await page.locator('#reset').click();
    await page.screenshot({path:path.resolve(root,'../fatzer-flc-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    assert(await page.evaluate(()=>document.querySelector('.table-scroll').scrollWidth>document.querySelector('.table-scroll').clientWidth));
    await page.screenshot({path:path.resolve(root,'../fatzer-flc-mobile.png'),fullPage:true});
    await page.goto(url+'?table=missing');assert.equal(await page.locator('#catalog').inputValue(),'fatzer-oss-2017-p23');
    await page.goto(url);assert.equal(await page.locator('#catalog').inputValue(),'fatzer-oss-2017-p23');
    assert.deepEqual(errors,[]);
    console.log('PASS browser: FLC direct link, all three tables, boundaries, full table, row selection, source labels, CSV, mobile scrolling, invalid link fallback; no page errors.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
