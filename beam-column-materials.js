/* Material-specific beam-column methods. N, mm, MPa internally.
 * Chinese codes and supported scope: BEAM_COLUMN_MATERIALS.md.
 * The carbon-steel engine remains unchanged and is delegated to explicitly. */
(function(root){
  'use strict';
  const steel=typeof module!=='undefined'&&module.exports?require('./steel-beam-column-core.js'):root.SteelBeamColumn;
  const grades={
    steel:['Q235','Q345','Q390','Q420','Q460'],
    stainless:['S30408','S30403','S31608','S31603','S22053','S22253'],
    aluminium:['AL6061T6','AL6063T5','AL6063T6','AL5083']
  };
  const names={AL6061T6:'6061-T6',AL6063T5:'6063-T5',AL6063T6:'6063-T6',AL5083:'5083-H112'};
  const SS={S30408:[175,205,193000],S30403:[145,170,193000],S31608:[175,205,193000],S31603:[145,170,193000],S22053:[385,450,200000],S22253:[385,450,200000]};
  // GB 50429 Appendix B, integer index lambda * sqrt(f0.2 / 240).
  // Store the published table, not a fitted carbon-steel buckling curve.
  const AL_PHI={
    weak:[
      1,1,1,1,1,1,1,1,1,.996,
      .993,.989,.985,.981,.977,.973,.969,.964,.960,.956,
      .951,.947,.942,.937,.932,.927,.921,.916,.910,.904,
      .898,.892,.885,.878,.871,.863,.855,.847,.838,.830,
      .820,.811,.801,.791,.780,.769,.758,.746,.735,.722,
      .710,.698,.685,.672,.660,.647,.634,.621,.608,.596,
      .583,.571,.558,.546,.534,.523,.511,.500,.489,.479,
      .468,.458,.448,.438,.429,.419,.410,.402,.393,.385,
      .377,.369,.361,.354,.347,.340,.333,.326,.320,.313,
      .307,.301,.295,.290,.284,.279,.274,.269,.264,.259,
      .254,.250,.245,.241,.237,.233,.228,.225,.221,.217,
      .213,.210,.206,.203,.200,.196,.193,.190,.187,.184,
      .181,.179,.176,.173,.171,.168,.166,.163,.161,.158,
      .156,.154,.152,.149,.147,.145,.143,.141,.139,.137,
      .136,.134,.132,.130,.128,.127,.125,.123,.122,.120,.119],
    strong:[
      1,1,1,1,1,1,.996,.989,.983,.976,
      .970,.963,.957,.950,.943,.936,.930,.923,.916,.909,
      .902,.894,.887,.879,.872,.864,.856,.848,.839,.831,
      .822,.813,.804,.795,.786,.776,.766,.756,.746,.736,
      .725,.715,.704,.693,.682,.671,.660,.649,.638,.626,
      .615,.604,.593,.582,.571,.560,.549,.538,.528,.517,
      .507,.497,.487,.477,.467,.458,.448,.439,.431,.422,
      .413,.405,.397,.389,.381,.373,.366,.359,.352,.345,
      .338,.331,.325,.319,.313,.307,.301,.295,.290,.285,
      .279,.274,.269,.265,.260,.255,.251,.246,.242,.238,
      .234,.230,.226,.222,.218,.215,.211,.208,.204,.201,
      .198,.195,.192,.189,.186,.183,.180,.177,.175,.172,
      .169,.167,.164,.162,.160,.158,.155,.153,.151,.149,
      .147,.145,.143,.141,.139,.137,.135,.133,.131,.130,
      .128,.126,.125,.123,.121,.120,.118,.117,.115,.114,.113]
  };
  function number(v,label,min,max){
    if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(label+'应在 '+min+'～'+max+' 之间');
    return v;
  }
  function material(p,s){
    const family=p.family||'steel';
    if(!grades[family]?.includes(p.grade))throw new Error('材料类别与牌号不匹配');
    if(family==='steel')return steel.material(p.grade,s.tmax,p.type==='chs'&&p.process==='seamless');
    if(family==='stainless'){
      const [f,fy,E]=SS[p.grade];
      return {family,grade:p.grade,name:p.grade,f,fy,E,duplex:fy===450,code:'CECS 410:2015',source:'表 3.3.1、表 3.3.6',product:'经固溶处理的板、带、管材；不计冷作强度提高'};
    }
    const fTable={AL6061T6:200,AL6063T5:90,AL6063T6:150,AL5083:90}[p.grade];
    let fy,product,source='表 4.3.4、附录 A 表 A-2';
    const productType=p.product||'profile';
    if(productType==='verified'){
      fy=number(p.f02,'产品标准或材质证明中的 f0.2（MPa）',30,600);
      product='用户输入的产品标准/材质证明值，需核对产品、状态及厚度';source='表 4.3.4；f0.2 由用户提供';
    } else if(productType==='profile'){
      if(p.grade==='AL5083')throw new Error('附录 A 未列 5083-H112 挤压型材的 f0.2。请选管材截面，或选择“产品标准/材质证明”并输入该产品的标准值。');
      fy={AL6061T6:240,AL6063T5:110,AL6063T6:180}[p.grade];product='挤压型材（含空心型材）';
    } else if(productType==='tube'){
      if(!['chs','box','shs'].includes(p.type))throw new Error('管材数据仅用于圆管/箱型截面；该截面请改选挤压型材或提供产品标准值。');
      if(p.grade==='AL6063T5')throw new Error('附录 A 未列 6063-T5 挤压管材的 f0.2；建筑空心型材请选择“挤压型材”，其他管材请提供产品标准值。');
      fy={AL6061T6:240,AL6063T6:170,AL5083:110}[p.grade];product='挤压管材';
    } else throw new Error('请选择铝合金产品类型');
    const hardening=p.grade.endsWith('T6')?'weak':'strong';
    // Product-specific proof strength must not produce f > f0.2 / gamma_R.
    const f=Math.min(fTable,fy/1.2);
    return {family,grade:p.grade,name:names[p.grade],f,fTable,fy,E:70000,G:27000,hardening,code:'GB 50429-2007',source,product,productType};
  }
  function ssCurve(p,m,axis){
    if(p.process==='ss-cold')return p.type==='chs'?[.36,0]:[.60,.56];
    if(p.process==='ss-welded')return m.duplex?(p.type==='i'&&axis==='y'?[.69,.37]:[.51,.37]):(p.type==='i'&&axis==='y'?[.89,.26]:[.66,.24]);
    return [.89,.26]; // Table 5.2.2: other sections, including annealed cold-formed tubes.
  }
  function perry(ln,alpha,lambda0){
    if(ln<=lambda0)return 1;
    const q=.5*(1+alpha*(ln-lambda0)+ln*ln);
    return Math.min(1,1/(q+Math.sqrt(Math.max(0,q*q-ln*ln))));
  }
  function buckling(lambda,m,coefficients){
    const ln=lambda/Math.PI*Math.sqrt(m.fy/m.E);
    if(m.family==='stainless')return {lambda,ln,coefficients,phi:perry(ln,...coefficients)};
    const index=lambda*Math.sqrt(m.fy/240),table=AL_PHI[m.hardening];
    if(index>150+1e-10)return {lambda,ln,index,phi:null,outOfTable:true};
    const x=Math.min(index,150),i=Math.floor(x),phi=i===150?table[150]:table[i]+(table[i+1]-table[i])*(x-i);
    return {lambda,ln,index,phi,outOfTable:false};
  }
  function local(p,m){
    const rows=[];
    const row=(name,ratio,limit)=>rows.push({name,ratio,limit,utilization:ratio/limit});
    let internal,outstand,circular,source;
    if(m.family==='stainless'){
      const group=m.duplex?2:m.fy===170?0:1,cold=p.process==='ss-cold';
      internal=(cold?[49,44,30]:[35,32,22])[group];
      outstand=(cold?[16,14,10]:[12,11,7])[group];circular=[100,90,50][group];
      source='CECS 410:2015 表 4.3.3、4.3.5，4.3.6';
    } else {
      const e=Math.sqrt(240/m.fy),weak=m.hardening==='weak';
      internal=(weak?21.5:17)*e;outstand=(weak?6:5)*e;circular=(weak?50:35)*e*e;
      source='GB 50429-2007 表 5.2.1-1、5.2.1-2（非焊接）';
    }
    if(p.type==='chs')row('圆管 D/t',p.D/p.t,circular);
    else if(p.type==='i'){
      row('翼缘悬伸 b/tf',(p.B-p.tw)/2/p.tf,outstand);
      row('腹板净高 h₀/tw',(p.H-2*p.tf)/p.tw,internal);
    } else if(p.type==='shs')row('壁板净宽 b₀/t',(p.B-2*p.t)/p.t,internal);
    else {
      row('翼缘净宽 b₀/tf',(p.B-2*p.tw)/p.tf,internal);
      row('腹板净高 h₀/tw',(p.H-2*p.tf)/p.tw,internal);
    }
    const utilization=Math.max(...rows.map(v=>v.utilization));
    return {rows,source,utilization,ok:utilization<=1+1e-10,label:utilization<=1+1e-10?'全截面有效':'需有效截面计算'};
  }
  function lateral(p,s,m,Lx,Ly){
    if(p.type!=='i')return {x:{phi:1},y:{phi:1},method:'闭口截面 φbx = φby = 1'};
    const J=(2*p.B*p.tf**3+(p.H-2*p.tf)*p.tw**3)/3;
    const Iw=p.tf*p.B**3*(p.H-p.tf)**2/24;
    function axis(I,W,L){
      // Fork supports, free warping, equal same-sign end moments through shear centre.
      // SS A.0.1 uses 0.156 explicitly; AL C-4 uses G and E.
      const Mcr=m.family==='stainless'?Math.PI**2*m.E*I/L**2*Math.sqrt(Iw/I+.039*J/I*L*L):Math.PI**2*m.E*I/L**2*Math.sqrt(Iw/I+m.G*J*L*L/(Math.PI**2*m.E*I));
      const ln=Math.sqrt(W*(m.family==='stainless'?m.fy:m.f)/Mcr);
      const coefficients=m.family==='stainless'?[.65,.41]:m.hardening==='weak'?[.20,.36]:[.25,.30];
      return {Mcr,ln,coefficients,phi:perry(ln,...coefficients)};
    }
    return {J,Iw,x:axis(s.Iy,s.Wx,Ly),y:axis(s.Ix,s.Wy,Lx),method:'双轴对称工字形，均匀弯矩、荷载过弯心；两方向分别代入简支弯扭屈曲式'};
  }
  function calculate(input){
    const p={family:'steel',bmx:1,bmy:1,...input};
    if(p.family==='steel')return steel.calculate(input);
    if(!grades[p.family])throw new Error('未知材料类别');
    const allowed=p.family==='aluminium'?['al-unwelded','al-welded']:p.type==='i'?['ss-welded']:p.type==='chs'?['ss-cold','ss-other']:['ss-cold','ss-welded'];
    if(!allowed.includes(p.process))throw new Error('截面与制造工艺不匹配');
    const s=steel.section(p),m=material(p,s);
    if(p.process==='al-welded')throw new Error('铝合金焊接构件需按第 5.3 节及表 7.2.2 计算热影响区折减。本版未输入焊缝位置及热影响区范围，暂不输出承载力结论。');
    const N=number(p.N,'轴压力 N（kN）',0,1e7)*1000;
    const Mx=Math.abs(number(p.Mx,'弯矩 Mx（kN·m）',-1e7,1e7))*1e6;
    const My=Math.abs(number(p.My,'弯矩 My（kN·m）',-1e7,1e7))*1e6;
    const Lx=number(p.Lx,'计算长度 Lx（m）',.01,1000)*1000,Ly=number(p.Ly,'计算长度 Ly（m）',.01,1000)*1000;
    const minBeta=m.family==='stainless'?.2:.3;
    ['bmx','bmy'].forEach(k=>number(p[k],k,minBeta,1));
    const bx=buckling(Lx/s.ix,m,ssCurve(p,m,'x')),by=buckling(Ly/s.iy,m,ssCurve(p,m,'y'));
    const lp=local(p,m),ltb=lateral(p,s,m,Lx,Ly);
    const gx=1,gy=m.family==='aluminium'&&p.type==='i'&&m.hardening==='weak'?1.05:1;
    const eta=p.type==='i'?1:.7,divisor=m.family==='stainless'?1.165:1.2;
    const NEx=Math.PI**2*m.E*s.Ix/Lx**2,NEy=Math.PI**2*m.E*s.Iy/Ly**2,Npx=NEx/divisor,Npy=NEy/divisor;
    const ax=m.family==='stainless'?bx.phi:m.hardening==='weak'?.75:.9;
    const ay=m.family==='stainless'?by.phi:ax;
    const dx=1-ax*N/Npx,dy=1-ay*N/Npy;
    const inRange=dx>0&&dy>0&&N<Math.min(NEx,NEy)&&!bx.outOfTable&&!by.outOfTable;
    const available=lp.ok&&!bx.outOfTable&&!by.outOfTable;
    // Full effective, unperforated sections only. Withhold gross-section capacity
    // when effective-width/thickness calculation is needed; never report a pass.
    const strength=available?N/s.A+Mx/(gx*s.Wx)+My/(gy*s.Wy):null;
    const sx=available?(inRange?N/(bx.phi*s.A)+p.bmx*Mx/(gx*s.Wx*dx)+eta*My/(ltb.y.phi*s.Wy):Infinity):null;
    const sy=available?(inRange?N/(by.phi*s.A)+eta*Mx/(ltb.x.phi*s.Wx)+p.bmy*My/(gy*s.Wy*dy):Infinity):null;
    const checks=available?[{id:'strength',name:'截面强度',value:strength/m.f,stress:strength},{id:'stabilityX',name:'绕 x 轴稳定',value:sx/m.f,stress:sx},{id:'stabilityY',name:'绕 y 轴稳定',value:sy/m.f,stress:sy}]:[];
    checks.push({id:'local',name:'全截面有效条件',value:lp.utilization});
    const warnings=[];
    if(!lp.ok)warnings.push('超过本版采用的均匀受压全截面有效限值；需按'+(m.family==='stainless'?'第 5.6 节有效宽度法':'第 5 章有效厚度法')+'进一步计算。本版不输出毛截面承载力利用率或满足结论。');
    if(bx.outOfTable||by.outOfTable)warnings.push('λ√(f0.2/240) 超出附录 B 表格上限 150；未外推稳定系数，暂不输出承载力结论。');
    if(available&&!inRange)warnings.push('轴压力达到欧拉临界力或二阶放大分母非正，稳定验算不满足。');
    const minT=p.type==='chs'||p.type==='shs'?p.t:Math.min(p.tf,p.tw);
    const needsReview=Math.max(bx.lambda,by.lambda)>150||(m.family==='stainless'&&minT<1.5)||m.productType==='verified';
    if(Math.max(bx.lambda,by.lambda)>150)warnings.push('长细比超过 150，请按构件类别复核容许长细比（'+(m.family==='stainless'?'4.3.2':'第 4.5 节')+'）。');
    if(m.family==='stainless'&&minT<1.5)warnings.push('主要承重构件厚度不宜小于 1.5 mm（4.3.1），需复核。');
    if(m.productType==='verified')warnings.push('f0.2 使用用户提供值；需核对产品标准、供货状态及适用厚度。');
    return {p,s,m,N,Mx,My,Lx,Ly,bx,by,local:lp,ltb,gx,gy,eta,divisor,NEx,NEy,Npx,Npy,ax,ay,dx,dy,strength,sx,sy,checks,warnings,inRange,available,needsReview,passing:available&&inRange&&checks.every(c=>c.value<=1+1e-10)};
  }
  const api={grades,names,material,ssCurve,perry,buckling,local,lateral,calculate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.BeamColumnMaterials=api;
})(typeof globalThis!=='undefined'?globalThis:this);
