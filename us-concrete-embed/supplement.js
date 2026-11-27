(function (make) {
  'use strict';
  const api = make();
  if (typeof window !== 'undefined') window.EmbedSupplement = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(function () {
  'use strict';
  const examples = {
    steel:{b:100,t:14,Fy:250,Mu:.5,mode:'center',w:6,Fexx:490,L:100,n:2,V:30,qPeak:'',fc:30,A1:6000,Bu:30},
    rebar:{no:5,fy:280,fc:35,s:110,cSide:70,cTB:70,location:'continuous',Din:100,tail:200,avail:320}
  };
  const fields = {
    b:['有效板带宽度 b','mm'],t:['钢板厚度 t','mm'],Fy:['钢板屈服强度 Fy','MPa'],Mu:['板带设计弯矩 |Mu|','kN·m'],
    mode:['焊缝群受力','',[['center','中心受剪'],['eccentric','偏心受剪']]],
    w:['焊脚尺寸 w','mm'],Fexx:['焊材抗拉强度 FEXX','MPa'],L:['每条有效焊长 L','mm'],n:['等长焊缝数 n','条'],
    V:['焊缝群剪力 |Vu|','kN'],qPeak:['另算最大线剪力 qu,max','N/mm'],
    fc:['混凝土圆柱抗压强度 f′c','MPa'],A1:['有效受压面积 A₁','mm²'],Bu:['板下接触压力合力 Bu','kN'],
    no:['美制钢筋号','',[3,4,5,6,7,8].map(n=>[String(n),'No. '+n])],
    fy:['钢筋规定屈服强度 fy','MPa',[['280','280 · Grade 40'],['420','420 · Grade 60']]],
    s:['弯钩钢筋最小中心距 s','mm'],cSide:['垂直钩平面的侧净盖层','mm'],cTB:['顶部或底部净盖层','mm'],
    location:['构件位置','',[['continuous','连续部位'],['end','不连续端部']]],
    Din:['实设弯曲内直径 Din','mm'],tail:['实设弯后直段 ℓext','mm'],avail:['实有锚固长度 ℓavail','mm']
  };
  function num(value) {
    if (typeof value==='number') return Number.isFinite(value)?value:NaN;
    if (typeof value!=='string'||!value.trim()) return NaN;
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }
  function missing(keys,p) {
    const errs=[];
    for(const key of keys) {
      const value=num(p[key]);
      if(!Number.isFinite(value)) errs.push('填写'+fields[key][0]+'。');
      else if((['Mu','V','qPeak','Bu'].includes(key)?value<0:value<=0)) errs.push(fields[key][0]+'超出取值范围。');
    }
    return errs;
  }
  const invalid=(errors)=>({status:'invalid',errors,checks:[],trace:[]});
  const check=(label,demand,capacity,unit)=>({label,demand,capacity,unit,ratio:demand/capacity});
  function evaluated(checks,trace) {
    if(checks.some(c=>!Number.isFinite(c.ratio)||!Number.isFinite(c.capacity)||!Number.isFinite(c.demand)))
      return invalid(['计算超出数值范围，请核对输入及单位。']);
    const ratio=Math.max(...checks.map(c=>c.ratio));
    return {status:ratio<=1?'pass':'fail',ratio,checks,trace,errors:[]};
  }
  function plate(p) {
    const errors=missing(['b','t','Fy','Mu'],p);
    if(num(p.b)<num(p.t)) errors.push('本页弱轴弯曲板带要求 b ≥ t。');
    if(errors.length) return invalid(errors);
    const S=p.b*p.t**2/6, cap=.90*p.Fy*S/1e6;
    return evaluated([check('弯矩',num(p.Mu),cap,'kN·m')],[['弹性截面模量 S',S,'mm³']]);
  }
  function weld(p) {
    const errors=missing(['w','Fexx','L','n','V'],p);
    const peakSupplied=p.qPeak!==null && p.qPeak!==undefined && String(p.qPeak).trim()!=='';
    if(peakSupplied||p.mode==='eccentric') errors.push(...missing(['qPeak'],p));
    if(!['center','eccentric'].includes(p.mode)) errors.push('选择焊缝群的受力形式。');
    const w=num(p.w), L=num(p.L), n=num(p.n);
    if(Number.isFinite(n)&&!Number.isInteger(n)) errors.push('焊缝条数须为整数。');
    if(L<4*w||L>100*w) errors.push('本页覆盖 4w ≤ L ≤ 100w，其他长度须另核 J2.2。');
    if(errors.length) return invalid(errors);
    const cap=.75*.60*p.Fexx*w/Math.sqrt(2);
    const direct=p.V*1000/(n*L);
    const q=Math.max(direct,peakSupplied?num(p.qPeak):0);
    return evaluated([check('焊缝线剪力',q,cap,'N/mm')],[['有效喉厚',w/Math.sqrt(2),'mm'],['中心直接线剪力',direct,'N/mm']]);
  }
  function bearing(p) {
    const errors=missing(['fc','A1','Bu'],p);
    if(errors.length) return invalid(errors);
    return evaluated([check('受压合力',num(p.Bu),.65*.85*p.fc*p.A1/1000,'kN')],[['有效承压面积 A₁',num(p.A1),'mm²']]);
  }
  function rebar(p) {
    const errors=missing(['no','fy','fc','s','cSide','cTB','Din','tail','avail'],p);
    const no=num(p.no), fy=num(p.fy), fc=num(p.fc);
    if(!Number.isInteger(no)||no<3||no>8||![280,420].includes(fy)||(fy===280&&no>6)) errors.push('Grade 40 限 #3～#6，Grade 60 限 #3～#8。');
    if(fc<17||fc>60) errors.push('普通重混凝土的适用强度为 17～60 MPa。');
    if(!['continuous','end'].includes(p.location)) errors.push('请选择构件部位。');
    if(p.location==='end' && num(p.cSide)<65 && num(p.cTB)<65) errors.push('不连续端部两项净盖层均小于 65 mm，须按 §25.4.3.4 核对端部箍筋。');
    if(errors.length) return invalid(errors);
    const db=[9.5,12.7,15.9,19.1,22.2,25.4][no-3];
    const r=p.s>=6*db?1:1.6, o=p.cSide>=6*db?1:1.25, c=fc<42?fc/105+.6:1;
    const lCalc=fy*r*o*c*db**1.5/(23*Math.sqrt(fc)), lReq=Math.max(lCalc,8*db,150);
    return evaluated([
      check('弯曲内径',6*db,num(p.Din),'mm'),check('弯后直段',12*db,num(p.tail),'mm'),check('锚固长度',lReq,num(p.avail),'mm')
    ],[['公称直径 db',db,'mm'],['约束系数 ψr',r,''],['位置系数 ψo',o,''],['强度系数 ψc',c,''],['计算项 ℓdh,calc',lCalc,'mm']]);
  }
  const groups = {
    steel:[
      {id:'plate',title:'锚板板带抗弯',fields:['b','t','Fy','Mu'],calc:plate,clause:'AISC 360-22 §§F1、F11',
       note:'等厚无孔矩形板带单向弯曲。根据板分析取有效宽度及其对应的截面弯矩。',
       eq:'S = bt²/6，φMy = 0.90 Fy S。以首次屈服为限，双向板弯、撬力与剪切需结合节点分析。'},
      {id:'weld',title:'转接件角焊缝',fields:['mode','w','Fexx','L','n','V','qPeak'],calc:weld,clause:'AISC 360-22 §§J2.2、J2.4、表 J2.5',
       note:'连续等长、90° 等边角焊缝受面内剪。偏心受剪须输入包含直接剪力与扭矩的峰值线剪力。',
       eq:'φrn = 0.75 × 0.60 FEXX w/√2，qu = max[1000 |Vu|/(nL), qu,max]。母材及块状剪切按 §J4，栓钉焊按相应焊接规范。'},
      {id:'bearing',title:'板下混凝土局部承压',fields:['fc','A1','Bu'],calc:bearing,clause:'ACI 318-19 表 21.2.1、22.8.3.2',
       note:'根据板下接触压应力确定有效面积；板的实际受压区可能只占板面的一部分。',
       eq:'φBn = 0.65 × 0.85 f′c A₁。取基本承压强度，压力合力由接触应力积分确定。'}
    ],
    rebar:[
      {id:'hook',title:'90° 标准弯钩受拉锚固',fields:['no','fy','fc','s','cSide','cTB','location','Din','tail','avail'],calc:rebar,clause:'ACI 318-19（SI）§§25.3.1、25.4.3',
       note:'ASTM A615/A615M 无涂层或镀锌带肋钢筋，在普通重混凝土中充分发挥屈服强度。按一般部位取位置系数，忽略箍筋的有利影响。',
       eq:'Din ≥ 6db，ℓext ≥ 12db，ℓdh = max[fy ψr ψo ψc db¹·⁵/(23√f′c), 8db, 150 mm]。弯后直段从弯曲切点量到端部，实有锚固长度沿受力钢筋轴线自临界截面量至钩外缘。'}
    ]
  };
  const sectionNames={steel:'钢板、焊缝与承压',rebar:'带肋钢筋标准钩'};
  const sessions=new WeakMap();
  const sources=['独立输入','独立演示算例','已修改的独立算例'];
  const object=(v)=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
  function sanitizeSection(key,record) {
    if(!object(record)||!Object.hasOwn(record,'values')||!object(record.values))return null;
    const own=record.values, values=initial(key,{});
    for(const name of Object.keys(values)){
      if(!Object.hasOwn(own,name))continue;
      const v=own[name], options=fields[name][2];
      if(options){
        if((typeof v==='string'||typeof v==='number')&&options.some(([id])=>id===String(v)))values[name]=String(v);
        else values[name]='';
      } else {
        values[name]=Number.isFinite(num(v))?num(v):'';
      }
    }
    let source=Object.hasOwn(record,'source')&&sources.includes(record.source)?record.source:'独立输入';
    if(source==='独立演示算例' && Object.keys(values).some(k=>String(values[k])!==String(examples[key][k])))source='已修改的独立算例';
    return {values,source};
  }
  function clean(blob) {
    const result={};
    if(object(blob)){
      for(const key of Object.keys(sectionNames)){
        const section=Object.hasOwn(blob,key)?sanitizeSection(key,blob[key]):null;
        if(section)result[key]=section;
      }
    }
    return result;
  }
  function snapshot(doc){
    const record={}, session=sessions.get(doc);
    if(!session)return record;
    for(const key of Object.keys(sectionNames))if(session.values[key]){
      record[key]={values:session.values[key],source:session.source[key]};
    }
    return clean(record);
  }
  function restore(doc,blob){
    const old=sessions.get(doc);
    if(old?.dialog){
      if(old.dialog.open)old.dialog.close();
      old.dialog.remove();
    }
    const session={values:{},source:{},dialog:null};
    for(const [key,record] of Object.entries(clean(blob))){
      session.values[key]=record.values;
      session.source[key]=record.source;
    }
    sessions.set(doc,session);
  }
  function changed(doc){doc.dispatchEvent(new doc.defaultView.Event('embed-supplement-change'));}
  function initial(section,params){
    const p={};
    for(const field of Object.keys(examples[section])) p[field]='';
    p.fc=Number.isFinite(num(params.fc))?num(params.fc):'';
    if(section==='steel') p.mode='center';
    else {
      p.no=5; p.fy=280; p.location='continuous';
      if(num(params.sx)>0&&num(params.sy)>0) p.s=Math.min(num(params.sx),num(params.sy));
    }
    return p;
  }
  function element(doc,tag,cls,txt){
    const el=doc.createElement(tag);
    if(cls)el.className=cls;
    if(txt!==undefined)el.textContent=txt;
    return el;
  }
  const fmt=n=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:3}).format(n);
  function displayResult(doc,holder,result,section) {
    holder.replaceChildren();
    holder.className='esup-result esup-'+result.status;
    if(result.status==='invalid'){
      holder.append(element(doc,'strong','','待补充或核对'));
      const ul=element(doc,'ul');
      result.errors.forEach(err=>ul.append(element(doc,'li','',err)));
      holder.append(ul); return;
    }
    const verdict=element(doc,'p','esup-verdict',
      (result.status==='pass'?'本项满足':'本项超限')+' · 控制利用率 '+fmt(result.ratio));
    holder.append(verdict);
    const table=element(doc,'table','esup-table'), head=element(doc,'thead'), row=element(doc,'tr');
    for(const title of ['验算项',section==='rebar'?'所需尺寸':'需求',section==='rebar'?'实际尺寸':'设计承载力','利用率']) row.append(element(doc,'th','',title));
    head.append(row); table.append(head);
    const body=element(doc,'tbody');
    for(const c of result.checks) {
      const tr=element(doc,'tr'); for(const v of [c.label,fmt(c.demand)+' '+c.unit,fmt(c.capacity)+' '+c.unit,fmt(c.ratio)]) tr.append(element(doc,'td','',v)); body.append(tr);
    }
    table.append(body); holder.append(table);
    if(result.trace.length) holder.append(element(doc,'p','esup-trace',result.trace.map(([k,v,u])=>k+' '+fmt(v)+' '+u).join('　·　')));
  }
  function appendRecord(doc,container,blob){
    const record=blob===undefined?snapshot(doc):clean(blob);
    const meaningful={
      plate:['b','t','Fy','Mu'],weld:['w','Fexx','L','n','V','qPeak'],
      bearing:['A1','Bu'],hook:['cSide','cTB','Din','tail','avail']
    };
    let count=0;
    for(const [section,{values,source}] of Object.entries(record)){
      const selected=groups[section].filter(g=>meaningful[g.id].some(k=>values[k]!==''));
      if(!selected.length)continue;
      const block=element(doc,'section','esup-record');
      block.append(element(doc,'h3','',sectionNames[section]+' · 独立工况'),
        element(doc,'p','',source+'。各项使用此处列明的独立输入，主表的组合编号和锚固综合利用率不包含本组结果。'));
      for(const g of selected){
        const detail=element(doc,'section','esup-record-group');
        detail.append(element(doc,'h4','',g.title+' · '+g.clause));
        const inputs=g.fields.filter(k=>values[k]!=='').map(k=>{
          const [label,unit,options]=fields[k];
          const text=options?options.find(([id])=>id===String(values[k]))?.[1]:String(values[k]);
          return label+' '+text+(unit?' '+unit:'');
        });
        detail.append(element(doc,'p','',inputs.join('　·　')));
        const holder=element(doc,'div'); displayResult(doc,holder,g.calc(values),section); detail.append(holder);
        detail.append(element(doc,'p','esup-note',g.note+' '+g.eq));block.append(detail);count++;
      }
      if(section==='rebar')block.append(element(doc,'p','esup-note','依 §17.1.6 另考虑群筋崩裂或配置锚固钢筋，核实钢筋可焊性与焊接工艺。'));
      container.append(block);
    }
    return count;
  }
  function open(doc,params={},section='steel'){
    if(!Object.hasOwn(sectionNames,section))section='steel';
    let session=sessions.get(doc);
    if(!session){
      session={values:{},source:{},dialog:null};
      sessions.set(doc,session);
    }
    const opener=doc.activeElement;
    if(session.dialog?.isConnected){session.dialog.close();session.dialog.remove();}
    const dialog=element(doc,'dialog','esup-dialog');
    session.dialog=dialog;
    dialog.setAttribute('aria-labelledby','esup-title');
    const top=element(doc,'header','esup-header');
    const h=element(doc,'h2','','节点专项验算'); h.id='esup-title';
    const close=element(doc,'button','esup-close','关闭'); close.type='button';
    close.addEventListener('click',()=>dialog.close());
    top.append(h,close); dialog.append(top);
    const nav=element(doc,'nav','esup-nav');
    nav.setAttribute('aria-label','专项类型');
    const views={};
    const deck=element(doc,'div','esup-body');
    function setSection(key){
      for(const [id,button] of Object.entries(views))button.setAttribute('aria-pressed',String(id===key));
      if(!session.values[key]){session.values[key]=initial(key,params);session.source[key]='独立输入';}
      const p=session.values[key];
      deck.replaceChildren();
      const actions=element(doc,'div','esup-toolbar');
      const origin=element(doc,'span','esup-origin');
      const labelSource=()=>{origin.textContent=session.source[key]+' · 与主表荷载组合分别计算';};
      labelSource(); actions.append(origin);
      function action(label,callback){
        const b=element(doc,'button','esup-action',label);b.type='button';
        b.addEventListener('click',callback);actions.append(b);
      }
      action('填入独立算例',()=>{session.values[key]={...examples[key]};session.source[key]='独立演示算例';setSection(key);changed(doc);});
      action('清空并取主表几何材料',()=>{session.values[key]=initial(key,params);session.source[key]='独立输入';setSection(key);changed(doc);});
      deck.append(actions);
      const hint=key==='steel'?'填写同一节点、同一强度组合从局部分析得到的板带弯矩、焊缝剪力和接触压力。各项独立计算。'
        :'按钢筋受力发展核对几何和长度。剪力传递及群筋混凝土崩裂仍须按 §17.1.6 校核，或按 §17.5.2.1 配置锚固钢筋。';
      deck.append(element(doc,'p','esup-hint',hint));
      for(const group of groups[key]){
        const box=element(doc,'section','esup-group');
        box.append(element(doc,'h3','',group.title),element(doc,'p','esup-ref',group.clause),element(doc,'p','esup-note',group.note));
        const grid=element(doc,'div','esup-grid');
        const holder=element(doc,'div');
        const refresh=()=>displayResult(doc,holder,group.calc(p),key);
        for(const f of group.fields){
          const [caption,unit,options]=fields[f];
          const label=element(doc,'label','esup-field');
          label.append(element(doc,'span','',caption+(unit?' ('+unit+')':'')));
          const input=element(doc,options?'select':'input');
          if(options) for(const [v,name] of options){const opt=element(doc,'option','',name);opt.value=v;input.append(opt);}
          else {input.type='number';input.step='any';input.placeholder=f==='qPeak'?'中心受剪可留空':'填写数值';}
          input.value=p[f]; input.name=f;
          input.addEventListener(options?'change':'input',()=>{
            p[f]=input.value;
            session.source[key]=session.source[key].includes('算例')?'已修改的独立算例':'独立输入';
            labelSource();refresh();changed(doc);
          });
          label.append(input);grid.append(label);
        }
        box.append(grid,holder,element(doc,'p','esup-eq',group.eq)); refresh(); deck.append(box);
      }
      const end=element(doc,'footer','esup-foot');
      end.append(element(doc,'p','',key==='steel'?'以上判定覆盖所列分项。工程仍须复核母材、锚板整体及混凝土构件至支座的传力。':'焊接 A615 钢筋须核定可焊性及焊接工艺（§26.6.4、AWS D1.4）。论文图 6 的 80 mm 弯腿尺寸须按切点与端部的实际位置换算。'));
      const a=element(doc,'a','','ACI 318-19'), b=element(doc,'a','',key==='steel'?'AISC 360':'ASTM A615/A615M');
      a.href='https://www.concrete.org/store/productdetail.aspx?ItemID=318U19';
      b.href=key==='steel'?'https://www.aisc.org/aisc/publications/current-standards/aisc-360/':'https://store.astm.org/a0615_a0615m-24.html';
      for(const link of [a,b]){link.target='_blank';link.rel='noreferrer';end.append(link);}
      deck.append(end);
      deck.scrollTop=0;
    }
    for(const [key,name] of Object.entries(sectionNames)){
      const b=element(doc,'button','',name);b.type='button';b.addEventListener('click',()=>setSection(key));views[key]=b;nav.append(b);
    }
    dialog.append(nav,deck);
    doc.body.append(dialog);
    dialog.addEventListener('close',()=>{
      dialog.remove();
      if(session.dialog===dialog)session.dialog=null;
      if(!sessions.get(doc)?.dialog?.open&&opener?.isConnected)opener.focus();
    },{once:true});
    dialog.addEventListener('click',ev=>{if(ev.target===dialog){const r=dialog.getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)dialog.close();}});
    setSection(section);dialog.showModal();
    return dialog;
  }
  return Object.freeze({open,plate,weld,bearing,rebar,snapshot,restore,appendRecord});
});
