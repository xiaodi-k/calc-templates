// Formula renderer reused from the mullion template.
var TEX_GREEK = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'θ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ',
  tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω'
};

var TEX_SYM = {
  cdot: '·', times: '×', div: '÷', pm: '±',
  leqslant: '≤', geqslant: '≥', leq: '≤', geq: '≥', le: '≤', ge: '≥',
  neq: '≠', approx: '≈', infty: '∞', ldots: '…', dots: '…', cdots: '⋯'
};

var TEX_FN = { max: 'max', min: 'min', sin: 'sin', cos: 'cos', tan: 'tan', ln: 'ln' };

function texEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tex2html(src) {
  var s = String(src), i = 0;

  function readArg() {
    if (s[i] === '{') {
      var depth = 0, st = i;
      do {
        if (s[i] === '{') depth++;
        else if (s[i] === '}') depth--;
        i++;
      } while (i < s.length && depth > 0);
      return s.slice(st + 1, i - 1);
    }
    if (s[i] === '\\') {
      var m = /\\([a-zA-Z]+|.)/.exec(s.slice(i));
      if (m) { i += m[0].length; return m[0]; }
    }
    var c = s[i];
    i++;
    return c || '';
  }

  function parse(top) {
    var out = '';
    while (i < s.length) {
      var c = s[i];

      if (c === '}') {
        if (!top) i++;
        break;
      } else if (c === '{') {
        i++;
        out += parse(false);
      } else if (c === '^') {
        i++;
        out += '<sup>' + tex2html(readArg()) + '</sup>';
      } else if (c === '_') {
        i++;
        out += '<sub>' + tex2html(readArg()) + '</sub>';
      } else if (c === '\\') {
        var m = /\\([a-zA-Z]+|.)/.exec(s.slice(i));
        var cmd = m ? m[1] : '';
        i += m ? m[0].length : 1;

        if (cmd === 'frac') {
          var a = readArg(), b = readArg();
          out += '<span class="fx-frac"><span class="fx-num">' + tex2html(a) +
                 '</span><span class="fx-den">' + tex2html(b) + '</span></span>';
        } else if (cmd === 'bar') { out += '<span class="fx-bar">' + tex2html(readArg()) + '</span>'; } else if (cmd === 'sqrt') {
          var idx = '';
          if (s[i] === '[') {
            i++;
            var st2 = i;
            while (i < s.length && s[i] !== ']') i++;
            idx = s.slice(st2, i);
            i++;
          }
          out += '<span class="fx-sqrt">' +
                 (idx ? '<sup class="fx-radidx">' + tex2html(idx) + '</sup>' : '') +
                 '<span class="fx-rad">√</span>' +
                 '<span class="fx-radicand">' + tex2html(readArg()) + '</span></span>';
        } else if (cmd === 'left' || cmd === 'right') {
          var d = s[i] || (cmd === 'left' ? '(' : ')');
          i++;
          out += '<span class="fx-delim">' + texEsc(d) + '</span>';
        } else if (cmd === 'mathrm' || cmd === 'text' || cmd === 'textrm' ||
                   cmd === 'operatorname' || cmd === 'mbox') {
          out += '<span class="fx-rm">' + tex2html(readArg()) + '</span>';
        } else if (TEX_GREEK[cmd] !== undefined) {
          out += '<span class="fx-mi">' + TEX_GREEK[cmd] + '</span>';
        } else if (TEX_SYM[cmd] !== undefined) {
          out += '<span class="fx-mo">' + TEX_SYM[cmd] + '</span>';
        } else if (TEX_FN[cmd] !== undefined) {
          out += '<span class="fx-rm">' + TEX_FN[cmd] + '</span>';
        } else if (cmd === 'quad' || cmd === 'qquad') {
          out += '<span class="fx-space"></span>';
        } else if (cmd === ',' || cmd === ';' || cmd === ':' || cmd === '!' ||
                   cmd === ' ') {
          out += '<span class="fx-thin"></span>';
        } else {
          out += '<span class="fx-mi">' + texEsc(cmd) + '</span>';
        }
      } else if (c === '^') {
        i++;
        out += '<sup>' + tex2html(readArg()) + '</sup>';
      } else if (c === '_') {
        i++;
        out += '<sub>' + tex2html(readArg()) + '</sub>';
      } else {
        i++;
        out += c === '<' ? '&lt;' : (c === '>' ? '&gt;' : c);
      }
    }
    return out;
  }

  return parse(true);
}

(function () {
  'use strict';
  const $=id=>document.getElementById(id),T=String.raw;
  const sections=MullionSections.sections;
  const defaults=Object.fromEntries(Object.entries(sections).map(([k,s])=>[k,Object.fromEntries(s.dims.map(d=>[d[0],d[2]]))]));
  const initialProcesses={ibeam:'rolled',tube:'seamless',box:'welded'};
  let selected='ibeam',type='i',dims=structuredClone(defaults),raw=structuredClone(defaults),processes={...initialProcesses};
  const lastValid=structuredClone(defaults);
  const coreType={tube:'chs',box:'box',ibeam:'i'};
  const fmt=(n,d=3)=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
  const f=n=>fmt(n,3),F=s=>'<div class="formula">'+tex2html(s)+'</div>';
  const prop=(name,value,unit='')=>'<div class="prop"><span>'+name+'</span><strong>'+value+'</strong><small>'+unit+'</small></div>';
  const family=()=>$('family').value;
  function materialOptions() {
    const previous=$('grade').value,options=BeamColumnMaterials.grades[family()];
    $('grade').innerHTML=options.map(v=>'<option value="'+v+'">'+(BeamColumnMaterials.names[v]||v)+'</option>').join('');
    $('grade').value=options.includes(previous)?previous:options[0];
    productOptions();
  }
  function productOptions() {
    $('alProductRow').hidden=family()!=='aluminium';
    $('proofRow').hidden=family()!=='aluminium'||$('product').value!=='verified';
    $('materialScope').textContent=family()==='steel'?'GB 50017-2017 · 按厚度分档取钢材强度。':family()==='stainless'?'CECS 410:2015 · 固溶处理材料；不计冷作强度提高。':'GB 50429-2007 · 按产品类型取 f0.2；本版承载力计算限无焊接热影响区。5083-H112 自动数据仅覆盖管材，其余产品可输入产品标准值。';
  }
  function processOptions() {
    const old=$('process').value,key=family()+':'+selected;
    const options=!type?[['pending','稳定计算待补充']]:family()==='stainless'?(type==='i'?[['ss-welded','焊接工字形']]:type==='chs'?[['ss-cold','冷成型圆管（成型后未退火）'],['ss-other','其他圆管 / 成型后退火']]:[['ss-welded','焊接箱形'],['ss-cold','冷成型方矩管（成型后未退火）']]):family()==='aluminium'?[['al-unwelded','无焊接热影响区'],['al-welded','有焊接 · 需另算热影响区']]:type==='i'?[['rolled','轧制'],['welded-flame','焊接 · 焰切边'],['welded-cut','焊接 · 轧制/剪切边']]:type==='chs'?[['seamless','热轧无缝'],['welded','焊接圆管']]:[['welded','焊接箱形']];
    $('process').innerHTML=options.map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join('');
    const value=processes[key]||processes[selected]||old;
    $('process').value=options.some(v=>v[0]===value)?value:options[0][0];$('process').disabled=!type;
    const carbon=family()==='steel';
    $('betaInputs').hidden=!type||(carbon&&type==='chs');
    $('btxField').hidden=$('btyField').hidden=!carbon;
    ['bmx','bmy'].forEach(k=>{$(k).min=carbon?'0.1':family()==='stainless'?'0.2':'0.3';$(k).max=carbon?'2':'1';});
    $('betaNote').textContent=!type?'此截面的稳定计算待补充。':!carbon?'βmx、βmy 默认 1；按'+(family()==='stainless'?'5.5.3（端弯矩：0.6 + 0.4M2/M1）':'8.2.1（端弯矩：0.65 + 0.35M2/M1）')+'核定。受弯整体稳定按均匀弯矩计算。':type==='chs'?'圆管按 8.2.4 取同号等端弯矩，βx = βy = 1，β = 1。':'默认均匀弯矩，系数均为 1；其他弯矩分布按 8.2.1 核定。';
  }
  function buildOptions() {
    $('sec').innerHTML=Object.entries(sections).map(([k,s])=>{
      const supported=Boolean(coreType[k]);
      const state=supported?'supported':'pending';
      const description=supported?'可进行压弯验算':'待开发，仅可查看截面参数，暂不支持压弯验算';
      return '<label class="section-option '+state+'" title="'+s.name+' · '+description+'">'+
        '<input type="radio" name="section-type" value="'+k+'" aria-label="'+s.name+'，'+description+'"'+(selected===k?' checked':'')+'>'+
        '<span class="section-icon">'+MullionSections.icon(k)+'</span>'+
        '<span class="section-state" aria-hidden="true">'+(supported?'可验算':'待开发')+'</span></label>';
    }).join('');
  }
  function dimensionInputs() {
    type=coreType[selected]||null;
    $('sectionAvailability').className='section-availability '+(type?'supported':'pending');
    $('sectionAvailability').textContent=sections[selected].name+(type?' · 支持强度、整体稳定及局部稳定验算':' · 待开发，目前仅支持截面参数计算');
    $('calculate').textContent=type?'更新计算':'更新截面参数';
    processOptions();
    $('secHint').textContent=sections[selected].name+' · 尺寸单位 mm · x 轴水平，y 轴竖直。改完按回车或移开焦点生效。';
    drawSection();
  }
  function drawSection() {
    try{MullionSections.validate(selected,dims[selected]);lastValid[selected]={...dims[selected]};}catch(e){/* Keep editable fields visible while invalid. */}
    $('secPrev').innerHTML=MullionSections.draw(selected,lastValid[selected],raw[selected]);
  }
  function read() {
    const p={type,...dims[selected],family:family(),grade:$('grade').value,process:$('process').value,product:$('product').value,f02:$('f02').value.trim()===''?NaN:Number($('f02').value)};
    for(const key of ['N','Mx','My','Lx','Ly','bmx','bmy','btx','bty'])p[key]=$(key).value.trim()===''?NaN:Number($(key).value);
    if(type==='chs'&&family()==='steel')p.bmx=p.bmy=p.btx=p.bty=1;
    return p;
  }
  function materialInfo(m) {
    $('matInfo').innerHTML=prop('f',m?fmt(m.f,2):'—','MPa')+prop(family()==='steel'?'fy':'f0.2',m?fmt(m.fy,0):'—','MPa')+prop('E',m?fmt(m.E,0):'—','MPa');
  }
  function renderPending(s) {
    $('status').className='';
    $('status').innerHTML='<div class="statusline pending">截面参数已计算 · 稳定计算待补充</div>';
    $('checks').innerHTML='';
    $('warnings').innerHTML='<div class="warning">'+sections[selected].name+'的整体稳定及局部稳定方法尚未接入。本页不输出此截面的承载力利用率或满足结论。</div>';
    let m=null;
    try{m=BeamColumnMaterials.material(read(),{tmax:s.tc});}catch(e){/* No extrapolation of strength bands. */}
    materialInfo(m);
    $('materialNote').textContent=m?'当前仅显示材料与截面参数；稳定分类和制造工艺待补充。':'控制厚度超出当前强度表范围，仅显示截面参数。';
    $('report').innerHTML='<section class="card"><h2>截面参数 <span>SECTION</span></h2><div class="body"><p class="report-inputs"><strong>'+sections[selected].name+'</strong> · '+Object.entries(dims[selected]).map(([k,v])=>k+' = '+v+' mm').join('，')+'</p><div class="props">'+prop('A',fmt(s.A,2),'mm²')+prop('Ix',fmt(s.Ix/1e4,2),'cm⁴')+prop('Iy',fmt(s.Iy/1e4,2),'cm⁴')+prop('Wx',fmt(s.Wx/1e3,2),'cm³')+prop('Wy',fmt(s.Wy/1e3,2),'cm³')+prop('ix',f(s.ix),'mm')+prop('iy',f(s.iy),'mm')+'</div><p class="section-note">采用立柱模板相同的截面几何积分；圆形采用解析式。惯性矩绕形心轴计算，截面模量按较远外缘取值。</p></div></section>';
  }
  function render(r) {
    const {p,s,m,bx,by,local,ltb}=r;
    if(p.family&&p.family!=='steel'){renderMaterial(r);return;}
    materialInfo(m);
    $('materialNote').textContent=`f = ${m.f} MPa · fy = ${m.fy} MPa · E = 206,000 MPa（${m.source}，控制厚度 ${s.tmax} mm）`;
    const status=r.passing?(r.needsReview?'承载力验算满足 · 长细比待复核':'本 Demo 范围内满足'):'本工况不满足';
    $('status').innerHTML='<div class="statusline '+(r.passing&&!r.needsReview?'ok':'ng')+'">'+status+'<small>利用率限值 1.00</small></div>';
    $('checks').innerHTML=r.checks.map(c=>'<div class="check '+(c.value>1?'failed':'')+'"><div class="check-head"><span>'+c.name+'</span><strong>'+(Number.isFinite(c.value)?fmt(c.value,3):'超出范围')+'</strong></div><div class="track"><div class="fill" style="width:'+Math.min(100,c.value*100)+'%"></div></div><small>'+(c.id==='local'?local.label+' · 按 S3 限值':Number.isFinite(c.stress)?fmt(c.stress,2)+' / '+m.f+' MPa':'二阶放大失效')+'</small></div>').join('');
    $('warnings').innerHTML=r.warnings.map(w=>'<div class="warning">'+w+'</div>').join('');
    const dimsLabel=Object.entries(dims[selected]).map(([k,v])=>k+' = '+v+' mm').join('，');
    let html='<section class="card"><h2>截面与工况 <span>SECTION</span></h2><div class="body"><div class="report-inputs"><strong>'+sections[selected].name+' · '+m.grade+'</strong> · '+$('process').selectedOptions[0].textContent+'<br>'+dimsLabel+'<br>N = '+p.N+' kN，Mx = '+p.Mx+' kN·m，My = '+p.My+' kN·m；Lx = '+p.Lx+' m，Ly = '+p.Ly+' m</div><div class="props" style="margin-top:17px">'+prop('A',fmt(s.A,2),'mm²')+prop('Ix',fmt(s.Ix/1e4,2),'cm⁴')+prop('Iy',fmt(s.Iy/1e4,2),'cm⁴')+prop('f',fmt(m.f,0),'MPa')+prop('Wx',fmt(s.Wx/1e3,2),'cm³')+prop('Wy',fmt(s.Wy/1e3,2),'cm³')+prop('ix',f(s.ix),'mm')+prop('iy',f(s.iy),'mm')+'</div><p class="section-note">几何净截面 = 毛截面；工字形、箱型不计圆角，截面性能不等同于含圆角的厂家型材表。</p></div></section>';
    const step=(n,title,ref,content)=>'<section class="step"><h3>'+n+' · '+title+'<span class="ref">'+ref+'</span></h3>'+content+'</section>';
    html+='<section class="card report-card"><h2>计算过程 <span>CALCULATION</span></h2><div class="body">';
    html+=step('01','截面参数与材料','GB 50017-2017 '+m.source,
      F(type==='chs'?T`A=\frac{\pi}{4}[D^2-(D-2t)^2]`:type==='box'?T`A=BH-(B-2t_w)(H-2t_f)`:T`A=2Bt_f+(H-2t_f)t_w`)+
      F(T`i_x=\sqrt{\frac{I_x}{A}}=${f(s.ix)}\ \mathrm{mm},\quad i_y=${f(s.iy)}\ \mathrm{mm}`)+
      F(T`f=${m.f}\ \mathrm{MPa},\quad f_y=${m.fy}\ \mathrm{MPa},\quad \varepsilon_k=\sqrt{\frac{235}{${m.nominal}}}=${f(m.epsilon)}`));
    const table='<div class="table-wrap"><table><thead><tr><th>板件</th><th>宽厚比</th><th>S3 限值</th><th>等级</th></tr></thead><tbody>'+local.rows.map(q=>'<tr><td>'+q.name+'</td><td>'+f(q.ratio)+'</td><td>'+f(q.limit)+'</td><td class="'+(q.level<=3?'oktext':'ngtext')+'">'+(q.level<5?'S'+q.level:'超过 S4')+'</td></tr>').join('')+'</tbody></table></div>';
    html+=step('02','板件等级与塑性发展系数','表 3.5.1、8.1.1、表 8.1.1',table+
      (type==='i'?F(T`\alpha_0=\frac{\sigma_{max}-\sigma_{min}}{\sigma_{max}}=${f(local.alpha)}`):'')+
      F(T`\gamma_x=${f(r.gx)},\quad\gamma_y=${f(r.gy)}`)+
      '<p>'+(!local.ok?'超过 S3，塑性发展系数取 1.0；承载力数值仅作诊断，局部稳定未通过。':type==='box'?'箱型各壁板采用均匀受压限值，未利用弯曲应力梯度放宽。':'截面满足 S3，采用相应截面塑性发展系数。')+'</p>');
    const bucklingRow=(axis,v)=>F(T`\lambda_${axis}=\frac{L_${axis}}{i_${axis}}=${f(v.lambda)},\quad \lambda_{n${axis}}=\frac{\lambda_${axis}}{\pi}\sqrt{\frac{f_y}{E}}=${f(v.ln)},\quad\varphi_${axis}=${f(v.phi)}`)+
      '<p>绕 '+axis+' 轴：'+v.curve+' 类；α₁ = '+v.coefficients[0]+'，α₂ = '+v.coefficients[1]+'，α₃ = '+v.coefficients[2]+'。</p>';
    html+=step('03','双向受压稳定系数','7.2.1、7.2.2、表 7.2.1-1 / -2、附录 D.0.5',
      F(T`\lambda_n\leq0.215:\quad\varphi=1-\alpha_1\lambda_n^2`)+
      F(T`\lambda_n>0.215:\quad\varphi=\frac{q-\sqrt{q^2-4\lambda_n^2}}{2\lambda_n^2},\quad q=\alpha_2+\alpha_3\lambda_n+\lambda_n^2`)+bucklingRow('x',bx)+bucklingRow('y',by));
    html+=step('04','受弯整体稳定系数','8.2.5、附录 C',
      type==='i'?(by.lambda<=120*m.epsilon?
        F(T`\varphi_{bx}=\min(1,1.07-\frac{\lambda_y^2}{44000\varepsilon_k^2})=${f(ltb.phi)}`):
        F(T`\varphi_{b0}=\frac{4320}{\lambda_y^2}\frac{AH}{W_x}\sqrt{1+(\frac{\lambda_y t_f}{4.4H})^2}\varepsilon_k^2=${f(ltb.raw)}`)+
        F(T`\varphi_{bx}=${f(ltb.phi)}`))+
        F(T`\varphi_{by}=1.0,\quad\eta=1.0`)+ '<p>'+ltb.method+'。Ly 同时作为侧向支承间距；βb = 1、ηb = 0。</p>':
        F(T`\varphi_{bx}=\varphi_{by}=1.0`)+(type==='box'?F(T`\eta=0.7`):'<p>圆管的整体稳定采用 8.2.4，不套用工字形的双向线性叠加式。</p>'));
    html+=step('05','欧拉力与二阶放大参数','8.2.1-2、8.2.5-3；圆管另见 8.2.4-6',
      F(T`N_{Ex}=\frac{\pi^2EA}{\lambda_x^2}=${f(r.NEx/1000)}\ \mathrm{kN},\quad N'_{Ex}=\frac{N_{Ex}}{1.1}=${f(r.Npx/1000)}\ \mathrm{kN}`)+
      F(T`N_{Ey}=${f(r.NEy/1000)}\ \mathrm{kN},\quad N'_{Ey}=${f(r.Npy/1000)}\ \mathrm{kN}`)+
      F(T`d_x=1-0.8\frac{N}{N'_{Ex}}=${f(r.dx)},\quad d_y=${f(r.dy)}`)+
      (type==='chs'?'<p>圆管以最大长细比计算欧拉力及二阶放大参数。</p>':''));
    html+=step('06','截面强度','8.1.1'+(type==='chs'?'-2':'-1'),
      F(type==='chs'?T`\sigma=\frac{N}{A}+\frac{\sqrt{M_x^2+M_y^2}}{\gamma_m W}`:T`\sigma=\frac{N}{A}+\frac{|M_x|}{\gamma_x W_x}+\frac{|M_y|}{\gamma_y W_y}`)+
      F(T`\sigma=${f(r.strength)}\ \mathrm{MPa},\quad U_\sigma=\frac{\sigma}{f}=${f(r.strength/m.f)}`));
    html+=step('07','整体稳定验算',type==='chs'?'8.2.4-1～6':'8.2.5-1、8.2.5-2',
      (type==='chs'?
        F(T`M=\sqrt{M_x^2+M_y^2},\quad\beta=1,\quad\varphi=\min(\varphi_x,\varphi_y)`)+
        F(T`U=\frac{N}{\varphi Af}+\frac{\beta M}{\gamma_m W(1-0.8N/N'_E)f}=${f(r.sx/m.f)}`):
        F(T`U_x=\frac{N}{\varphi_x Af}+\frac{\beta_{mx}|M_x|}{\gamma_x W_x d_x f}+\eta\frac{\beta_{ty}|M_y|}{\varphi_{by}W_y f}`)+
        F(T`U_y=\frac{N}{\varphi_y Af}+\eta\frac{\beta_{tx}|M_x|}{\varphi_{bx}W_x f}+\frac{\beta_{my}|M_y|}{\gamma_y W_y d_y f}`)+
        F(T`\beta_{mx}=${p.bmx},\ \beta_{my}=${p.bmy},\ \beta_{tx}=${p.btx},\ \beta_{ty}=${p.bty}`)+
        F(T`U_x=${f(r.sx/m.f)},\quad U_y=${f(r.sy/m.f)}`))+
        '<p>'+(r.inRange?'各项利用率与 1.0 比较。':'二阶放大超出适用范围，稳定利用率不显示为有限数值。')+'</p>');
    html+=step('08','局部稳定及适用条件','8.4.1、表 3.5.1',F(T`U_{local}=\max(\frac{\mathrm{宽厚比}}{\mathrm{S3限值}})=${f(local.utilization)}`)+
      '<p>'+ (local.ok?'满足本 Demo 采用的 S3 限值。':'超过 S3，需按 8.4.2 等条款另行进行有效截面及屈曲后强度分析。')+'</p><p>本计算未包含扭矩、剪力及连接验算；不覆盖抗震塑性设计、冷弯薄壁型钢及斜翼缘普通工字钢。工字形按非悬臂、端部抗扭约束、自由翘曲条件，Ly 同时作为侧向支承间距。</p><p>依据：<a href="https://ebook.chinabuilding.com.cn/zbooklib/book/detail/show?SiteID=1&amp;bookID=105417" target="_blank" rel="noopener">《钢结构设计标准》GB 50017-2017</a>；计算流程参考用户提供的 MSteel 压弯构件计算书。</p>');
    html+='</div></section>';
    $('report').innerHTML=html;
  }
  function renderMaterial(r) {
    const {m,local}=r;
    materialInfo(m);
    $('materialNote').textContent=m.code+' · '+m.source+' · '+m.product;
    const status=!r.available?'超出本版计算范围 · 需进一步计算':r.passing?(r.needsReview?'承载力数值满足 · 适用条件待复核':'本 Demo 范围内满足'):'本工况不满足';
    $('status').innerHTML='<div class="statusline '+(r.passing&&!r.needsReview?'ok':'ng')+'">'+status+'<small>利用率限值 1.00</small></div>';
    $('checks').innerHTML=r.checks.map(c=>'<div class="check '+(c.value>1?'failed':'')+'"><div class="check-head"><span>'+c.name+'</span><strong>'+(Number.isFinite(c.value)?fmt(c.value,3):'超出范围')+'</strong></div><div class="track"><div class="fill" style="width:'+Math.min(100,c.value*100)+'%"></div></div><small>'+(c.id==='local'?local.label:Number.isFinite(c.stress)?fmt(c.stress,2)+' / '+fmt(m.f,2)+' MPa':'二阶放大失效')+'</small></div>').join('');
    $('warnings').innerHTML=r.warnings.map(w=>'<div class="warning">'+w+'</div>').join('');
    $('report').innerHTML=beamColumnMaterialReport(r,sections[selected].name,Object.entries(dims[selected]).map(([k,v])=>k+' = '+v+' mm').join('，'),$('process').selectedOptions[0].textContent);
  }
  function update(redraw=false) {
    if(redraw)drawSection();
    try {
      const geometry=MullionSections.properties(selected,dims[selected]);
      if(type)render(BeamColumnMaterials.calculate(read()));else renderPending(geometry);
    } catch(e) {
      $('status').textContent=e.message;$('status').className='error';
      $('checks').innerHTML='';$('warnings').innerHTML='';$('report').innerHTML='';
      materialInfo(null);$('materialNote').textContent='请先补全有效输入。';return;
    }
    $('status').className='';
  }
  function acceptDimension(target) {
    const key=target.dataset.dim;
    raw[selected][key]=target.value;
    dims[selected][key]=target.value.trim()===''?NaN:Number(target.value);
  }
  $('inputs').addEventListener('submit',e=>{e.preventDefault();update(true);});
  $('inputs').addEventListener('input',e=>{
    if(e.target.matches('[data-dim]'))acceptDimension(e.target);
    if(['family','grade','product','process'].includes(e.target.id))return;
    if(e.target.type!=='radio')update();
  });
  $('inputs').addEventListener('change',e=>{
    if(e.target.name==='section-type') {processes[family()+':'+selected]=$('process').value;selected=e.target.value;dimensionInputs();}
    if(e.target.id==='family'){materialOptions();processOptions();}
    if(e.target.id==='grade'||e.target.id==='product')productOptions();
    if(e.target.id==='process')processes[family()+':'+selected]=$('process').value;
    if(e.target.matches('[data-dim]')){acceptDimension(e.target);update(true);}else update();
  });
  $('inputs').addEventListener('keydown',e=>{
    if(e.key==='Enter'&&e.target.matches('[data-dim]')){e.preventDefault();acceptDimension(e.target);update(true);}
  });
  $('reset').addEventListener('click',()=>{
    // The button id="reset" masks form.reset in a real browser.
    HTMLFormElement.prototype.reset.call($('inputs'));selected='ibeam';type='i';dims=structuredClone(defaults);raw=structuredClone(defaults);processes={...initialProcesses};
    $('family').value='steel';$('product').value='profile';materialOptions();buildOptions();dimensionInputs();update();
  });
  $('print').addEventListener('click',()=>window.print());
  materialOptions();buildOptions();dimensionInputs();update();
})();

