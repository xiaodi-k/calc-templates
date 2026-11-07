(function (root) {
  'use strict';
  const diameters = [6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,40,45,50,55,60,65,70,75,80,85,90,95,100,105,110,115,120,125,130,135];
  const characteristic = [33.9,60.7,94.4,135,184,240,298,368,445,532,624,713,816,931,1052,1168,1450,1830,2260,2730,3250,3810,4430,5080,5790,6530,7320,8160,9040,9990,10900,12000,13000,14100,15300,16500];
  const areas = [22,39.4,61.3,87.9,119,156,198,244,295,353,414,479,548,625,706,793,929,1180,1450,1750,2090,2450,2840,3260,3710,4190,4700,5240,5800,6400,7020,7680,8360,9060,9810,10600];
  const stiffness = [3.52,6.31,9.81,14.1,19.1,24.9,31.6,39,47.3,56.5,66.3,76.6,87.7,99.9,113,127,149,189,232,280,334,392,454,522,594,670,752,838,928,1024,1123,1229,1338,1450,1570,1696];
  const weights = [.2,.3,.5,.7,1,1.3,1.6,2,2.4,2.9,3.4,3.9,4.5,5.1,5.8,6.5,7.7,9.8,12,15,17,20,24,27,31,35,39,44,48,53,58,64,69,75,81,88];
  const table = {
    id:'fatzer-oss-2017-p23', title:'FATZER OSS 单股螺旋钢丝绳', category:'索结构', version:'1.0.0', updated:'2026-11-07',
    source:{publisher:'FATZER',file:'CN-EN-FATZER-Structural-Ropes-Brochure-13-06-2017.pdf',edition:'06-2017',printedPage:23,pdfPage:24,sha256:'83B0635BBF40F8F3E42856119642C319C24D05E7156D1BA3331B0CC227AAB9CC',url:'https://www.fatzer.com/en/downloads'},
    standard:{title:'JGJ 257-2012《索结构技术规程》',clause:'5.6.1',factor:2,url:'https://www.cnass.cn/upload/gjgfenhui/file/20230116/1673863781152662.pdf',type:'中国行业标准'},
    productStandards:['DIN EN 12385-10','DIN EN 10264-2'],
    assumptions:'本表指定以厂家特征破断拉力 Fuk 作为极限抗拉力标准值，按拉索抗力分项系数 2.0 换算。此标准值映射是本 Demo 的取值约定。',
    scope:'高强度非合金钢丝，Zn95Al5 镀层，内部无填充。E = 160 ± 10 kN/mm²。公称直径公差 0% / +3%。不适用于不锈钢 OSS 或 FLC。',
    rows:diameters.map((d,i)=>({diameter:d,fuk:characteristic[i],design:characteristic[i]/2,area:areas[i],equivalentDiameter:Math.sqrt(4*areas[i]/Math.PI),ea:stiffness[i],weight:weights[i],socket:d<=36?'压接':'树脂或金属浇注'}))
  };
  const catalog=[table];
  function selectRows(t,diameter,minDesign){
    const min=minDesign===''?0:Number(minDesign);
    if(!Number.isFinite(min)||min<0)throw new Error('设计张拉力下限请输入不小于 0 的数值。');
    return t.rows.filter(r=>(diameter===''||r.diameter===Number(diameter))&&r.design>=min);
  }
  const api={catalog,selectRows};root.StructuralTables=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
