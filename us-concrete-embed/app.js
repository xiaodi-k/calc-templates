(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const engine = window.EmbedEngine;
  if (!engine) {
    $('param-panels').textContent = '计算模块未载入，请刷新页面。';
    $('report-btn').disabled = true;
    return;
  }
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]);
  const fmt = (n, digits = 1) => Number.isFinite(n) ? n.toLocaleString('zh-CN',{maximumFractionDigits:digits}) : '—';
  const pct = n => Number.isFinite(n) ? (100*n).toFixed(1)+'%' : '—';
  const STORAGE = 'concrete-embed.workbench.v1';
  const SCHEMA = 'concrete-embed/v1';
  const EDITION = 'ACI CODE-318-25 (US)';
  const loadFields = ['nu','mx','vy','mode','tPlus','tMinus'];
  const geometries = Object.fromEntries(Object.entries(engine.DEFAULTS).filter(([key]) => !loadFields.includes(key)));
  const newFields = new Set(['plateThickness','aseN','aseV','bearingArea','endBarDiameter','endBarLength','endBarCount','nutDetailVerified']);
  const anchorTypes = [
    ['hooked','L 形锚栓'],['headed','焊接有头栓钉'],['headedBolt','端部螺母锚栓'],
    ['weldedRebar','钢筋端部附焊短筋'],['rebar','带肋弯钩钢筋']
  ];
  const isLegacyStrength=window.EmbedSupplement.customStrength;
  function strengthOptions() {
    const opts=window.EmbedSupplement.concreteStrengthOptions(state.originalFc,state.params.fc);
    if(state.params.fc===null) opts.unshift(['','请选择规定强度']);
    return opts;
  }
  const loadDefaults = {nu:36,mx:0,vy:20,mode:'elastic',tPlus:null,tMinus:null};
  const presetNames = {standard:'L 形锚栓 · 常规边距',edge:'L 形锚栓 · 靠近下边',headed:'有头栓钉 · 内区锚板',bolt:'端部螺母锚栓 · 内区锚板',welded:'端部附焊短筋 · 构造核对'};
  const grids = {
    standard:{},edge:{bottom:65},headed:{anchorType:'headed',bottom:300,fu:450,fy:350},
    bolt:{anchorType:'headedBolt',bottom:300},
    welded:{anchorType:'weldedRebar',d:20,endBarDiameter:20,endBarLength:100,endBarCount:1,
      nx:4,sx:120,ny:2,sy:140,plateX:600,plateY:400,plateThickness:30,hef:400,h:500}
  };
  function makeExample(preset = 'standard') {
    return {
      schema:SCHEMA,codeEdition:EDITION,name:presetNames[preset],preset,params:{...geometries,...grids[preset]},activeIndex:0,supplement:{},
      cases:[{name:'组合 1 · 轴拉',...loadDefaults},{name:'组合 2 · 偏拉',...loadDefaults,nu:40,mx:1.8,vy:-22},
        {name:'组合 3 · 接触',...loadDefaults,nu:12,mx:4.2,vy:18,mode:'contact',tPlus:25,tMinus:0}]
    };
  }
  function readState(raw) {
    if (!raw || raw.schema !== SCHEMA || !raw.params || !Array.isArray(raw.cases) ||
        !raw.cases.length || raw.cases.length>100 || typeof raw.name!=='string') throw Error('请选择由本工具保存的参数 JSON 文件。');
    const normalized = {schema:SCHEMA,codeEdition:EDITION,name:raw.name.slice(0,120),preset:Object.hasOwn(presetNames,raw.preset)?raw.preset:'custom',params:{},cases:[]};
    const isNumeric = value => value===null || Number.isFinite(value);
    for (const key of Object.keys(geometries)) {
      const isOldFile=!Object.hasOwn(raw.params,key)&&newFields.has(key)&&(key==='nutDetailVerified'||['hooked','headed','rebar'].includes(raw.params.anchorType));
      const value=isOldFile?geometries[key]:raw.params[key];
      const valid=key==='anchorType'?anchorTypes.some(([kind])=>kind===value):['ductile','nutDetailVerified'].includes(key)?typeof value==='boolean':isNumeric(value);
      if(!valid) throw Error('参数缺失或格式有误：'+key);
      normalized.params[key]=value;
    }
    normalized.cases = raw.cases.map(c => {
      if(!c || typeof c.name!=='string' || !['elastic','contact'].includes(c.mode) ||
        !loadFields.filter(key=>key!=='mode').every(key=>isNumeric(c[key]))) throw Error('荷载组合缺少必要参数。');
      return {name:c.name.slice(0,120),...Object.fromEntries(loadFields.map(k=>[k,c[k]]))};
    });
    normalized.activeIndex=Number.isInteger(raw.activeIndex)?Math.max(0,Math.min(normalized.cases.length-1,raw.activeIndex)):0;
    normalized.supplement=raw.supplement && typeof raw.supplement==='object' && !Array.isArray(raw.supplement)?raw.supplement:{};
    normalized.originalFc=isLegacyStrength(normalized.params.fc)?normalized.params.fc:(isLegacyStrength(raw.originalFc)?raw.originalFc:null);
    normalized.legacyThickness=!Object.hasOwn(raw.params,'plateThickness')||raw.legacyThickness===true;
    return normalized;
  }
  let state=makeExample(), tab='node', viewer, results=[], noticeTimer, saveTimer;
  function replaceProject(project) {
    window.EmbedSupplement?.restore?.(document,project.supplement);
    window.EmbedSupplement?.syncPlateThickness?.(document,project.params.plateThickness);
    state=project;
  }
  function currentProject() {
    return {...state,supplement:window.EmbedSupplement?.snapshot?.(document) ?? state.supplement};
  }
  try {
    const saved=localStorage.getItem(STORAGE);
    if(saved) {
      const raw=JSON.parse(saved);
      replaceProject(readState(raw));
      if(raw.codeEdition!==EDITION)notify('已读取旧项目参数，各组合按 ACI CODE-318-25 重新计算。');
    }
    $('save-state').textContent='本地自动保存';
  } catch { $('save-state').textContent='可下载保存'; }
  const activeCase=()=>state.cases[state.activeIndex];
  const params=()=>({...state.params,...activeCase()});
  const groups = [
    ['node','节点'],['array','布置'],['edges','边距'],['loads','荷载']
  ];
  function notify(text) {
    clearTimeout(noticeTimer);
    $('notice').textContent=text; $('notice').hidden=false;
    noticeTimer=setTimeout(()=>$('notice').hidden=true,3300);
  }
  function save() {
    clearTimeout(saveTimer);
    try {localStorage.setItem(STORAGE,JSON.stringify(currentProject())); $('save-state').textContent='已保存到本地';}
    catch {$('save-state').textContent='可下载保存';}
  }
  const scheduleSave=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(save,160);};
  document.addEventListener('embed-supplement-change',()=>{
    state.preset='custom';
    $('preset').value='custom';
    scheduleSave();
  });
  window.addEventListener('pagehide',save);
  const field=(key,label,unit='',options=null,wide=false)=>({key,label,unit,options,wide});
  function descriptions() {
    const p=state.params, c=activeCase();
    const typeNote={
      rebar:'带肋钢筋按第 25 章验算受拉发展长度。右侧可打开标准钩专项，同时应按 §§17.1.7～.8、25.4.11 核对群筋混凝土破坏。',
      weldedRebar:'短筋沿主筋轴向贴焊，右侧可核对附焊短筋构造。参考算例取 X 向 4 根、间距 120 mm，Y 向假定 2 排、间距 140 mm，板宽 Y 向假定 400 mm。须按实际详图录入。',
      headedBolt:'端部六角螺母提供机械承压。应按详图确认有效受压面、螺纹截面与旋合长度，并核对杆端与锚板的连接。'
    };
    const anchorSizeFields={
      hooked:[field('eh','钩有效伸出 eh','mm'),field('straight','起弯前直段','mm'),field('headHeight','承压基准以下高度','mm')],
      headed:[field('dh','钉头直径 dh','mm'),field('headHeight','钉头厚度','mm')],
      headedBolt:[
        field('dh','螺母对边宽 s','mm'),field('headHeight','螺母高度','mm'),
        field('aseN','抗拉有效面积 Ase,N','mm²'),field('aseV','抗剪有效面积 Ase,V','mm²'),
        field('bearingArea','净承压面积 Abrg','mm²'),field('straight','连续等径光杆长','mm'),
        field('nutDetailVerified','已核定端螺母详图适用条件','',null,true)
      ],
      weldedRebar:[field('endBarDiameter','附焊短筋直径','mm'),field('endBarLength','附焊短筋长度','mm'),field('endBarCount','每根主筋的短筋数','根')],
      rebar:[]
    };
    const sizeNote={
      headedBolt:'确认前请核定 §17.1.2(a) 适用性、螺纹抗拉与抗剪有效面积、扣除孔洞与倒角的净承压面、有效旋合长度、螺纹与螺母强度，以及锚杆与表面锚板的连接传力。等径光杆长从传剪面量至螺纹或变截面。',
      weldedRebar:'短筋与主筋平行。长度为短筋实长，焊缝有效长度、尺寸及钢筋可焊性应按实际节点另验。',
      rebar:'受拉临界截面至弯钩外缘的长度，应在右侧标准弯钩专项中输入。'
    };
    return {
      node:[
        {title:'节点定义',fields:[
          field('name','项目 / 节点名称','',null,true),
          field('anchorType','预埋锚件类型','',anchorTypes,true)
        ],note:typeNote[p.anchorType]||'现浇锚件 · 开裂普通重混凝土 · 静力强度设计。钢板与锚件共同传力。'},
        {title:'材料',fields:[
          field('fc','混凝土强度等级','',strengthOptions(),true),
        ],note:'f′c 取项目规定的圆柱体抗压强度，通常为 28 天。psi 选项按未舍入值换算为 MPa。中国 C 等级采用立方体强度，须另核换算依据。'},
        {title:'锚件钢材',fields:[
          field('fy','锚材屈服强度 fya','MPa'),field('fu','锚材抗拉强度 futa','MPa'),field('ductile','锚材延性','',[['true','符合延性条件'],['false','按非延性取值']],true)
        ],note:'按拉伸试验判定延性时，断后伸长率须 ≥ 14%，断面收缩率须 ≥ 30%。按 ACI 第 2 章核对材料证明。'}
      ],
      array:[
        {title:'锚群布置',fields:[field('nx','X 向列数 nx','列'),field('ny','Y 向排数 ny','排'),field('sx','X 向间距 sx','mm'),field('sy','Y 向间距 sy','mm')]},
        {title:'锚件尺寸',fields:[field('d',p.anchorType==='weldedRebar'||p.anchorType==='rebar'?'主筋直径 d':'锚杆直径 da','mm'),
          field('hef',p.anchorType==='weldedRebar'?'主筋端部埋深':'有效埋深 hef','mm'),...anchorSizeFields[p.anchorType]
        ],note:sizeNote[p.anchorType]||'hef 按锚件承压位置量取。弯钩长度、钉头尺寸及焊后长度应按制作详图核实。'},
        {title:'居中锚板',fields:[field('plateX','锚板 X 向宽度','mm'),field('plateY','锚板 Y 向长度','mm'),field('plateThickness','锚板实厚 tp','mm')],
          note:state.legacyThickness?'旧参数文件未记录锚板厚度，暂取 '+geometries.plateThickness+' mm。请按实际详图核定。':'模型按实厚绘制。锚板抗弯请见右侧单独验算。'}
      ],
      edges:[
        {title:'混凝土边界',fields:[
          field('left','左边距（−X）','mm'),field('right','右边距（+X）','mm'),
          field('bottom','下边距（−Y）','mm'),field('top','上边距（+Y）','mm'),
          field('h','混凝土厚度 h','mm'),field('cover','要求净保护层','mm')
        ],note:'四边距离从最外排锚杆中心量至混凝土自由边，勿填锚杆至锚板边的距离。'}
      ],
      loads:[
        {title:'当前荷载组合',fields:[
          field('caseName','荷载组合名称','',null,true),field('nu','拉力 Nu','kN'),field('mx','弯矩 Mx','kN·m'),
          field('vy','剪力 Vy','kN'),field('mode','受拉排分配','',[['elastic','弹性分配'],['contact','接触分析']]),
          ...(c.mode==='contact'?[field('tPlus','上外排拉力 T+','kN'),field('tMinus','下外排拉力 T−','kN')]:[])
        ],note:c.mode==='contact'?'从板与混凝土接触分析输入外排拉力。多于两排时，仅适用单侧外排受拉或全压。':'输入已分项的设计内力，作用点为传力面锚群形心。组合出现压区时，应改用接触分析。'}
      ]
    };
  }
  function val(key) {
    if(key==='name') return state.name;
    if(key==='caseName') return activeCase().name;
    return loadFields.includes(key)?activeCase()[key]:state.params[key];
  }
  function fieldMarkup(f) {
    const value=val(f.key), id='p-'+f.key;
    let control;
    if(f.key==='nutDetailVerified'){
      control='<input type="checkbox" id="'+id+'" data-key="'+f.key+'"'+(value===true?' checked':'')+'><span aria-hidden="true">已对照项目详图逐项核实</span>';
    } else if(f.options) {
      control='<select id="'+id+'" data-key="'+f.key+'">'+f.options.map(([v,label])=>
        '<option value="'+esc(v)+'"'+(String(value??'')===v?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select>';
    } else {
      const text=f.key==='name'||f.key==='caseName';
      control='<input id="'+id+'" data-key="'+f.key+'" type="'+(text?'text':'number')+'" '+
        (text?'maxlength="120"':'step="'+(['nx','ny','endBarCount'].includes(f.key)?'1':'any')+'"')+' value="'+esc(value)+'">'+
        (f.unit?'<span class="unit" aria-hidden="true">'+esc(f.unit)+'</span>':'');
    }
    return '<div class="field'+(f.wide?' wide':'')+'"><label for="'+id+'">'+esc(f.label)+
      (f.unit?'<span class="sr-only">，'+esc(f.unit)+'</span>':'')+'</label><div class="field-control">'+control+'</div></div>';
  }
  function paintFields() {
    $('tabs').innerHTML=groups.map(([key,label])=>'<button type="button" data-tab="'+key+'" aria-pressed="'+(tab===key)+'">'+label+'</button>').join('');
    $('param-panels').innerHTML=descriptions()[tab].map(section=>'<section class="input-section"><h3>'+esc(section.title)+'</h3><div class="fields">'+
      section.fields.map(fieldMarkup).join('')+(section.note?'<p class="field-note">'+esc(section.note)+'</p>':'')+'</div></section>').join('');
    $('preset').value=state.preset;
  }
  function selectInput(key) {
    const section=Object.entries(descriptions()).find(([,parts])=>parts.some(part=>part.fields.some(f=>f.key===key)));
    if(!section) return;
    tab=section[0];paintFields();
    const target=$('p-'+key);target.focus();target.scrollIntoView({block:'nearest'});
  }
  function changeField(event) {
    const el=event.target, key=el.dataset.key;
    if(!key || (el.tagName==='SELECT' && event.type!=='change') || (el.tagName!=='SELECT' && event.type!=='input')) return;
    const value=el.type==='checkbox'?el.checked:el.type==='number'?(el.value===''||!Number.isFinite(el.valueAsNumber)?null:el.valueAsNumber):el.value;
    if(key==='name') state.name=value;
    else if(key==='caseName') activeCase().name=value;
    else if(loadFields.includes(key)) {
      activeCase()[key]=value;
      if(key==='mode'&&value==='elastic') {activeCase().tPlus=null;activeCase().tMinus=null;}
    } else {
      state.params[key]=key==='ductile'?value==='true':key==='fc'?(value===''?null:Number(value)):value;
      if(key==='plateThickness')window.EmbedSupplement?.syncPlateThickness?.(document,value);
      if(state.params.anchorType==='headedBolt'&&['d','dh','headHeight','aseN','aseV','bearingArea','straight','fy','fu','plateThickness'].includes(key)){
        state.params.nutDetailVerified=false;
        if($('p-nutDetailVerified'))$('p-nutDetailVerified').checked=false;
      }
      if(key==='plateThickness' && state.legacyThickness) {
        state.legacyThickness=false;
        const note=el.closest('.fields')?.querySelector('.field-note');
        if(note)note.textContent='模型按实厚绘制。锚板抗弯请见右侧单独验算。';
      }
    }
    state.preset='custom';$('preset').value='custom';
    if(key==='mode'||key==='anchorType') paintFields();
    paintValues();scheduleSave();
  }
  function calculate(c) {
    if(state.params.anchorType==='rebar') return {ok:false,status:'invalid',errors:['带肋弯钩钢筋需核对第 25 章标准钩几何与发展长度，并另验群筋混凝土破坏和传剪。本页锚栓分项暂停。'],checks:[],utilization:null,scope:engine.scope};
    return engine.calculate({...state.params,...c});
  }
  function paintTable() {
    $('load-cases').innerHTML=state.cases.map((c,i)=>{
      const r=results[i], selected=i===state.activeIndex;
      return '<tr data-row="'+i+'" class="'+(selected?'active-case':'')+'"><td><button type="button" class="case-link" data-case="'+i+'" aria-pressed="'+selected+'" title="选择并编辑此组合">'+
        esc(c.name||'未命名组合')+'</button></td><td>'+fmt(c.nu,2)+'</td><td>'+fmt(c.mx,3)+'</td><td>'+fmt(c.vy,2)+'</td><td class="'+(r.status==='fail'?'fail-text':'')+'">'+
        (r.ok?pct(r.utilization):r.status==='special'?'构造核对':'待核')+'</td><td><button class="case-remove" type="button" data-remove="'+i+'" aria-label="删除'+esc(c.name||'此组合')+'"'+
        (state.cases.length===1?' disabled':'')+'>×</button></td></tr>';
    }).join('');
    $('add-case').disabled=state.cases.length>=100;
  }
  function meaning(c,r) {
    if(!c||!c.applicable)return '';
    const side={top:'上边（+Y）',bottom:'下边（−Y）',left:'左边（−X）',right:'右边（+X）'}[r.trace.controllingFace];
    const text={
      steelN:'受拉最大的一根锚杆可能被拉断。',
      pullout:state.params.anchorType==='hooked'?'弯钩挤压周围混凝土，锚杆可能被拔出。':state.params.anchorType==='headedBolt'?'端部螺母挤压周围混凝土，锚栓可能被拔出。':'钉头挤压周围混凝土，栓钉可能被拔出。',
      breakoutN:'拉力可能使一组锚件连同锥状混凝土一起被拉出。',
      sideface:'深埋钉头靠近自由边，钉头侧面的混凝土可能向外崩落。',
      steelV:'传剪排中，受力最大的一根锚杆可能被剪断。',
      breakoutV:'剪力可能把靠边的混凝土推落。控制边为'+side+'，剪力 '+fmt(c.demand,2)+' kN，抗力 '+fmt(c.capacity,2)+' kN。',
      pryout:'剪力使锚杆转动，可能把杆后方的混凝土撬起。',
      interactionConcrete:'拉力和剪力同时作用于混凝土，按锚群混凝土破坏模式组合校核。',
      interactionSteel:'同一根锚杆同时承受拉力和剪力，按钢材拉剪共同作用校核。'
    };
    return text[c.id]||'';
  }
  function checkMarkup(c,result,openIds) {
    const ratio=c.ratio, applies=c.applicable;
    const detail=applies?'需求 '+fmt(c.demand,3)+' '+esc(c.unit)+' / 抗力或限值 '+fmt(c.capacity,3)+' '+esc(c.unit):'该锚型或受力条件下不触发。';
    return '<details class="check'+(ratio>1?' over':'')+(c.label===result.governing?' critical':'')+'" data-check="'+esc(c.id)+'"'+(openIds.has(c.id)?' open':'')+
      '><summary><div class="check-row"><span>'+esc(c.label)+'</span><strong>'+(applies?pct(ratio):'不适用')+'</strong></div>'+
      (applies?'<div class="meter"><i style="width:'+Math.min(100,Math.max(0,100*ratio))+'%"></i></div>':'')+
      '</summary>'+(applies?'<p>'+esc(meaning(c,result))+'</p>':'')+'<p>'+detail+'</p><p>'+esc(c.clause)+'　'+esc(c.formula)+'</p></details>';
  }
  function paintResults(r) {
    const rail=$('results-content'),openIds=new Set([...rail.querySelectorAll('details[open]')].map(d=>d.dataset.check));
    let text='<div class="current-case">'+esc(activeCase().name||'未命名组合')+'</div>';
    if(r.status==='special') {
      text+='<div class="judgement amber">端部附焊短筋 · 构造核对</div><p class="rail-copy">以下比较仅反映所列构造尺寸。锚固承载力须结合发展、焊缝与群筋传力另算。</p>';
      const verdicts={pass:'符合所列构造',fail:'不符合所列构造',review:'需另行核定'};
      text+='<div class="special-list">'+(r.specialChecks||[]).map(c=>'<div class="special-item"><strong>'+esc(c.label)+'</strong><p>'+esc(c.actual)+'　'+esc(c.required)+'</p><p>'+esc(verdicts[c.status]||c.status)+'　'+esc(c.clause)+'</p></div>').join('')+'</div>';
      text+='<p class="rail-copy">'+(r.errors||[]).map(esc).join(' ')+'</p>';
    } else if(!r.ok) {
      text+='<div class="judgement amber">锚固验算待核对</div><ul class="msg-errors">'+r.errors.map(e=>'<li>'+esc(e)+'</li>').join('')+'</ul>';
      if(state.params.anchorType==='headedBolt'&&!state.params.nutDetailVerified)text+='<button type="button" class="case-link" data-nut-review>查看端螺母详图核定项 ↗</button>';
    } else {
      text+='<div class="judgement'+(r.status==='fail'?' red':'')+'">'+(r.status==='fail'?'当前组合锚固超限':'当前组合锚固满足')+'</div><div class="hero-metric'+(r.status==='fail'?' red':'')+'"><strong>'+
        pct(r.utilization)+'</strong><span>控制利用率</span></div><p class="control-line">控制项　'+esc(r.governing)+'</p><p class="control-meaning">'+
        esc(meaning(r.checks.find(c=>c.label===r.governing),r))+'100% 为验算限值。</p><div class="rail-divider"></div>';
      for(const [kind,title] of [['N','受拉'],['V','受剪'],['NV','拉剪共同作用']]) {
        text+='<h3 class="rail-subtitle">'+title+'</h3>'+r.checks.filter(c=>c.kind===kind).map(c=>checkMarkup(c,r,openIds)).join('');
      }
    }
    const incomplete=results.filter(c=>!c.ok).length,failed=results.filter(c=>c.status==='fail').length;
    const governingIndex=results.reduce((best,x,i)=>!x.ok?best:(best<0||x.utilization>results[best].utilization?i:best),-1);
    text+='<div class="rail-divider"></div><h3 class="rail-subtitle">全部组合</h3><p class="rail-copy">'+
      (r.status==='special'?state.cases.length+' 个荷载组合尚待承载力分析':(state.cases.length-failed-incomplete)+' 项满足 · '+failed+' 项超限 · '+incomplete+' 项待核')+'</p>';
    if(governingIndex>=0) text+='<button type="button" class="case-link" data-govern="'+governingIndex+'">最不利已算组合　'+esc(state.cases[governingIndex].name||'未命名组合')+' ↗</button>';
    text+='<p class="rail-scope" style="margin-top:14px">以上结论仅覆盖锚固。锚板、焊缝、局部承压和主体传力须结合节点详图另核。</p>';
    text+='<h3 class="rail-subtitle">单独验算</h3><div class="supplement-links"><button type="button" data-supp="steel">钢板、焊缝与承压 ↗</button><button type="button" data-supp="rebar">带肋钢筋标准钩 ↗</button></div>';
    rail.innerHTML=text;
  }
  function paintValues() {
    $('project-title').textContent=state.name||'未命名节点';
    results=state.cases.map(calculate);
    paintTable();paintResults(results[state.activeIndex]);
    const modelMessage=$('model-message');
    modelMessage.hidden=false;
    if(!viewer) modelMessage.textContent='交互模型未载入。';
    else {
      try {viewer.update(params(),activeCase());modelMessage.hidden=true;}
      catch {modelMessage.textContent='请核对几何输入，模型将随有效参数更新。';}
    }
  }
  function loadCase(index,edit=true) {
    state.activeIndex=index;
    if(edit) tab='loads';
    paintFields();paintValues();scheduleSave();
  }
  $('param-panels').addEventListener('input',changeField);
  $('param-panels').addEventListener('change',changeField);
  $('param-panels').addEventListener('focusin',event=>{if(viewer&&event.target.dataset.key)viewer.focus(event.target.dataset.key);});
  $('tabs').addEventListener('click',event=>{
    const key=event.target.closest('[data-tab]')?.dataset.tab;
    if(key){tab=key;paintFields();$('param-panels').scrollTop=0;}
  });
  $('preset').addEventListener('change',event=>{
    if(!Object.hasOwn(grids,event.target.value))return;
    replaceProject(makeExample(event.target.value));tab='node';paintFields();paintValues();save();notify('参考算例已载入');
  });
  $('load-cases').addEventListener('click',event=>{
    const remove=event.target.closest('[data-remove]');
    if(remove) {
      if(state.cases.length<2)return;
      const i=Number(remove.dataset.remove);
      state.cases.splice(i,1);
      if(i<state.activeIndex||state.activeIndex>=state.cases.length)state.activeIndex--;
      state.preset='custom';loadCase(state.activeIndex);return;
    }
    const row=event.target.closest('[data-row]');
    if(row)loadCase(Number(row.dataset.row));
  });
  $('add-case').addEventListener('click',()=>{
    if(state.cases.length>=100)return;
    state.cases.push({...activeCase(),name:'组合 '+(state.cases.length+1)});state.preset='custom';
    loadCase(state.cases.length-1);$('p-caseName').focus();$('p-caseName').select();notify('已复制当前组合，可编辑设计内力');
  });
  $('results-content').addEventListener('click',event=>{
    if(event.target.closest('[data-nut-review]'))selectInput('nutDetailVerified');
    const a=event.target.closest('[data-govern]');
    if(a)loadCase(Number(a.dataset.govern));
    const supp=event.target.closest('[data-supp]');
    if(supp) {
      if(window.EmbedSupplement)window.EmbedSupplement.open(document,params(),supp.dataset.supp);
      else notify('单独验算模块未载入，请刷新页面。');
    }
  });
  $('recalc-btn').addEventListener('click',()=>{paintValues();save();notify('已重新计算全部荷载组合');});
  $('export-btn').addEventListener('click',()=>{
    const a=document.createElement('a'), url=URL.createObjectURL(new Blob([JSON.stringify(currentProject(),null,2)],{type:'application/json'}));
    a.href=url;a.download=(state.name||'美标埋件').replace(/[\\/:*?"<>|]/g,'-')+'.json';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);notify('已导出节点参数、荷载组合与专项输入');
  });
  $('import-btn').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try {
      if(file.size>1024*1024)throw Error('参数文件大于 1 MB，请检查文件类型。');
      let raw;try{raw=JSON.parse(await file.text());}catch{throw Error('文件不是有效的 JSON。');}
      replaceProject(readState(raw));tab='node';paintFields();paintValues();save();
      notify(raw.codeEdition===EDITION?'参数与荷载组合已导入':'旧参数已导入，各组合按 ACI CODE-318-25 重新计算。');
    }catch(error){notify(error.message||'无法导入此参数文件。');}
    finally{event.target.value='';}
  });
  $('report-btn').addEventListener('click',()=>{
    if(!window.EmbedReport){notify('计算书模块未载入，请刷新页面。');return;}
    window.EmbedReport.open(document,params(),results[state.activeIndex],{name:state.name,cases:state.cases,activeIndex:state.activeIndex,results});
  });
  $('paper-btn').addEventListener('click',()=>{
    if(window.EmbedReport)window.EmbedReport.paper(document);
    else notify('论文对照模块未载入，请刷新页面。');
  });
  paintFields();
  if(window.EmbedViewer)viewer=window.EmbedViewer.create($('model-view'),selectInput);
  paintValues();
})();
