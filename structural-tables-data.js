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
  table.forceLabel='特征破断拉力 / 标准值';
  table.forceSymbol='Fuk';
  table.designLabel='设计张拉力';
  table.columns=[['diameter','公称索径 d [mm]'],['fuk','特征破断拉力 Fuk [kN]'],['design','设计张拉力 Fd [kN]'],['area','公称金属面积 A [mm²]'],['equivalentDiameter','面积等效圆直径 [mm]'],['ea','刚度 EA [MN]'],['weight','单重 G [kg/m]'],['socket','索头条件']];
  const kinlongValues=[
    [30,'1×91',2.73,531.60,693.74],
    [32,'1×91',2.91,604.85,789.33],
    [34,'1×91',3.09,682.82,891.07],
    [36,'1×91',3.27,765.51,998.99],
    [38,'1×91',3.45,852.93,1113.07],
    [40,'1×91',3.64,945.07,1233.32],
    [42,'1×91',3.82,1041.94,1359.74],
    [45,'1×91',4.09,1196.11,1508.89],
    [48,'1×91',4.36,1360.91,1716.78],
    [52,'1×127',4.00,1595.93,2013.26],
    [56,'1×127',4.31,1850.90,2334.91],
    [60,'1×169',4.00,2123.72,2648.27],
    [65,'1×169',4.33,2492.42,3108.04],
    [70,'1×217',4.12,2889.67,3603.42],
    [75,'1×271',3.95,3316.46,4135.62],
    [80,'1×271',4.21,3773.39,4705.42],
    [85,'1×331',4.05,4259.09,5311.09],
    [90,'1×331',4.29,4774.90,5954.30],
    [95,'1×331',4.52,5320.18,6634.27],
    [100,'1×331',4.76,5894.94,7350.99]
  ];
  const kinlong={
    id:'kinlong-stainless-2021-p97',title:'坚朗 热铸型不锈钢拉索 · 普通索',category:'索结构',version:'1.0.0',updated:'2026-11-07',
    source:{publisher:'广东坚朗五金制品股份有限公司',file:'点支承玻璃幕墙配件典型产品目录（用户提供封面及参数页截图）',edition:'2021年1月印刷',printedPage:'96–97',pdfPage:null,url:'https://www.kinlong.com',evidence:'用户上传的封面、封底与 96/97 跨页截图；未提供原 PDF，PDF 页序及整本文件哈希未核验。'},
    standard:table.standard,productStandards:[],forceLabel:'钢索最小破断拉力',forceSymbol:'Fmin',designLabel:'破断力 / 2（参考）',
    assumptions:'原表给出钢索最小破断拉力，未标注为特征值。延续本 Demo 的除以 2 口径提供参考换算，不自动认定其等同规范极限抗拉力标准值；正式设计值需确认厂家标准值及连接适用条件。',
    scope:'热铸型不锈钢拉索（“易张拉”系列），普通索参数；型号 G02、H02、K02。钢绞线 316/2205；紧固件 316（A4-70）；螺杆、销轴 2205；索头、锚杯 CD3MN；生产范围 Φ30–Φ100。E = (1.30 ± 0.10) × 10⁵ N/mm²。截图同时展示密封索示意，但本参数表仅适用于普通索。厂家注：可生产更高强度拉索，需另行询价。',
    columns:[['diameter','钢索直径 [mm]'],['structure','参考结构'],['wireDiameter','钢丝直径 [mm]'],['area','金属断面积 [mm²]'],['fuk','钢索最小破断拉力 [kN]'],['design','破断力 / 2（参考）[kN]'],['equivalentDiameter','面积等效圆直径 [mm]'],['modulus','弹性模量 [10⁵ N/mm²]']],
    rows:kinlongValues.map(([diameter,structure,wireDiameter,area,force])=>({diameter,structure,wireDiameter,area,fuk:force,design:force/2,equivalentDiameter:Math.sqrt(4*area/Math.PI),modulus:'1.30 ± 0.10'}))
  };
  const catalog=[table,kinlong];
  function selectRows(t,diameter,minDesign){
    const min=minDesign===''?0:Number(minDesign);
    if(!Number.isFinite(min)||min<0)throw new Error('设计张拉力下限请输入不小于 0 的数值。');
    return t.rows.filter(r=>(diameter===''||r.diameter===Number(diameter))&&r.design>=min);
  }
  const api={catalog,selectRows};root.StructuralTables=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
