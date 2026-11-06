/* Material-specific report. tex2html is provided by the demo formula renderer. */
(function(root){
  'use strict';
  root.beamColumnMaterialReport=function(r,sectionName,dimensions,processName){
    const {p,s,m,bx,by,local,ltb}=r,ss=m.family==='stainless',T=String.raw;
    const n=(x,d=3)=>typeof x==='number'&&Number.isFinite(x)?x.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
    const F=x=>'<div class="formula">'+tex2html(x)+'</div>';
    const step=(title,ref,body)=>'<section class="step"><h3>'+title+'<span class="ref">'+m.code+' '+ref+'</span></h3>'+body+'</section>';
    const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    let html='<section class="card"><h2>截面与工况 <span>SECTION</span></h2><div class="body"><div class="report-inputs"><strong>'+esc(sectionName)+' · '+esc(m.name)+'</strong> · '+esc(processName)+'<br>'+esc(dimensions)+'<br>N = '+p.N+' kN，Mx = '+p.Mx+' kN·m，My = '+p.My+' kN·m；Lx = '+p.Lx+' m，Ly = '+p.Ly+' m</div>'+
      F(T`A=${n(s.A)}\ \mathrm{mm^2},\quad I_x=${n(s.Ix)}\ \mathrm{mm^4},\quad I_y=${n(s.Iy)}\ \mathrm{mm^4}`)+
      F(T`W_x=${n(s.Wx)}\ \mathrm{mm^3},\quad W_y=${n(s.Wy)}\ \mathrm{mm^3}`)+
      '<p class="section-note">无孔洞、无截面削弱；工字形和箱型忽略圆角。材料数据按所选产品及供货状态取值。</p></div></section>';
    html+='<section class="card report-card"><h2>计算过程 <span>CALCULATION</span></h2><div class="body">';
    html+=step('01 · 材料与设计依据',m.source,
      F(T`f=${n(m.f)}\ \mathrm{MPa},\quad f_{0.2}=${m.fy}\ \mathrm{MPa},\quad E=${n(m.E,0)}\ \mathrm{MPa}`)+
      '<p>'+esc(m.product)+'。'+(ss?'采用规程的名义屈服强度与专用稳定曲线，不采用碳钢 a～d 曲线。':(m.hardening==='weak'?'弱硬化（T6）':'强硬化（T5 / H112）')+'；类别按 2.1.8、2.1.9。设计强度取表值与 f0.2 / 1.2 的较小值。')+'</p>'+
      (ss?'':F(T`f=\min(${m.fTable},\frac{${m.fy}}{1.2})=${n(m.f)}\ \mathrm{MPa}`)));
    html+=step('02 · 全截面有效条件',ss?'4.3.3、4.3.5、4.3.6':'5.2.1',
      '<div class="table-wrap"><table><thead><tr><th>板件</th><th>宽厚 / 径厚比</th><th>采用限值</th><th>比值</th></tr></thead><tbody>'+local.rows.map(v=>'<tr><td>'+v.name+'</td><td>'+n(v.ratio)+'</td><td>'+n(v.limit)+'</td><td>'+n(v.utilization)+'</td></tr>').join('')+'</tbody></table></div>'+
      '<p>平板保守采用均匀受压限值，未利用弯曲应力梯度放宽。'+(local.ok?'符合本版全截面有效条件，Ae = A、Wex = Wx、Wey = Wy。':'需进一步计算有效截面；本页停止输出承载力数值。')+'</p>'+
      F(T`\gamma_x=${r.gx},\quad\gamma_y=${r.gy}`)+'<p>'+(ss?'不锈钢采用弹性截面模量，γx = γy = 1。':'塑性发展系数按表 6.1.1；本版铝合金限无焊接热影响区，ηhaz = ηe = 1。')+'</p>');
    const axis=(a,v)=>F(T`\lambda_${a}=\frac{L_${a}}{i_${a}}=${n(v.lambda)},\quad \bar\lambda_${a}=\frac{\lambda_${a}}{\pi}\sqrt{\frac{f_{0.2}}{E}}=${n(v.ln)},\quad\varphi_${a}=${n(v.phi)}`)+
      '<p>'+a+' 轴：'+(ss?'αc = '+v.coefficients[0]+'，λc = '+v.coefficients[1]:'附录 B 查表指标 λ√(f0.2/240) = '+n(v.index)+(v.outOfTable?'，超出表格范围':'，相邻整数行线性插值'))+'。</p>';
    html+=step('03 · 双向受压稳定系数',ss?'5.2.2、表 5.2.2':'7.2.1、7.2.2、附录 B',
      (ss?F(T`q=\frac{1}{2}[1+\alpha_c(\bar\lambda-\bar\lambda_c)+\bar\lambda^2],\quad\varphi=\frac{1}{q+\sqrt{q^2-\bar\lambda^2}}\leq1`):'<p>'+(m.hardening==='weak'?'表 B-1 弱硬化':'表 B-2 强硬化')+'稳定系数。超出表格上限 150 不作外推。</p>')+axis('x',bx)+axis('y',by));
    html+=step('04 · 受弯整体稳定',ss?'5.3.4、5.5.6、附录 A':'附录 C、8.2.2',
      (p.type==='i'?
        F(T`I_t=${n(ltb.J)}\ \mathrm{mm^4},\quad I_\omega=${n(ltb.Iw)}\ \mathrm{mm^6}`)+
        F(ss?T`M_{cr,x}=\frac{\pi^2EI_y}{L_y^2}\sqrt{\frac{I_\omega}{I_y}+0.039\frac{I_tL_y^2}{I_y}}`:T`M_{cr,x}=\frac{\pi^2EI_y}{L_y^2}\sqrt{\frac{I_\omega}{I_y}+\frac{GI_tL_y^2}{\pi^2EI_y}}`)+
        F(T`M_{cr,x}=${n(ltb.x.Mcr/1e6)}\ \mathrm{kN\cdot m},\quad M_{cr,y}=${n(ltb.y.Mcr/1e6)}\ \mathrm{kN\cdot m}`)+
        F(ss?T`\bar\lambda_b=\sqrt{\frac{Wf_{0.2}}{M_{cr}}}`:T`\bar\lambda_b=\sqrt{\frac{Wf}{M_{cr}}}`)+
        F(T`q_b=\frac{1}{2}[1+\alpha_b(\bar\lambda_b-\lambda_{b0})+\bar\lambda_b^2],\quad\varphi_b=\frac{1}{q_b+\sqrt{q_b^2-\bar\lambda_b^2}}\leq1`)+
        '<p>αb = '+ltb.x.coefficients[0]+'，λb0 = '+ltb.x.coefficients[1]+'；均匀弯矩，β₁ = 1，端部抗扭约束、自由翘曲，荷载过弯心。y 向按相同简支式交换两主轴和对应长度计算，未采用弱轴免验算简化；Lx、Ly 同时为对应的侧向约束间距。</p>':'<p>闭口截面按压弯条文取 φbx = φby = 1。</p>')+
      F(T`\varphi_{bx}=${n(ltb.x.phi)},\quad\varphi_{by}=${n(ltb.y.phi)},\quad\eta=${r.eta}`));
    html+=step('05 · 欧拉力与二阶放大',ss?'5.5.2、5.5.6':'8.2.1、8.2.2',
      F(T`N_{Ex}=\frac{\pi^2EI_x}{L_x^2}=${n(r.NEx/1000)}\ \mathrm{kN},\quad N'_{Ex}=\frac{N_{Ex}}{${r.divisor}}=${n(r.Npx/1000)}\ \mathrm{kN}`)+
      F(T`N_{Ey}=${n(r.NEy/1000)}\ \mathrm{kN},\quad N'_{Ey}=${n(r.Npy/1000)}\ \mathrm{kN}`)+
      F(ss?T`d_x=1-\varphi_x\frac{N}{N'_{Ex}}=${n(r.dx)},\quad d_y=1-\varphi_y\frac{N}{N'_{Ey}}=${n(r.dy)}`:T`\eta_1=${r.ax},\quad d_x=1-\eta_1\frac{N}{N'_{Ex}}=${n(r.dx)},\quad d_y=${n(r.dy)}`));
    html+=step('06 · 强度与双向压弯稳定',ss?'5.5.1、5.5.6':'8.1.1、8.2.2',
      F(T`U_\sigma=\frac{N}{Af}+\frac{|M_x|}{\gamma_xW_xf}+\frac{|M_y|}{\gamma_yW_yf}`)+
      F(T`U_x=\frac{N}{\varphi_xAf}+\frac{\beta_{mx}|M_x|}{\gamma_xW_xd_xf}+\frac{\eta|M_y|}{\varphi_{by}W_yf}`)+
      F(T`U_y=\frac{N}{\varphi_yAf}+\frac{\eta|M_x|}{\varphi_{bx}W_xf}+\frac{\beta_{my}|M_y|}{\gamma_yW_yd_yf}`)+
      F(T`\beta_{mx}=${p.bmx},\quad\beta_{my}=${p.bmy}`)+
      (r.available?F(T`U_\sigma=${n(r.strength/m.f)},\quad U_x=${n(r.sx/m.f)},\quad U_y=${n(r.sy/m.f)}`):'<p class="ngtext">适用条件未满足，承载力利用率暂不输出。</p>')+
      '<p>圆管同样按双向线性相加作保守验算，不调用碳钢圆管专用公式。输入为设计内力，弯矩取绝对值，限值为 1.0。</p>');
    html+='<p class="section-note">范围：等截面、双轴对称、非悬臂静力构件。未计算孔洞、剪力、扭矩、疲劳、连接和结构体系整体稳定；局部屈曲后的有效截面及铝合金焊接热影响区计算尚未接入。'+
      '<a href="'+(ss?'https://ebook.chinabuilding.com.cn/zbooklib/book/detail/show?SiteID=1&amp;bookID=60615':'https://ebook.chinabuilding.com.cn/zbooklib/book/detail/show?SiteID=1&amp;bookID=56295')+'" target="_blank" rel="noopener">规范出版信息</a> · <a href="BEAM_COLUMN_MATERIALS.md">方法与适用范围</a></p></div></section>';
    return html;
  };
})(typeof globalThis!=='undefined'?globalThis:this);
