/* GB 50017-2017 beam-column demo. Units: N, mm, MPa internally.
 * References and supported assumptions: STEEL_BEAM_COLUMN.md.
 * No network, DOM or persistent storage in the calculation core. */
(function (root) {
  'use strict';
  const E = 206000;
  const BANDS = {
    Q235: [[16,215,235],[40,205,225],[100,200,215]],
    Q345: [[16,305,345],[40,295,335],[63,290,325],[80,280,315],[100,270,305]],
    Q390: [[16,345,390],[40,330,370],[63,310,350],[100,295,330]],
    Q420: [[16,375,420],[40,355,400],[63,320,380],[100,305,360]],
    Q460: [[16,410,460],[40,390,440],[63,355,420],[100,340,400]]
  };
  const PIPE_BANDS = {
    Q235:[[16,215,235],[30,205,225],[100,195,215]],
    Q345:[[16,305,345],[30,290,325],[100,260,295]],
    Q390:[[16,345,390],[30,330,370],[100,310,350]],
    Q420:[[16,375,420],[30,355,400],[100,340,380]],
    Q460:[[16,410,460],[30,390,440],[100,355,420]]
  };
  function requireValue(v, name, min, max) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
      throw new Error(name+'应在 '+min+'～'+max+' 之间');
    return v;
  }
  function section(p) {
    let A,Ix,Iy,h,b,tmax;
    if (p.type === 'chs') {
      const D=requireValue(p.D,'外径 D（mm）',10,3000),t=requireValue(p.t,'壁厚 t（mm）',1,100);
      if (2*t >= D) throw new Error('圆管壁厚必须小于外径的一半');
      if (t >= 40) throw new Error('圆管壁厚须小于 40 mm；更厚圆管的稳定截面分类需另行确认');
      h=b=D; A=Math.PI/4*(D*D-(D-2*t)**2); Ix=Iy=Math.PI/64*(D**4-(D-2*t)**4);tmax=t;
    } else if (p.type === 'shs') {
      b=h=requireValue(p.B,'方管边长 B（mm）',10,3000);const t=requireValue(p.t,'壁厚 t（mm）',1,100);
      if (2*t >= b) throw new Error('方管壁厚必须小于边长的一半');
      A=b*b-(b-2*t)**2;Ix=Iy=(b**4-(b-2*t)**4)/12;tmax=t;
    } else if (p.type === 'box') {
      h=requireValue(p.H,'箱型高度 H（mm）',10,3000);b=requireValue(p.B,'箱型宽度 B（mm）',10,3000);
      const tf=requireValue(p.tf,'翼缘厚 tf（mm）',1,100),tw=requireValue(p.tw,'腹板厚 tw（mm）',1,100);
      if(2*tf>=h || 2*tw>=b)throw new Error('箱型要求 2tf < H、2tw < B');
      A=b*h-(b-2*tw)*(h-2*tf);
      Ix=(b*h**3-(b-2*tw)*(h-2*tf)**3)/12;
      Iy=(h*b**3-(h-2*tf)*(b-2*tw)**3)/12;tmax=Math.max(tf,tw);
    } else if (p.type === 'i') {
      h=requireValue(p.H,'截面高度 H（mm）',20,3000);b=requireValue(p.B,'翼缘宽 B（mm）',10,2000);
      const tf=requireValue(p.tf,'翼缘厚 tf（mm）',1,100),tw=requireValue(p.tw,'腹板厚 tw（mm）',1,100);
      if (2*tf>=h || tw>=b) throw new Error('工字形截面要求 2tf < H，tw < B');
      A=2*b*tf+(h-2*tf)*tw;Ix=(b*h**3-(b-tw)*(h-2*tf)**3)/12;
      Iy=(2*tf*b**3+(h-2*tf)*tw**3)/12;tmax=Math.max(tf,tw);
      if (Ix < Iy) throw new Error('请将工字形截面的强轴布置为 x 轴（Ix ≥ Iy）');
    } else throw new Error('此截面的稳定计算待补充');
    return {A,Ix,Iy,Wx:2*Ix/h,Wy:2*Iy/b,ix:Math.sqrt(Ix/A),iy:Math.sqrt(Iy/A),h,b,tmax};
  }
  function material(grade,t,seamless=false) {
    const bands=(seamless?PIPE_BANDS:BANDS)[grade];
    if (!bands) throw new Error('材料牌号不在本 Demo 的强度表内');
    const row=bands.find(r=>t<=r[0]);
    if (!row) throw new Error('板厚超出强度表范围');
    return {grade,f:row[1],fy:row[2],nominal:Number(grade.slice(1)),E,epsilon:Math.sqrt(235/Number(grade.slice(1))),source:seamless?'表 4.4.3':'表 4.4.1'};
  }
  function buckling(lambda,fy,curve) {
    const ln=lambda/Math.PI*Math.sqrt(fy/E);
    const coefficients={a:[.41,.986,.152],b:[.65,.965,.3],c:ln<=1.05?[.73,.906,.595]:[.73,1.216,.302],d:ln<=1.05?[1.35,.868,.915]:[1.35,1.375,.432]}[curve];
    if (!coefficients) throw new Error('未知稳定曲线');
    const [a1,a2,a3]=coefficients;
    const q=a2+a3*ln+ln*ln;
    // Rationalized D.0.5-3 avoids cancellation at large lambda.
    const phi=ln<=.215?1-a1*ln*ln:2/(q+Math.sqrt(Math.max(0,q*q-4*ln*ln)));
    return {lambda,ln,curve,coefficients,phi:Math.min(1,phi)};
  }
  function curves(p,s,m) {
    if (p.type==='chs') return p.process==='seamless'?['a','a']:['b','b'];
    if (p.type==='shs') return (p.B-2*p.t)/p.t>20?['b','b']:['c','c'];
    // Table 7.2.1: where plate ratios straddle 20, use the adverse c curve.
    if (p.type==='box') return Math.min((p.B-2*p.tw)/p.tf,(p.H-2*p.tf)/p.tw)>20?['b','b']:['c','c'];
    if (p.process==='rolled') {
      if(s.tmax>=80)return ['c','d'];
      if(s.tmax>=40)return ['b','c'];
      return p.B/p.H<=.8?['a','b']:(m.grade==='Q235'?['b','c']:['a','b']);
    }
    if(p.process==='welded-flame')return ['b','b'];
    return s.tmax>=40?['c','d']:['b','c'];
  }
  function localPlates(p,s,m,N,Mx,My) {
    const e=m.epsilon, rows=[];
    function row(name,ratio,limits) {
      const k=limits.findIndex(v=>ratio<=v+1e-10);
      rows.push({name,ratio,limits,level:k<0?5:k+1,limit:limits[2],utilization:ratio/limits[2]});
    }
    let alpha=0;
    if(p.type==='i') {
      // Sharp-corner section. Web stress evaluated at both web edges,
      // including adverse weak-axis bending at the web surface.
      const base=N/s.A+My*p.tw/2/s.Iy, bend=Mx*(p.H-2*p.tf)/2/s.Ix;
      alpha=base+bend>0?2*bend/(base+bend):0;
      row('翼缘 b/t', (p.B-p.tw)/(2*p.tf),[9,11,13,15].map(x=>x*e));
      row('腹板 h₀/tw',(p.H-2*p.tf)/p.tw,(N===0?[65,72,93,124]:[33+13*alpha**1.3,38+13*alpha**1.39,40+18*alpha**1.5,45+25*alpha**1.66]).map(x=>x*e));
    } else if (p.type==='shs') {
      // Conservative uniform compression limits on all walls for biaxial loading.
      row('壁板 b₀/t',(p.B-2*p.t)/p.t,(N===0?[25,32,37,42]:[30,35,40,45]).map(x=>x*e));
    } else if (p.type==='box') {
      const limits=(N===0?[25,32,37,42]:[30,35,40,45]).map(x=>x*e);
      row('翼缘 b₀/tf',(p.B-2*p.tw)/p.tf,limits);
      row('腹板 h₀/tw',(p.H-2*p.tf)/p.tw,limits);
    } else row('圆管 D/t',p.D/p.t,[50,70,90,100].map(x=>x*e*e));
    const level=Math.max(...rows.map(r=>r.level));
    return {rows,alpha,level,label:level===5?'超过 S4':'S'+level,ok:level<=3,utilization:Math.max(...rows.map(r=>r.utilization))};
  }
  function lateral(p,s,m,lambdaY) {
    if(p.type!=='i')return {phi:1,raw:1,method:'闭口截面 φbx = φby = 1'};
    if(lambdaY<=120*m.epsilon) {
      const raw=1.07-lambdaY**2/(44000*m.epsilon**2);
      return {phi:Math.min(1,raw),raw,method:'C.0.5-1（λy ≤ 120εk，无二次修正）'};
    }
    // C.0.1, uniform moment (beta_b=1), doubly symmetric (eta_b=0).
    // Ly is assumed equal to lateral restraint spacing, fork supports, free warping.
    const raw=4320/lambdaY**2*s.A*p.H/s.Wx*Math.sqrt(1+(lambdaY*p.tf/(4.4*p.H))**2)*m.epsilon**2;
    return {raw,phi:raw>.6?Math.min(1,1.07-.282/raw):raw,method:'C.0.1-1、C.0.1-7（均匀弯曲）'};
  }
  function calculate(input, sectionFixture) {
    const p={grade:'Q235',process:'rolled',bmx:1,bmy:1,btx:1,bty:1,...input};
    const allowed=p.type==='i'?['rolled','welded-flame','welded-cut']:p.type==='chs'?['seamless','welded']:['welded'];
    if(!allowed.includes(p.process))throw new Error('截面类型与制造工艺不匹配');
    const geometric=section(p),s=sectionFixture||geometric;
    const N=requireValue(p.N,'轴压力 N（kN）',0,1e7)*1000;
    const Mx=Math.abs(requireValue(p.Mx,'弯矩 Mx（kN·m）',-1e7,1e7))*1e6;
    const My=Math.abs(requireValue(p.My,'弯矩 My（kN·m）',-1e7,1e7))*1e6;
    const Lx=requireValue(p.Lx,'计算长度 Lx（m）',.01,1000)*1000;
    const Ly=requireValue(p.Ly,'计算长度 Ly（m）',.01,1000)*1000;
    ['bmx','bmy','btx','bty'].forEach(k=>requireValue(p[k],k,.1,2));
    const m=material(p.grade,s.tmax,p.type==='chs'&&p.process==='seamless');
    const [cx,cy]=curves(p,s,m),bx=buckling(Lx/s.ix,m.fy,cx),by=buckling(Ly/s.iy,m.fy,cy);
    const local=localPlates(p,s,m,N,Mx,My);
    const gx=local.ok?(p.type==='chs'?1.15:1.05):1;
    const gy=local.ok?(p.type==='i'?1.2:p.type==='chs'?1.15:1.05):1;
    const ltb=lateral(p,s,m,by.lambda);
    const NEx=Math.PI**2*E*s.A/bx.lambda**2,NEy=Math.PI**2*E*s.A/by.lambda**2;
    const Npx=NEx/1.1,Npy=NEy/1.1,dx=1-.8*N/Npx,dy=1-.8*N/Npy;
    const eta=['shs','box'].includes(p.type)?.7:1;
    const strength=N/s.A+(p.type==='chs'?Math.hypot(Mx,My)/(gx*s.Wx):Mx/(gx*s.Wx)+My/(gy*s.Wy));
    const inRange=dx>0&&dy>0&&N<Math.min(NEx,NEy);
    let sx,sy;
    if(p.type==='chs') {
      // 8.2.4, beta=1 represents equal same-sign end moments in both planes.
      const phi=Math.min(bx.phi,by.phi),d=Math.min(dx,dy);
      sx=sy=inRange?N/(phi*s.A)+Math.hypot(Mx,My)/(gx*s.Wx*d):Infinity;
    } else {
      sx=inRange?N/(bx.phi*s.A)+p.bmx*Mx/(gx*s.Wx*dx)+eta*p.bty*My/s.Wy:Infinity;
      sy=inRange?N/(by.phi*s.A)+eta*p.btx*Mx/(ltb.phi*s.Wx)+p.bmy*My/(gy*s.Wy*dy):Infinity;
    }
    const checks=[{id:'strength',name:'截面强度',value:strength/m.f,stress:strength},
      {id:'stabilityX',name:p.type==='chs'?'圆管整体稳定':'绕 x 轴稳定',value:sx/m.f,stress:sx}];
    if(p.type!=='chs')checks.push({id:'stabilityY',name:'绕 y 轴稳定',value:sy/m.f,stress:sy});
    checks.push({id:'local',name:'局部稳定 · S3',value:local.utilization});
    const warnings=[];
    if(!inRange)warnings.push('轴压力达到欧拉临界力或二阶放大分母非正，稳定验算不满足，不能继续使用该放大公式。');
    if(!local.ok)warnings.push('板件宽厚比超过 S3：本 Demo 未计算有效截面及屈曲后强度，不给出承载力满足结论。');
    if(Math.max(bx.lambda,by.lambda)>150)warnings.push('最大长细比超过 150。请结合构件用途核对 7.4.6 的容许值；本 Demo 不自动放宽。');
    const passing=checks.every(c=>c.value<=1)&&inRange&&local.ok;
    return {p,s,m,N,Mx,My,Lx,Ly,bx,by,local,gx,gy,ltb,NEx,NEy,Npx,Npy,dx,dy,eta,strength,sx,sy,checks,warnings,inRange,passing,needsReview:Math.max(bx.lambda,by.lambda)>150};
  }
  const api={E,section,material,buckling,curves,localPlates,lateral,calculate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.SteelBeamColumn=api;
})(typeof globalThis!=='undefined'?globalThis:this);
