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
  const defaults={chs:{D:168,t:8},shs:{B:150,t:8},i:{H:100,B:100,tf:8,tw:6}};
  let type='i',dims=JSON.parse(JSON.stringify(defaults)),processes={i:'rolled',chs:'seamless',shs:'welded'};
  const fmt=(n,d=3)=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
  const f=n=>fmt(n,3),F=s=>'<div class="formula">'+tex2html(s)+'</div>';
  const prop=(name,value,unit='')=>'<div class="prop"><span>'+name+'</span><strong>'+value+'</strong><small>'+unit+'</small></div>';
  const names={chs:'圆管',shs:'方管',i:'工字钢'};
  function dimensionInputs() {
    const definitions=type==='i'?[['B','B','top'],['H','H','left'],['tw','tw','bottom-left'],['tf','tf','bottom-right']]:type==='chs'?[['D','D','top'],['t','t','bottom']]:[['B','B','top'],['t','t','bottom']];
    $('dimensionInputs').innerHTML=definitions.map(([key,label,position])=>'<label class="dimension '+position+'">'+label+'<input data-dim="'+key+'" type="number" step="any" min="1" value="'+dims[type][key]+'" aria-label="'+names[type]+' '+label+'（mm）"><small>mm</small></label>').join('');
    const options=type==='i'?[['rolled','轧制'],['welded-flame','焊接 · 焰切边'],['welded-cut','焊接 · 轧制/剪切边']]:type==='chs'?[['seamless','热轧无缝'],['welded','焊接圆管']]:[['welded','焊接箱形']];
    $('process').innerHTML=options.map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join('');
    $('process').value=processes[type];
    $('betaInputs').hidden=type==='chs';
    $('betaNote').textContent=type==='chs'?'圆管按 8.2.4 取同号等端弯矩，βx = βy = 1，β = 1。此工况不使用工字形的四个系数。':'默认均匀弯矩，系数均为 1；其他弯矩分布按 8.2.1 核定。';
    drawSection();
  }
  function drawSection() {
    const d=dims[type],cx=200,cy=126;
    let shape='';
    const line=(x1,y1,x2,y2)=>`<path d="M${x1} ${y1}L${x2} ${y2}"/>`;
    if(Object.values(d).some(v=>!Number.isFinite(v)||v<=0)) { $('sectionSvg').innerHTML='';return; }
    if(type==='chs') {
      const r=66,ri=Math.max(1,r*(1-2*d.t/d.D));
      shape=`<path d="M${cx+r} ${cy}a${r} ${r} 0 1 0 ${-2*r} 0a${r} ${r} 0 1 0 ${2*r} 0 M${cx+ri} ${cy}a${ri} ${ri} 0 1 0 ${-2*ri} 0a${ri} ${ri} 0 1 0 ${2*ri} 0" fill-rule="evenodd"/>`;
    } else if(type==='shs') {
      const b=128,t=Math.min(63,b*d.t/d.B),x=cx-b/2,y=cy-b/2;
      shape=`<path d="M${x} ${y}h${b}v${b}h${-b}z M${x+t} ${y+t}h${b-2*t}v${b-2*t}h${-b+2*t}z" fill-rule="evenodd"/>`;
    } else {
      const scale=Math.min(140/d.H,150/d.B),h=d.H*scale,b=d.B*scale,tf=Math.min(h/2-1,d.tf*scale),tw=Math.min(b-1,d.tw*scale),x=cx-b/2,y=cy-h/2;
      shape=`<path d="M${x} ${y}h${b}v${tf}h${-(b-tw)/2}v${h-2*tf}h${(b-tw)/2}v${tf}h${-b}v${-tf}h${(b-tw)/2}v${-(h-2*tf)}h${-(b-tw)/2}z"/>`;
    }
    $('sectionSvg').innerHTML='<defs><marker id="axisArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#8c9db2"/></marker></defs><g fill="#d4e2f8" stroke="#5279aa" stroke-width="1.5">'+shape+'</g><g fill="none" stroke="#91a4bc" stroke-width="1" stroke-dasharray="4 3" marker-end="url(#axisArrow)">'+line(103,cy,309,cy)+line(cx,204,cx,43)+'</g><g fill="#7187a1" font-size="13" font-family="Georgia,serif"><text x="316" y="131">x</text><text x="208" y="48">y</text></g><circle cx="200" cy="126" r="2.5" fill="#5279aa"/>';
  }
  function read() {
    const p={type,...dims[type],grade:$('grade').value,process:$('process').value};
    for(const key of ['N','Mx','My','Lx','Ly','bmx','bmy','btx','bty'])p[key]=$(key).value.trim()===''?NaN:Number($(key).value);
    // Hidden I/box coefficients never affect the circular tube branch.
    if(type==='chs')p.bmx=p.bmy=p.btx=p.bty=1;
    return p;
  }
  function render(r) {
    const {p,s,m,bx,by,local,ltb}=r;
    $('materialNote').textContent=`f = ${m.f} MPa · fy = ${m.fy} MPa · E = 206,000 MPa（${m.source}，控制厚度 ${s.tmax} mm）`;
    const status=r.passing?(r.needsReview?'承载力验算满足 · 长细比待复核':'本 Demo 范围内满足'):'本工况不满足';
    $('status').innerHTML='<div class="statusline '+(r.passing&&!r.needsReview?'ok':'ng')+'">'+status+'<small>利用率限值 1.00</small></div>';
    $('checks').innerHTML=r.checks.map(c=>'<div class="check '+(c.value>1?'failed':'')+'"><div class="check-head"><span>'+c.name+'</span><strong>'+(Number.isFinite(c.value)?fmt(c.value,3):'超出范围')+'</strong></div><div class="track"><div class="fill" style="width:'+Math.min(100,c.value*100)+'%"></div></div><small>'+(c.id==='local'?local.label+' · 按 S3 限值':Number.isFinite(c.stress)?fmt(c.stress,2)+' / '+m.f+' MPa':'二阶放大失效')+'</small></div>').join('');
    $('warnings').innerHTML=r.warnings.map(w=>'<div class="warning">'+w+'</div>').join('');
    const dimsLabel=Object.entries(dims[type]).map(([k,v])=>k+' = '+v+' mm').join('，');
    let html='<section class="card"><h2>截面与工况 <span>SECTION</span></h2><div class="body"><div class="report-inputs"><strong>'+names[type]+' · '+m.grade+'</strong> · '+$('process').selectedOptions[0].textContent+'<br>'+dimsLabel+'<br>N = '+p.N+' kN，Mx = '+p.Mx+' kN·m，My = '+p.My+' kN·m；Lx = '+p.Lx+' m，Ly = '+p.Ly+' m</div><div class="props" style="margin-top:17px">'+prop('A',fmt(s.A,2),'mm²')+prop('Ix',fmt(s.Ix/1e4,2),'cm⁴')+prop('Iy',fmt(s.Iy/1e4,2),'cm⁴')+prop('f',fmt(m.f,0),'MPa')+prop('Wx',fmt(s.Wx/1e3,2),'cm³')+prop('Wy',fmt(s.Wy/1e3,2),'cm³')+prop('ix',f(s.ix),'mm')+prop('iy',f(s.iy),'mm')+'</div><p class="section-note">几何净截面 = 毛截面；工字形、方管不计圆角，截面性能不等同于含圆角的厂家型材表。</p></div></section>';
    const step=(n,title,ref,content)=>'<section class="step"><h3>'+n+' · '+title+'<span class="ref">'+ref+'</span></h3>'+content+'</section>';
    html+='<section class="card report-card"><h2>计算过程 <span>CALCULATION</span></h2><div class="body">';
    html+=step('01','截面参数与材料','GB 50017-2017 '+m.source,
      F(type==='chs'?T`A=\frac{\pi}{4}[D^2-(D-2t)^2]`:type==='shs'?T`A=B^2-(B-2t)^2`:T`A=2Bt_f+(H-2t_f)t_w`)+
      F(T`i_x=\sqrt{\frac{I_x}{A}}=${f(s.ix)}\ \mathrm{mm},\quad i_y=${f(s.iy)}\ \mathrm{mm}`)+
      F(T`f=${m.f}\ \mathrm{MPa},\quad f_y=${m.fy}\ \mathrm{MPa},\quad \varepsilon_k=\sqrt{\frac{235}{${m.nominal}}}=${f(m.epsilon)}`));
    const table='<div class="table-wrap"><table><thead><tr><th>板件</th><th>宽厚比</th><th>S3 限值</th><th>等级</th></tr></thead><tbody>'+local.rows.map(q=>'<tr><td>'+q.name+'</td><td>'+f(q.ratio)+'</td><td>'+f(q.limit)+'</td><td class="'+(q.level<=3?'oktext':'ngtext')+'">'+(q.level<5?'S'+q.level:'超过 S4')+'</td></tr>').join('')+'</tbody></table></div>';
    html+=step('02','板件等级与塑性发展系数','表 3.5.1、8.1.1、表 8.1.1',table+
      (type==='i'?F(T`\alpha_0=\frac{\sigma_{max}-\sigma_{min}}{\sigma_{max}}=${f(local.alpha)}`):'')+
      F(T`\gamma_x=${f(r.gx)},\quad\gamma_y=${f(r.gy)}`)+
      '<p>'+(!local.ok?'超过 S3，塑性发展系数取 1.0；承载力数值仅作诊断，局部稳定未通过。':type==='shs'?'方管各壁板采用均匀受压限值，未利用弯曲应力梯度放宽。':'截面满足 S3，采用相应截面塑性发展系数。')+'</p>');
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
        F(T`\varphi_{bx}=\varphi_{by}=1.0`)+(type==='shs'?F(T`\eta=0.7`):'<p>圆管的整体稳定采用 8.2.4，不套用工字形的双向线性叠加式。</p>'));
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
  function update() {
    drawSection();
    try {render(SteelBeamColumn.calculate(read()));}
    catch(e) {
      $('status').textContent=e.message;$('status').className='error';
      $('checks').innerHTML='';$('warnings').innerHTML='';$('report').innerHTML='';$('materialNote').textContent='请先补全有效输入。';return;
    }
    $('status').className='';
  }
  $('inputs').addEventListener('submit',e=>{e.preventDefault();update();});
  $('inputs').addEventListener('input',e=>{
    if(e.target.matches('[data-dim]'))dims[type][e.target.dataset.dim]=e.target.value.trim()===''?NaN:Number(e.target.value);
    if(e.target.type!=='radio')update();
  });
  $('inputs').addEventListener('change',e=>{
    if(e.target.name==='section') {processes[type]=$('process').value;type=e.target.value;dimensionInputs();}
    if(e.target.id==='process')processes[type]=e.target.value;
    update();
  });
  $('reset').addEventListener('click',()=>{
    $('inputs').reset();type='i';dims=JSON.parse(JSON.stringify(defaults));processes={i:'rolled',chs:'seamless',shs:'welded'};dimensionInputs();update();
  });
  $('print').addEventListener('click',()=>window.print());
  dimensionInputs();update();
})();

