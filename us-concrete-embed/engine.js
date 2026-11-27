/* ACI 318-19 (SI), static cast-in anchorage. Internal forces here use kN. */
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
    top:300, cover:40, plateX:320, plateY:400, straight:125, ductile:true,
    nu:36, mx:0, vy:20, mode:'elastic', tPlus:null, tMinus:null
  });
  const scope = Object.freeze([
    'ACI 318-19（SI）第 17 章。取开裂、普通重混凝土，按无补充配筋增益的现浇锚件计算。',
    '矩形等间距等径无螺纹圆杆，全组与同一刚板可靠连接；沿 ±Y 传剪，锚板与混凝土界面无灌浆垫层。',
    '作用取同一强度组合并移至钢板传力面及锚群形心。双向剪切、扭转、另一轴弯矩、地震、疲劳和冲击须另建模型。',
    '带肋钢筋用作预埋锚筋时，按 §17.1.6 验证发展长度及群筋崩裂，或按 §17.5.2.1 设计锚固钢筋。L 形锚栓分支适用于主要靠钩部承压的锚栓。',
    '本工具给出锚固分项结果。项目须另验锚板、焊缝、局部承压、主体传力、锚群间相互影响和包括钩端在内的实际净保护层。延性材须有相应试验证明。'
  ]);
  const phiConcrete=0.70;
  const min=Math.min, max=Math.max, abs=Math.abs;
  const labels={fc:'混凝土强度',fy:'屈服强度',fu:'极限强度',d:'杆径',eh:'钩伸出长度',dh:'头径',
    headHeight:'承压基准以下钢材高度',hef:'有效埋深',h:'构件厚度',sx:'X 向间距',sy:'Y 向间距',
    nx:'列数',ny:'排数',left:'左边距',right:'右边距',bottom:'下边距',top:'上边距',cover:'净保护层',
    plateX:'锚板宽',plateY:'锚板长',straight:'等径直段长',nu:'设计拉力',mx:'设计弯矩',vy:'设计剪力',tPlus:'上排拉力',tMinus:'下排拉力'};
  function normalize(input) {
    const p={...input}, errors=[];
    const active=Object.keys(labels).filter(k=>{
      if(k==='dh') return p.anchorType==='headed';
      if(k==='eh'||k==='straight') return p.anchorType==='hooked';
      if(k==='tPlus'||k==='tMinus') return p.mode==='contact';
      return true;
    });
    for(const k of active){
      if(typeof p[k]==='string' && p[k].trim()!=='') p[k]=Number(p[k]);
      if(!Number.isFinite(p[k])) errors.push(labels[k]+'须填写有限数值。');
      else if(!['nu','mx','vy','tPlus','tMinus'].includes(k) && p[k]<=0) errors.push(labels[k]+'须大于零。');
    }
    if(!['hooked','headed'].includes(p.anchorType)) errors.push('选择 L 形锚栓或预埋焊接有头栓钉。');
    if(!['elastic','contact'].includes(p.mode)) errors.push('选择弹性分配或输入接触分析结果。');
    if(typeof p.ductile!=='boolean') errors.push('确认锚材是否符合延性条件。');
    if(errors.length) return {p,errors};
    const hook=p.anchorType==='hooked';
    if(p.fc<17||p.fc>70||p.fu<p.fy||p.d>50) errors.push('模型适用 17 ≤ f′c ≤ 70 MPa、futa ≥ fya、da ≤ 50 mm。');
    if([p.nx,p.ny].some(v=>!Number.isInteger(v)||v<2||v>10)) errors.push('X 向列数和 Y 向排数应为 2～10 的整数。');
    if((hook&&p.hef>635)||(!hook&&p.hef>=280)) errors.push('本模型 L 形锚栓 hef ≤ 635 mm，有头栓钉 hef < 280 mm。');
    if(hook && (p.eh<3*p.d||p.straight>p.hef)) errors.push('L 钩要求 eh ≥ 3da，等径直段长度 ≤ hef。');
    if(!hook && p.dh<=p.d) errors.push('栓钉头部直径须大于杆径。');
    const envelope=hook?p.d:p.dh;
    const edge=min(p.left,p.right,p.bottom,p.top);
    if(edge-envelope/2<p.cover || p.h-p.hef-p.headHeight<p.cover) errors.push('侧面或背面净保护层不足。');
    if(min(p.sx,p.sy)<4*p.d || min(p.sx,p.sy)<=envelope) errors.push('相邻锚中心距须 ≥ 4da，且钢材外缘之间应有净距。');
    const wx=(p.nx-1)*p.sx, wy=(p.ny-1)*p.sy;
    if(p.plateX<=wx+p.d||p.plateY<=wy+p.d) errors.push('最外排锚杆与锚板边缘须有净距。');
    if(p.plateX>wx+2*min(p.left,p.right)||p.plateY>wy+2*min(p.bottom,p.top)) errors.push('居中锚板超出混凝土边界。');
    if(max(p.sx,p.sy)>=3*min(p.hef,edge)) errors.push('相邻锚投影未连续重叠，超出本计算模型。');
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
    const Nb=10*Math.sqrt(p.fc)*he**1.5/1000;
    const nominal=ANc/ANco*psiEd*Nb;
    return {group,nx,ny,edges,he,width,height,ANco,ANc,psiEd,Nb,nominal,design:phiConcrete*nominal};
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
    const le=min(p.hef,8*p.d,p.anchorType==='hooked'?p.straight:Infinity);
    const Vb=min(.6*(le/p.d)**.2*Math.sqrt(p.d),3.7)*Math.sqrt(p.fc)*ca**1.5/1000;
    const direction=parallel?2:1;
    const nominal=AVc/AVco*psied*psih*Vb*direction;
    return {face,parallel,count,far,ca,side1,side2,le,AVco,AVc,psied,psih,direction,Vb,nominal,design:phiConcrete*nominal};
  }
  function interact(etaN,etaV){
    const required=min(etaN,etaV)>.2+1e-12;
    return {required,sum:etaN+etaV,limit:1.2,ratio:required?(etaN+etaV)/1.2:0};
  }
  function invalid(errors){
    return {ok:false,status:'invalid',errors,utilization:null,etaN:null,etaV:null,interaction:null,governing:null,
      checks:[],distribution:null,trace:null,scope};
  }
  function calculate(input){
    const {p,errors}=normalize(input||{});
    if(errors.length) return invalid(errors);
    const distribution=distribute(p);
    if(distribution.error) return invalid([distribution.error]);
    const hook=p.anchorType==='hooked', As=Math.PI*p.d**2/4;
    const fut=min(p.fu,1.9*p.fy,860);
    const phiN = p.ductile ? 0.75 : 0.65;
    const phiV = p.ductile ? 0.65 : 0.60;
    const steelN=phiN*As*fut/1000, steelV=phiV*(hook ? 0.6 : 1)*As*fut/1000;
    const eh=hook?min(p.eh,4.5*p.d):null, Abrg=hook?null:Math.PI*(p.dh**2-p.d**2)/4;
    const pullout=phiConcrete*(hook ? 0.9*p.fc*eh*p.d : 8*p.fc*Abrg)/1000;
    const ca1=min(p.left,p.right,p.bottom,p.top);
    const ca2=max(min(p.left,p.right),min(p.top,p.bottom));
    const sideface=(!hook && p.hef>2.5*ca1)?
      phiConcrete*13*ca1*Math.sqrt(Abrg*p.fc)*min(1,(1+ca2/ca1)/4)/1000:null;
    const groups=Object.fromEntries(['all','top','bottom','left','right'].map(g=>[g,tensionGroup(p,g)]));
    const active=groups[distribution.activeGroup];
    const psiEc=1/(1+2*distribution.eccN/(3*active.he));
    const cone=active.design*psiEc;
    const direction=p.vy>=0?'top':'bottom', rear=p.vy>=0?'bottom':'top';
    const faces=[direction,'left','right'].map(s=>shearFace(p,s));
    const controllingFace=faces.reduce((a,b)=>a.design<=b.design?a:b);
    const kcp=p.hef<65?1:2;
    const pryGroups=['all',rear,'left','right'];
    const controllingPry=pryGroups.reduce((a,b)=>groups[a].design<=groups[b].design?a:b);
    const pryout=kcp*groups[controllingPry].design;
    const Vu=abs(p.vy), maxT=distribution.maxT, groupT=distribution.total;
    const checks=[];
    function check(id,label,kind,demand,capacity,clause,formula,unit='kN',applicable=true) {
      checks.push({id,label,kind,demand,capacity,ratio:applicable?demand/capacity:0,unit,clause,formula,applicable});
    }
    check('steelN','锚材受拉','N',maxT,steelN,'§17.6.1','φNsa = φ Ase,N f*');
    check('pullout','单锚拔出','N',maxT,pullout,'§17.6.3',hook?'φNpn = φ × 0.9 f′c eh da':'φNpn = φ × 8 Abrg f′c');
    check('breakoutN','受拉锥体破坏','N',groupT,cone,'§17.6.2','φNcbg = φ (ANc/ANco) ψec,N ψed,N Nb');
    check('sideface','混凝土侧面爆裂','N',groupT,sideface,'§17.6.4','φNsb = φ 13 ca1 √(Abrg f′c) × 角部系数；整组拉力对比单锚下限','kN',sideface!==null);
    check('steelV','锚材受剪','V',Vu/p.nx,steelV,'§17.7.1','φVsa = φ α Ase,V f*；后排单锚剪力 = |Vy|/nx');
    check('breakoutV','剪切边缘破坏','V',Vu,controllingFace.design,'§17.7.2','φVcbg = φ (AVc/AVco) ψed,V ψh,V Vb × 方向系数');
    check('pryout','混凝土剪撬','V',Vu,pryout,'§17.7.3','φVcpg = kcp × min(受剪锚组的无偏心 φNcbg)');
    const etaN=max(...checks.filter(c=>c.kind==='N').map(c=>c.ratio));
    const etaV=max(...checks.filter(c=>c.kind==='V').map(c=>c.ratio));
    const coupled=interact(etaN,etaV);
    check('interaction','拉剪组合','NV',coupled.sum,coupled.limit,'§17.8','ηN + ηV ≤ 1.2（ηN、ηV 均 > 0.2）','—',coupled.required);
    const governs=checks.filter(c=>c.applicable).reduce((a,b)=>a.ratio>=b.ratio?a:b);
    const utilization=governs.ratio;
    if(!Number.isFinite(utilization)||!Number.isFinite(cone)||!Number.isFinite(steelN))
      return invalid(['输入数值超出可计算范围，请核对量纲。']);
    return {ok:true,status:utilization<=1+1e-12?'pass':'fail',errors:[],utilization,etaN,etaV,
      interaction:coupled.ratio,governing:utilization===0?'无锚固需求':governs.label,checks,distribution,
      trace:{As,fut,phiN,phiV,phiConcrete,eh,Abrg,ca1,ca2,psiEc,kcp,steelN,steelV,pullout,sideface,
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
        const etaN=nu/capN, etaV=vy/capV, mix=interact(etaN,etaV);
        return {capN,capV,etaN,etaV,sum:mix.sum,utilization:max(etaN,etaV,mix.ratio)};
      }
      return {...c,nu,vy,author:path(false),withBreakout:path(true)};
    });
  }
  return Object.freeze({DEFAULTS,calculate,interact,paperCases,scope});
});
