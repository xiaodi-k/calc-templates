/* Browser regression against the actual column-base viewer. Pass the reference
   viewer and its engine as CLI arguments when running outside the demo repo. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const here = __dirname;
const reference = process.argv[2] || path.resolve(here, '../column-base/viewer.js');
const columnEngine = process.argv[3] || path.join(path.dirname(reference),'engine.js');
const executablePath = process.env.CHROME_PATH || undefined;

async function settle(page) {
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
}
async function main(){
  const browser=await chromium.launch({headless:true,executablePath});
  try{
    const pages=await Promise.all([1,2].map(()=>browser.newPage({viewport:{width:840,height:760}})));
    const [ref,embed]=pages;
    await ref.setContent('<div id="model-view" tabindex="0"></div><div id="active-property"></div><b id="view-title"></b><b id="zoom-label"></b>'+
      '<button id="fit-view"></button><button id="pan-view"></button><button id="zoom-in"></button><button data-view="side"></button>'+
      '<style>body{margin:0}#model-view{margin-top:55px;width:800px;height:592px}#model-view svg{width:100%;height:100%;display:block}</style>');
    await ref.addScriptTag({path:columnEngine});
    await ref.evaluate(()=>{
      // Capture the public view transform presented to the original renderer.
      window.SolidRenderer=class {
        constructor(){this.canvas=document.createElement('canvas');}
        draw(faces,project,raw){window.matrix=[[1,0,0],[0,1,0],[0,0,1]].map(raw);}
        pick(){return null;}
      };
    });
    await ref.addScriptTag({path:reference});
    await ref.evaluate(()=>{BaseViewer.init();BaseViewer.update(BaseCalc.DEFAULT,BaseCalc.calculate(BaseCalc.DEFAULT));});
    await embed.setContent('<main id="model"></main><style>body{margin:0}#model{width:800px;height:680px}</style>');
    await embed.addStyleTag({path:path.join(here,'viewer.css')});
    await embed.addScriptTag({path:path.join(here,'engine.js')});
    await embed.addScriptTag({path:path.join(here,'viewer.js')});
    await embed.evaluate(()=>{
      window.viewer=EmbedViewer.create(document.getElementById('model'),k=>window.lastField=k);
      window.p={...EmbedEngine.DEFAULTS,anchorType:'hooked',plateThickness:16,endBarDiameter:20,endBarLength:100,endBarCount:1};
      viewer.update(p);
    });
    await settle(embed);
    const targetSize=await ref.locator('#model-view').boundingBox();
    await embed.addStyleTag({content:'.ev-stage{width:'+targetSize.width+'px;min-height:'+targetSize.height+'px;max-height:'+targetSize.height+'px}'});
    await settle(embed);
    const boxes=await Promise.all([ref.locator('#model-view').boundingBox(),embed.locator('.ev-stage').boundingBox()]);
    let count=0;
    async function check(title) {
      await Promise.all(pages.map(settle));
      const states=await Promise.all([ref.evaluate(()=>BaseViewer.getState()),embed.evaluate(()=>viewer.getState())]);
      for(const k of ['yaw','elevation','panX','panY','zoom']){
        assert.ok(Math.abs(states[0][k]-states[1][k])<2e-9,title+' '+k+': '+states.map(s=>s[k]).join(' / '));
      }
      assert.equal(states[1].panMode,states[0].panMode);
      const [matrix,directions]=await Promise.all([ref.evaluate(()=>window.matrix),embed.evaluate(()=>[...document.querySelectorAll('.ev-stage [data-axis]')].map(e=>[
        'xyz'.indexOf(e.dataset.axis),(e.x2.baseVal.value-e.x1.baseVal.value)/21,(e.y2.baseVal.value-e.y1.baseVal.value)/21]))]);
      for(const [axis,x,y] of directions){
        assert.ok(Math.hypot(x-matrix[axis][0],y-matrix[axis][1])<2e-6,title+' '+axis+' projection differs');
      }
      count++;
    }
    async function drag(dx,dy,{shift=false,button='left'}={}) {
      await Promise.all(pages.map(async(page,i)=>{
        const {x,y}=boxes[i],sx=x+45,sy=y+150;
        if(shift)await page.keyboard.down('Shift');
        await page.mouse.move(sx,sy);await page.mouse.down({button});
        await page.mouse.move(sx+dx,sy+dy,{steps:3});await page.mouse.up({button});
        if(shift)await page.keyboard.up('Shift');
      }));
    }
    const controls=async(a,b)=>Promise.all([ref.locator(a).evaluate(e=>e.click()),embed.locator(b).evaluate(e=>e.click())]);
    const wheel=async(delta)=>Promise.all(pages.map(async(page,i)=>{
      const {x,y}=boxes[i];await page.mouse.move(x+190,y+167);await page.mouse.wheel(0,delta);
      await page.waitForFunction(({now})=>performance.now()>now+50,{now:await page.evaluate(()=>performance.now())});
    }));
    await check('initial orientation');
    await drag(1,1);await check('drag threshold');
    await drag(118,-36);await check('horizontal and vertical drag');
    const fixed=await embed.locator('.ev-stage svg').getAttribute('data-scale');
    await drag(220,390);await check('upper elevation stop');
    assert.equal(await embed.locator('.ev-stage svg').getAttribute('data-scale'),fixed);
    await drag(15,-145);await drag(15,-145);await check('lower elevation stop');
    for(let i=0;i<4;i++)await drag(260,0);
    await check('continuous azimuth past two pi');
    await drag(48,35,{shift:true});await check('shift-pan');
    await drag(30,14,{button:'middle'});await check('middle-button pan');
    await controls('#pan-view','[data-action="pan"]');await drag(19,53);await check('pan tool');
    await controls('#pan-view','[data-action="pan"]');
    await wheel(-130);await check('off-centre cursor zoom');
    await wheel(-4096);await check('8x zoom limit');
    await wheel(8192);await check('0.25x zoom limit');
    await controls('#zoom-in','[data-action="in"]');await check('zoom increment');
    await controls('#fit-view','[data-action="fit"]');await check('fit preserves angles');
    await controls('[data-view="side"]','[data-action="section"]');await drag(32,18);await check('side view pan');
    await Promise.all([ref.locator('#model-view').press('ArrowRight'),embed.locator('.ev-stage').press('ArrowRight')]);
    await check('keyboard returns to iso');
    for(const type of ['hooked','headed','headedBolt','rebar','weldedRebar']){
      await embed.evaluate(type=>{viewer.setView('section');viewer.update({...p,anchorType:type,fc:null});},type);
      await settle(embed);
      assert.ok((await embed.locator('.ev-stage [data-part="plate"]').count())>0,type+' visible irrespective of fc');
    }
    await embed.locator('[data-field="endBarLength"]').click();
    assert.equal(await embed.evaluate(()=>window.lastField),'endBarLength');
    const single=await embed.locator('[data-part="end-bar"]').count();
    await embed.evaluate(()=>viewer.update({...p,anchorType:'weldedRebar',endBarCount:2}));
    await settle(embed);assert.equal(await embed.locator('[data-part="end-bar"]').count(),single*2);
    const oldPlate=await embed.locator('[data-part="plate"]').boundingBox();
    await embed.evaluate(()=>viewer.update({...p,plateThickness:32}));
    await settle(embed);const thickPlate=await embed.locator('[data-part="plate"]').boundingBox();
    assert.ok(thickPlate.height>oldPlate.height*1.8);
    console.log(count+' interaction/projection comparisons, five anchor previews, parallel end bar count, live plate thickness: passed.');
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
