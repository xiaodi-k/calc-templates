/* ACI CODE-318-25, inch-pound edition. UI dimensions are mm, MPa, kN and kN m. */
(function (makeEngine) {
  'use strict';
  const api = makeEngine();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.EmbedEngine = api;
})(function () {
  'use strict';
  const DEFAULTS = Object.freeze({
    anchorType:'hooked', fc:35, fy:280, fu:420, d:16, eh:64, dh:28, headHeight:16,
    hef:165, h:320, sx:110, sy:140, nx:3, ny:3, left:300, right:300, bottom:150,
    top:300, cover:40, plateX:320, plateY:400, plateThickness:20, straight:125, ductile:true,
    aseN:157, aseV:157, bearingArea:165, nutDetailVerified:false,
    endBarDiameter:20, endBarLength:100, endBarCount:1,
    nu:36, mx:0, vy:20, mode:'elastic', tPlus:null, tMinus:null
  });
  const scope = Object.freeze([
    'ACI CODE-318-25 英制版第 17 章。按开裂普通重混凝土、非冗余连接、无补充配筋计算。表 21.2.1 取混凝土受拉 φ=0.65、受剪 φ=0.75；表 17.5.4.1 取 ψa=0.95。输入和报告使用公制。',
    '矩形等间距、同型号锚件与刚板焊接，焊接须能向全部锚件分配剪力；沿 ±Y 传剪，刚板直接贴合混凝土，锚杆不施加安装扭矩。§17.7.2.1.4 取背离受剪边的最后排承担全剪力。',
    '作用取同一强度组合并移至钢板传力面及锚群形心。双向剪切、扭转、另一轴弯矩、地震、疲劳和冲击须另建模型。',
    '§17.1.2(a,b) 要求锚头或钩部在未开裂混凝土中具备已验证的抗拔几何（至少 1.4Np）。钩形锚栓不计摩擦。端螺母按经核定的几何、有效螺纹截面和实际净承压面积输入。带肋钢筋传拉另见 §17.1.7、§17.1.8 和第 25 章。',
    '2025 版 §17.8 对锚群的混凝土和钢材分别作 5/3 次幂和同锚平方组合。2019 版的 0.2 分支和 1.2 三折线只用于历史算例。',
    '本工具给出锚固分项结果。项目须另验锚板、焊缝、局部承压、主体传力、锚群间相互影响和包括钩端在内的实际净保护层。延性材须有相应试验证明。'
  ]);
  const inch=25.4, lbf=0.0044482216152605, psi=lbf*1000/inch**2;
  const phiConcreteN=.65, phiConcreteV=.75, psiA=.95;
  const min=Math.min, max=Math.max, abs=Math.abs;
  const labels={fc:'混凝土强度',fy:'屈服强度',fu:'极限强度',d:'杆径',eh:'钩伸出长度',dh:'头径',
    headHeight:'承压基准以下钢材高度',hef:'有效埋深',h:'构件厚度',sx:'X 向间距',sy:'Y 向间距',
    nx:'列数',ny:'排数',left:'左边距',right:'右边距',bottom:'下边距',top:'上边距',cover:'净保护层',
    plateX:'锚板宽',plateY:'锚板长',plateThickness:'实际锚板厚度',straight:'等径直段长',aseN:'螺杆有效受拉面积',aseV:'螺杆有效受剪面积',bearingArea:'螺母净承压面积',
    endBarDiameter:'附焊短筋直径',endBarLength:'附焊短筋长度',endBarCount:'附焊短筋根数',nu:'设计拉力',mx:'设计弯矩',vy:'设计剪力',tPlus:'上排拉力',tMinus:'下排拉力'};
  function normalize(input) {
    const p={...input}, errors=[];
    const hook=p.anchorType==='hooked', bolt=p.anchorType==='headedBolt', bar=p.anchorType==='weldedRebar';
    const active=Object.keys(labels).filter(k=>{
      if(k==='dh') return p.anchorType==='headed'||bolt;
      if(k==='headHeight') return !bar;
      if(k==='eh') return hook;
      if(k==='straight') return hook||bolt;
      if(['aseN','aseV','bearingArea'].includes(k)) return bolt;
      if(k.startsWith('endBar')) return bar;
      if(k==='tPlus'||k==='tMinus') return p.mode==='contact';
      return true;
    });
    for(const k of active){
      if(typeof p[k]==='string' && p[k].trim()!=='') p[k]=Number(p[k]);
      if(!Number.isFinite(p[k])) errors.push(labels[k]+'须填写有限数值。');
      else if(!['nu','mx','vy','tPlus','tMinus'].includes(k) && p[k]<=0) errors.push(labels[k]+'须大于零。');
    }
    if(!['hooked','headed','headedBolt','weldedRebar'].includes(p.anchorType)) errors.push('请选择支持的现浇锚件。');
    if(!['elastic','contact'].includes(p.mode)) errors.push('选择弹性分配或输入接触分析结果。');
    if(typeof p.ductile!=='boolean') errors.push('确认锚材是否符合延性条件。');
    if(errors.length) return {p,errors};
    if(p.fc<2500*psi||p.fc>10000*psi||p.fu<p.fy||p.d>50) errors.push('本工具混凝土范围 2500～10000 psi（约 17.24～68.95 MPa），要求 futa ≥ fya、da ≤ 50 mm。');
    if([p.nx,p.ny].some(v=>!Number.isInteger(v)||v<2||v>10)) errors.push('X 向列数和 Y 向排数应为 2～10 的整数。');
    if(!bar && p.hef>25*inch) errors.push('本工具限定 hef ≤ 25 in.（635 mm）。');
    if(hook && p.eh<3*p.d) errors.push('L 钩要求 eh ≥ 3da。');
    if((bolt||hook) && p.straight>p.hef) errors.push('等径直段长度须 ≤ hef。');
    if((p.anchorType==='headed'||bolt) && p.dh<=p.d) errors.push('头部直径或螺母对边宽须大于杆径。');
    if(bolt){
      const gross=Math.PI*p.d**2/4, hex=Math.sqrt(3)*p.dh**2/2-gross;
      if(p.aseN>=gross || p.aseV>gross || p.bearingArea>hex) errors.push('普通等径螺杆的螺纹受拉有效面积须小于毛截面，受剪有效面积不得大于毛截面，净承压面积不得超过六角外形扣除杆孔后的上限。');
      if(p.nutDetailVerified!==true) errors.push('请先核定端螺母锚头符合 §17.1.2(a)、螺纹啮合与强度、有效承压面积、板端焊接及可焊性，再确认详图。');
    }
    if(bar && ![1,2].includes(p.endBarCount)) errors.push('附焊筋仅支持单侧一根或对向两侧各一根。');
    const envelope=bolt?2*p.dh/Math.sqrt(3):bar?p.d+2*p.endBarDiameter:hook?p.d:p.dh;
    const edge=min(p.left,p.right,p.bottom,p.top);
    if(!bar && (edge-envelope/2<p.cover || p.h-p.hef-p.headHeight<p.cover)) errors.push('侧面或背面净保护层不足。尾部露丝长度须计入实际背部突出高度。');
    if(!bar && (min(p.sx,p.sy)<4*p.d || min(p.sx,p.sy)<=envelope)) errors.push('未施扭矩的现浇锚中心距须 ≥ 4da，且钢材外缘之间应有净距。');
    const wx=(p.nx-1)*p.sx, wy=(p.ny-1)*p.sy;
    if(p.plateX<=wx+p.d||p.plateY<=wy+p.d) errors.push('最外排锚杆与锚板边缘须有净距。');
    if(p.plateX>wx+2*min(p.left,p.right)||p.plateY>wy+2*min(p.bottom,p.top)) errors.push('居中锚板超出混凝土边界。');
    if(!bar && max(p.sx,p.sy)>=3*min(p.hef,edge)) errors.push('相邻锚投影未连续重叠，超出本计算模型。');
    if(p.mode==='elastic' && [p.tPlus,p.tMinus].some(v=>v!==null&&v!==undefined&&v!=='')) errors.push('弹性分配时清空上、下排接触分析结果。');
    return {p,errors};
  }
  function distribute(p) {
    const ymax=(p.ny-1)*p.sy/2;
    const rows=Array.from({length:p.ny},(_,j)=>({y:j*p.sy-ymax,tension:0,perAnchor:0}));
    let compression=0, yc=null;
    if(p.mode==='elastic'){
      const sumY2=rows.reduce((s,r)=>s+r.y*r.y,0);
      for (const r of rows) r.tension=p.nu/p.ny+1000*p.mx*r.y/sumY2;
      const minForce=min(rows[0].tension, rows[p.ny-1].tension);
      if(minForce < -1e-9 || (p.ny>2 && p.nu>0 && minForce<=1e-9))
        return {error:'出现零拉力排或受压排。请根据板与混凝土接触分析输入外排拉力。'};
      rows.forEach(r=>{r.tension=max(0,r.tension);});
    } else {
      if(min(p.tPlus,p.tMinus)<0 || (p.ny>2 && min(p.tPlus,p.tMinus)>0))
        return {error:'外排拉力不得为负。超过两排时，接触模式仅支持单侧外排受拉或全压。'};
      rows[0].tension=p.tMinus; rows[p.ny-1].tension=p.tPlus;
      compression=p.tPlus+p.tMinus-p.nu;
      const moment=(p.tPlus-p.tMinus)*ymax-1000*p.mx;
      if(compression<0||abs(moment)>compression*p.plateY/2+1e-6)
        return {error:'外排拉力与输入荷载无法在锚板范围内满足力和力矩平衡。'};
      if(compression>0){
        yc=moment/compression;
        if((p.tPlus>p.tMinus && yc>=(p.tMinus>0?-ymax:ymax))||
           (p.tMinus>p.tPlus && yc<=(p.tPlus>0?ymax:-ymax))||
           (p.tPlus===p.tMinus && p.tPlus>0))
          return {error:'压力合力位置与锚板开启方向不相容，请复核接触分析。'};
      }
    }
    rows.forEach(r=>{r.perAnchor=r.tension/p.nx;});
    const active=rows.filter(r=>r.tension>0);
    const total=active.reduce((sum,r)=>sum+r.tension,0);
    const tensionCentroid=total?active.reduce((sum,r)=>sum+r.tension*r.y,0)/total:0;
    const activeCentroid=active.length?active.reduce((sum,r)=>sum+r.y,0)/active.length:0;
    return {rows,compression,yc,total,maxT:max(...rows.map(r=>r.perAnchor)),tensionCentroid,activeCentroid,
      eccN:abs(tensionCentroid-activeCentroid),activeGroup:active.length===1?(active[0].y>0?'top':'bottom'):'all'};
  }
  // Each subgroup has its own projected area and nearest edges.
  function tensionGroup(p,group){
    const nx=['left','right'].includes(group)?1:p.nx;
    const ny=['top','bottom'].includes(group)?1:p.ny;
    const wx=(p.nx-1)*p.sx, wy=(p.ny-1)*p.sy;
    const edges=[p.left+(group==='right'?wx:0),p.right+(group==='left'?wx:0),
      p.bottom+(group==='top'?wy:0),p.top+(group==='bottom'?wy:0)];
    const near=edges.filter(c=>c<1.5*p.hef);
    const influence=edges.filter(c=>c<=1.5*p.hef);
    const pitch=max(nx>1?p.sx:0,ny>1?p.sy:0);
    const he=near.length>=3?max(max(...influence)/1.5,pitch/3):p.hef;
    const r=1.5*he, ANco=9*he**2;
    const width=(nx-1)*p.sx+min(r,edges[0])+min(r,edges[1]);
    const height=(ny-1)*p.sy+min(r,edges[2])+min(r,edges[3]);
    const ANc=min(width*height,nx*ny*ANco);
    const psiEd=min(1,.7+.3*min(...edges)/r);
    // Chapter 17 inch-pound coefficients. Convert non-homogeneous expressions explicitly.
    const deep=p.anchorType!=='hooked' && he>=11*inch;
    const Nb=(deep?16:24)*Math.sqrt(p.fc/psi)*(he/inch)**(deep?5/3:1.5)*lbf;
    const nominal=ANc/ANco*psiA*psiEd*Nb;
    return {group,nx,ny,edges,he,width,height,ANco,ANc,psiEd,Nb,deep,nominal,design:phiConcreteN*nominal};
  }
  function shearFace(p,face){
    const parallel=face==='left'||face==='right';
    const count=parallel?p.ny:p.nx, normalCount=parallel?p.nx:p.ny;
    const along=parallel?p.sy:p.sx, across=parallel?p.sx:p.sy;
    const side1=parallel?p.bottom:p.left, side2=parallel?p.top:p.right;
    const far=p[face]+(normalCount-1)*across;
    const limit=max(side1/1.5,side2/1.5,p.h/1.5,along/3);
    const ca=max(side1,side2,p.h)<1.5*far?min(far,limit):far;
    const AVco=4.5*ca**2;
    const width=min(1.5*ca,side1)+(count-1)*along+min(1.5*ca,side2);
    const AVc=min(count*AVco,width*min(1.5*ca,p.h));
    const psied=parallel?1:min(1,.7+.3*min(side1,side2)/(1.5*ca));
    const psih=max(1,Math.sqrt(1.5*ca/p.h));
    const le=min(p.hef,8*p.d,p.anchorType==='headed'?Infinity:p.straight);
    const Vb=min(7*(le/p.d)**.2*Math.sqrt(p.d/inch),9)*Math.sqrt(p.fc/psi)*(ca/inch)**1.5*lbf;
    const direction=parallel?2:1;
    const nominal=AVc/AVco*psiA*psied*psih*Vb*direction;
    return {face,parallel,count,far,ca,side1,side2,le,AVco,AVc,psied,psih,direction,Vb,nominal,design:phiConcreteV*nominal};
  }
  function historicInteraction(etaN,etaV){
    const required=min(etaN,etaV)>.2+1e-12;
    return {required,sum:etaN+etaV,limit:1.2,ratio:required?(etaN+etaV)/1.2:0};
  }
  function interact(etaN,etaV,exponent=5/3){
    return {etaN,etaV,exponent,ratio:etaN**exponent+etaV**exponent,limit:1};
  }
  function blowoutBase(p,ca,Abrg){
    return psiA*160*(ca/inch)*Math.sqrt(Abrg/inch**2)*Math.sqrt(p.fc/psi)*lbf;
  }
  function cornerFactor(ca,ca2){
    return min(1,(1+max(1,ca2/ca))/4);
  }
  function sideBlowouts(p,distribution,Abrg){
    if(Abrg===null || !distribution.total) return [];
    const active=distribution.rows.filter(row=>row.tension>0);
    const yMin=distribution.rows[0].y,yMax=distribution.rows.at(-1).y;
    const bottom=p.bottom+active[0].y-yMin, top=p.top+yMax-active.at(-1).y;
    const wy=active.at(-1).y-active[0].y, wx=(p.nx-1)*p.sx;
    const faces=[['left',p.left,min(bottom,top),wy,active.length],['right',p.right,min(bottom,top),wy,active.length],
      ['bottom',bottom,min(p.left,p.right),wx,p.nx],['top',top,min(p.left,p.right),wx,p.nx]];
    return faces.filter(([,ca])=>p.hef>2.5*ca).map(([face,ca,ca2,span,count])=>{
      const base=blowoutBase(p,ca,Abrg), corner=cornerFactor(ca,ca2);
      const single=phiConcreteN*base*corner;
      const factor=count>1?1+span/(6*ca):corner;
      const design=phiConcreteN*base*factor;
      return {face,ca,ca2,span,count,base,corner,single,factor,design};
    });
  }
  function weakestIndividualSide(p,distribution,Abrg){
    let weakest=null;
    for(const [j,r] of distribution.rows.entries()){
      if(!r.perAnchor) continue;
      for(let i=0;i<p.nx;i++){
        const edges={left:p.left+i*p.sx,right:p.right+(p.nx-1-i)*p.sx,
          bottom:p.bottom+j*p.sy,top:p.top+(p.ny-1-j)*p.sy};
        const [face,ca]=Object.entries(edges).reduce((a,b)=>a[1]<=b[1]?a:b);
        if(p.hef<=2.5*ca) continue;
        const ca2=face==='left'||face==='right'?min(edges.bottom,edges.top):min(edges.left,edges.right);
        const corner=cornerFactor(ca,ca2),design=phiConcreteN*blowoutBase(p,ca,Abrg)*corner;
        const candidate={face,ca,ca2,corner,design,demand:r.perAnchor,ratio:r.perAnchor/design,row:j+1,col:i+1};
        if(!weakest||candidate.ratio>weakest.ratio) weakest=candidate;
      }
    }
    return weakest;
  }
  function weldedReview(p){
    const a=p.endBarCount,d=p.d,requiredLength=(a===1?5:3)*d;
    const envelope=d/2+p.endBarDiameter, wx=(p.nx-1)*p.sx,wy=(p.ny-1)*p.sy;
    const specialChecks=[];
    const add=(label,actual,required,status,clause)=>specialChecks.push({label,actual,required,status,clause});
    const cn='GB/T 50010-2010（2024 年版）';
    add('末端纵向贴焊的同径短筋',p.endBarDiameter+' mm',d+' mm',p.endBarDiameter===d?'pass':'fail',cn+' 表 8.3.3');
    add(a===1?'单侧一根短筋':'两侧对称各一根短筋',p.endBarLength+' mm','每根 ≥ '+requiredLength+' mm',p.endBarLength>=requiredLength?'pass':'fail',cn+' 表 8.3.3');
    add('短筋位于主筋末端的并列段',p.endBarLength+' mm','主筋混凝土内长度 ≥ 短筋长度',p.hef>=p.endBarLength?'pass':'fail','详图几何');
    const sideCover=min(p.left,p.right,p.bottom,p.top)-envelope,backCover=p.h-p.hef;
    add('短筋突出方向按不利方位取净保护层',min(sideCover,backCover).toFixed(1)+' mm','≥ '+p.cover+' mm',min(sideCover,backCover)>=p.cover?'pass':'fail','项目保护层与详图');
    const plateEdge=min((p.plateX-wx)/2,(p.plateY-wy)/2);
    add('锚筋中心至钢板边缘',plateEdge.toFixed(1)+' mm','≥ '+max(2*d,20)+' mm',plateEdge>=max(2*d,20)?'pass':'fail',cn+' §9.7.4');
    add('受拉主筋的锚固投影',p.hef+' mm','合格机械锚固另核 ≥ 0.6lab','review',cn+' §8.3.3、§9.7.4');
    add('短筋与主筋之间的焊缝','待输入接头设计、焊长和尺寸','焊缝独立满足传力，另核可焊性','review',cn+' 表 8.3.3 注 1');
    add('钢筋受压与板面接触分配','需根据钢筋实际轴力确定',a===1?'受压钢筋禁用单侧贴焊':'受压锚固按压筋条件另核','review',cn+' §8.3.4');
    if(a===1) add('截面角部的单侧贴焊筋朝向','需按实际详图核对','宜向截面内侧偏置','review',cn+' 表 8.3.3 注 5');
    add('美国项目锚固路径','无已验证的该端部抗拔承压模型','按第 25 章发展并核群筋崩裂，或设计锚固钢筋','review','ACI CODE-318-25 §17.1.7、§17.1.8、§17.5.2.1');
    return {...invalid(['纵向贴焊短筋只给出构造核对。短筋的构造长度不能作为主筋的美标抗拔承载力。']),status:'special',specialChecks,
      trace:{requiredLength,endBarDiameter:p.endBarDiameter,endBarCount:p.endBarCount,endBarLength:p.endBarLength,plateThickness:p.plateThickness}};
  }
  function invalid(errors){
    return {ok:false,status:'invalid',errors,utilization:null,etaN:null,etaV:null,interaction:null,governing:null,
      checks:[],distribution:null,trace:null,scope};
  }
  function calculate(input){
    const {p,errors}=normalize(input||{});
    if(errors.length) return invalid(errors);
    if(p.anchorType==='weldedRebar') return weldedReview(p);
    const distribution=distribute(p);
    if(distribution.error) return invalid([distribution.error]);
    const hook=p.anchorType==='hooked', bolt=p.anchorType==='headedBolt', As=Math.PI*p.d**2/4;
    const AseN=bolt?p.aseN:As, AseV=bolt?p.aseV:As;
    const fut=min(p.fu,1.9*p.fy,125000*psi);
    const phiN = p.ductile ? 0.75 : 0.65;
    const phiV = p.ductile ? 0.65 : 0.60;
    const alphaV=p.anchorType==='headed'?1:.6;
    const steelN=phiN*AseN*fut/1000, steelV=phiV*alphaV*AseV*fut/1000;
    const eh=hook?min(p.eh,4.5*p.d):null, Abrg=hook?null:bolt?p.bearingArea:Math.PI*(p.dh**2-p.d**2)/4;
    const pullout=phiConcreteN*psiA*(hook ? 0.9*p.fc*eh*p.d : 8*p.fc*Abrg)/1000;
    const sideFaces=sideBlowouts(p,distribution,Abrg);
    const sideSingle=sideFaces.length?weakestIndividualSide(p,distribution,Abrg):null;
    const sideControl=sideFaces.reduce((a,b)=>a===null||b.design<a.design?b:a,null);
    const sideface=sideControl?.design??null;
    const ca1=sideControl?.ca??min(p.left,p.right,p.bottom,p.top),ca2=sideControl?.ca2??max(min(p.left,p.right),min(p.top,p.bottom));
    const groups=Object.fromEntries(['all','top','bottom','left','right'].map(g=>[g,tensionGroup(p,g)]));
    const active=groups[distribution.activeGroup];
    const psiEc=1/(1+2*distribution.eccN/(3*active.he));
    const cone=active.design*psiEc;
    const direction=p.vy>=0?'top':'bottom', rear=p.vy>=0?'bottom':'top';
    const faces=[direction,'left','right'].map(s=>shearFace(p,s));
    const controllingFace=faces.reduce((a,b)=>a.design<=b.design?a:b);
    const kcp=p.hef<2.5*inch?1:2;
    const pryGroups=['all',rear,'left','right'];
    const controllingPry=pryGroups.reduce((a,b)=>groups[a].design<=groups[b].design?a:b);
    const pryout=phiConcreteV*kcp*groups[controllingPry].nominal;
    const Vu=abs(p.vy), maxT=distribution.maxT, groupT=distribution.total;
    const checks=[];
    function check(id,label,kind,demand,capacity,clause,formula,unit='kN',applicable=true) {
      checks.push({id,label,kind,demand,capacity,ratio:applicable?demand/capacity:0,unit,clause,formula,applicable});
    }
    check('steelN','锚材受拉','N',maxT,steelN,'§17.6.1','φNsa = φ Ase,N f*');
    check('pullout','单锚拔出','N',maxT,pullout,'§17.6.3',hook?'φNpn = φ ψa × 0.9 f′c eh da':'φNpn = φ ψa × 8 Abrg f′c');
    check('breakoutN','受拉锥体破坏','N',groupT,cone,'§17.6.2','φNcbg = φ (ANc/ANco) ψa ψec,N ψed,N Nb，ψcm,N = 1');
    check('sideface','混凝土侧面爆裂','N',groupT,sideface,'§17.6.4.1–2','逐受拉近边核算；整组拉力保守比较最弱近边受影响单锚或一排锚设计强度','kN',sideface!==null);
    if(sideSingle) check('sidefaceSingle','近边单锚侧面爆裂补充核对','N',sideSingle.demand,sideSingle.design,'§17.6.4.1、§17.6.4.1.1','按各受拉单锚的实际坐标、角部系数和拉力取最大利用率');
    check('steelV','锚材受剪','V',Vu/p.nx,steelV,'§17.7.1','φVsa = φ α Ase,V f*；后排单锚剪力 = |Vy|/nx');
    check('breakoutV','剪切边缘破坏','V',Vu,controllingFace.design,'§17.7.2','φVcbg = φ (AVc/AVco) ψa ψed,V ψh,V Vb × 方向系数');
    check('pryout','混凝土剪撬','V',Vu,pryout,'§17.7.3','φV,c Vcpg = φV,c kcp × min(受剪锚组无偏心名义 Ncbg)');
    const etaN=max(...checks.filter(c=>c.kind==='N').map(c=>c.ratio));
    const etaV=max(...checks.filter(c=>c.kind==='V').map(c=>c.ratio));
    const capacityN=min(cone,sideface??Infinity), capacityV=min(controllingFace.design,pryout);
    const concrete={...interact(groupT/capacityN,Vu/capacityV),demandN:groupT,demandV:Vu,capacityN,capacityV};
    const steelRows=distribution.rows.map((r,i)=>{
      const shear=(rear==='bottom'?i===0:i===p.ny-1)?Vu/p.nx:0;
      return {...interact(r.perAnchor/steelN,shear/steelV,2),row:i+1,face:rear,y:r.y,demandN:r.perAnchor,demandV:shear,capacityN:steelN,capacityV:steelV};
    });
    const steel=steelRows.reduce((a,b)=>a.ratio>=b.ratio?a:b);
    const coupled={concrete,steel,steelRows,ratio:max(concrete.ratio,steel.ratio),limit:1};
    check('interactionConcrete','锚群混凝土拉剪组合','NV',concrete.ratio,1,'§17.8.3','(Nua,g / φNn,cg)^(5/3) + (Vua,g / φVn,cg)^(5/3) ≤ 1','—');
    check('interactionSteel','单锚钢材拉剪组合','NV',steel.ratio,1,'§17.8.4','逐排比较同一根锚的 (Nua,i / φNsa)² + (Vua,i / φVsa)² ≤ 1','—');
    const governs=checks.filter(c=>c.applicable).reduce((a,b)=>a.ratio>=b.ratio?a:b);
    const utilization=governs.ratio;
    if(!Number.isFinite(utilization)||!Number.isFinite(cone)||!Number.isFinite(steelN))
      return invalid(['输入数值超出可计算范围，请核对量纲。']);
    return {ok:true,status:utilization<=1+1e-12?'pass':'fail',errors:[],utilization,etaN,etaV,
      interaction:coupled.ratio,governing:utilization===0?'无锚固需求':governs.label,checks,distribution,
      trace:{As,AseN,AseV,fut,alphaV,phiN,phiV,phiConcrete:phiConcreteN,phiConcreteN,phiConcreteV,psiA,psiCm:1,
        plateThickness:p.plateThickness,enhancedPlateThreshold:max(.5*p.d,3/8*inch),usesEnhancedShear:false,
        units:{mmPerIn:inch,kNPerLbf:lbf,MPaPerPsi:psi},edition:'ACI CODE-318-25 (inch-pound)',eh,Abrg,ca1,ca2,psiEc,kcp,steelN,steelV,pullout,sideface,sideFaces,sideControl,sideSingle,
        tensionGroups:groups,shearFaces:faces,controllingFace:controllingFace.face,pryGroups,controllingPry,
        cone,pryout,interaction:coupled},scope};
  }
  function paperCases(){
    return [
      {name:'M-1',N:78,V:52,factor:1.6,steelN:553.1,breakoutN:118.1,pullout:211.1,steelV:287.6,breakoutV:60.1,pryout:236.2,publishedSum:.95},
      {name:'M-2',N:182,V:83,factor:1.6,steelN:1081.3,breakoutN:158.6,pullout:465.5,steelV:563,breakoutV:87.2,pryout:317.2,publishedSum:1.05}
    ].map(c=>{
      const nu=c.N*c.factor,vy=c.V*c.factor;
      function path(includeBreakout){
        const capN=min(c.steelN,c.pullout,includeBreakout?c.breakoutN:Infinity);
        const capV=min(c.steelV,c.pryout,includeBreakout?c.breakoutV:Infinity);
        const etaN=nu/capN, etaV=vy/capV, mix=historicInteraction(etaN,etaV);
        return {capN,capV,etaN,etaV,sum:mix.sum,utilization:max(etaN,etaV,mix.ratio)};
      }
      return {...c,nu,vy,author:path(false),withBreakout:path(true)};
    });
  }
  return Object.freeze({DEFAULTS,calculate,interact,paperCases,scope});
});
