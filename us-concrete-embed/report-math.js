/* Equations use the same unrounded demands, capacities and governing groups as the engine. */
(function () {
  'use strict';
  const kNPerLbf = 0.0044482216152605;
  const mpaPerPsi = kNPerLbf * 1000 / (25.4 * 25.4);
  const raw = String.raw;
  function n(value, digits = 4) {
    if (value === '' || value == null || !Number.isFinite(Number(value))) return raw`\text{待定}`;
    return String(Number(Number(value).toFixed(digits)));
  }
  function heading(doc, parent, label) {
    const part = doc.createElement('div');
    part.className = 'er-calculation';
    const title = doc.createElement('h4');
    title.textContent = label;
    part.append(title);
    parent.append(part);
    return part;
  }
  function eq(doc, part, latex) {
    const line = doc.createElement('div');
    line.className = 'er-equation';
    doc.defaultView.katex.render(latex, line, {displayMode:true, throwOnError:true, trust:false});
    part.append(line);
  }
  const times = raw`\cdot`;
  const relation = (a,b) => a <= b + 1e-12 ? raw`\le` : '>';
  function fraction(a,b) { return raw`\frac{`+n(a)+'}{'+n(b)+'}'; }
  function anchor(doc, parent, p, result) {
    const t = result.trace, dist = result.distribution, g = t.tensionGroups[dist.activeGroup];
    const v = t.shearFaces.find(face=>face.face===t.controllingFace);
    const checks = Object.fromEntries(result.checks.map(check=>[check.id,check]));
    const inch = mm=>n(mm/25.4), psi = mpa=>n(mpa/mpaPerPsi,2);
    const fc = psi(p.fc), psiA = t.psiA;
    const units = raw`\quad(\mathrm{kN})`;
    const force = (id, symbol) => {
      const item = checks[id];
      eq(doc,part,symbol+'='+fraction(item.demand,item.capacity)+'='+n(item.ratio)+relation(item.ratio,1)+'1');
    };
    let part = heading(doc,parent,'荷载分配 · 单根与锚群');
    if (p.mode==='elastic') {
      const sumY2 = dist.rows.reduce((sum,r)=>sum+r.y*r.y,0);
      const r = dist.rows.reduce((a,b)=>a.tension>=b.tension?a:b);
      eq(doc,part,raw`T_j=\frac{N_u}{n_y}+\frac{1000M_xy_j}{\sum_j y_j^2}`);
      eq(doc,part,'T_{j,\\max}='+fraction(p.nu,p.ny)+'+'+raw`\frac{1000(`+n(p.mx)+')('+n(r.y)+')}{'+n(sumY2)+'}='+n(r.tension)+units);
    } else {
      eq(doc,part,'C=T_++T_- -N_u='+n(p.tPlus)+'+'+n(p.tMinus)+'-('+n(p.nu)+')='+n(dist.compression)+units);
      if (dist.yc!=null) eq(doc,part,raw`y_C=\frac{(T_+-T_-)y_{\max}-1000M_x}{C}=`+n(dist.yc)+raw`~\mathrm{mm}`);
    }
    eq(doc,part,raw`N_{ua,\max}=\frac{\max T_j}{n_x}=`+n(dist.maxT)+raw`~\mathrm{kN},\quad N_{ua,g}=\sum T_j=`+n(dist.total)+units);
    part=heading(doc,parent,'钢材受拉与受剪 · §§17.6.1、17.7.1');
    const alpha = t.alphaV;
    eq(doc,part,raw`f^*_{uta}=\min(f_{uta},1.9f_{ya},125000~\mathrm{psi})=`+n(t.fut)+raw`~\mathrm{MPa}`);
    eq(doc,part,raw`\phi N_{sa}=\phi_N A_{se,N}f^*_{uta}/1000=`+[t.phiN,t.AseN,t.fut].map(x=>n(x)).join(times)+'/1000='+n(t.steelN)+units);
    eq(doc,part,raw`\phi V_{sa}=\phi_V\alpha A_{se,V}f^*_{uta}/1000=`+[t.phiV,alpha,t.AseV,t.fut].map(x=>n(x)).join(times)+'/1000='+n(t.steelV)+units);
    force('steelN',raw`\eta_{Ns}`); force('steelV',raw`\eta_{Vs}`);
    part=heading(doc,parent,'单锚拔出及侧面爆裂 · §§17.6.3、17.6.4');
    const factors = [t.phiConcreteN,psiA];
    if (p.anchorType==='hooked') {
      eq(doc,part,raw`e_{h,\mathrm{eff}}=\min(e_h,4.5d_a)=`+n(t.eh)+raw`~\mathrm{mm}`);
      eq(doc,part,raw`\phi N_{pn}=\phi_N\psi_a(0.9f'_c e_{h,\mathrm{eff}}d_a)/1000`);
      eq(doc,part,'='+[...factors,0.9,p.fc,t.eh,p.d].map(x=>n(x)).join(times)+'/1000='+n(t.pullout)+units);
    } else {
      eq(doc,part,raw`A_{brg}=`+(p.anchorType==='headed'?raw`\pi(d_h^2-d_a^2)/4=`:'')+n(t.Abrg)+raw`~\mathrm{mm^2}`);
      eq(doc,part,raw`\phi N_{pn}=\phi_N\psi_a(8A_{brg}f'_c)/1000=`+[...factors,8,t.Abrg,p.fc].map(x=>n(x)).join(times)+'/1000='+n(t.pullout)+units);
    }
    force('pullout',raw`\eta_{Np}`);
    if(checks.sideface?.applicable) {
      const f=t.sideControl;
      eq(doc,part,raw`N_{sb}=\psi_a\,160\,c_{a1}\sqrt{A_{brg}}\lambda_a\sqrt{f'_c}\quad(\mathrm{lbf})`);
      eq(doc,part,'N_{sb}='+n(psiA)+times+'160'+times+inch(f.ca)+raw`\sqrt{`+n(t.Abrg/25.4**2)+raw`}\sqrt{`+fc+'}='+n(f.base/kNPerLbf,1)+raw`~\mathrm{lbf}`);
      eq(doc,part,(f.count>1?raw`\phi N_{sbg}=\phi(1+s/(6c_{a1}))N_{sb}`:raw`\phi N_{sb,c}=\phi k_{\rm corner}N_{sb}`)+'='+[t.phiConcreteN,f.factor,f.base].map(x=>n(x)).join(times)+'='+n(checks.sideface.capacity)+units);
      force('sideface',raw`\eta_{Nsb}`);
      if(t.sideSingle) {
        const s=t.sideSingle;
        eq(doc,part,raw`\phi N_{sb,i}=\phi_N k_{\rm corner}\psi_a\,160c_{a1,i}\sqrt{A_{brg}f'_c}\quad(\mathrm{lbf})`);
        eq(doc,part,raw`c_{a1,i}=`+inch(s.ca)+raw`~\mathrm{in},\quad k_{\rm corner}=`+n(s.corner)+raw`,\quad \phi N_{sb,i}=`+n(s.design)+units);
        force('sidefaceSingle',raw`\eta_{Nsb,i}`);
      }
    }
    part=heading(doc,parent,'受拉锥体破坏 · §17.6.2');
    const coeff=g.deep?16:24, power=g.deep?'5/3':'1.5';
    eq(doc,part,'N_b='+coeff+raw`\lambda_a\sqrt{f'_c}\,h_e^{`+power+'}='+coeff+raw`\sqrt{`+fc+'}('+inch(g.he)+')^{'+power+'}='+n(g.Nb/kNPerLbf,1)+raw`~\mathrm{lbf}=`+n(g.Nb)+units);
    eq(doc,part,raw`\phi N_{cbg}=\phi_N\frac{A_{Nc}}{A_{Nco}}\psi_a\psi_{ec,N}\psi_{ed,N}\psi_{c,N}\psi_{cp,N}\psi_{cm,N}N_b`);
    eq(doc,part,'='+n(t.phiConcreteN)+times+fraction(g.ANc,g.ANco)+times+[psiA,t.psiEc,g.psiEd,1,1,t.psiCm,g.Nb].map(x=>n(x)).join(times)+'='+n(t.cone)+units);
    force('breakoutN',raw`\eta_{Ncb}`);
    part=heading(doc,parent,'受剪边缘破坏 · §17.7.2');
    eq(doc,part,raw`V_b=\min\bigl[7(\ell_e/d_a)^{0.2}\sqrt{d_a},\,9\bigr]\lambda_a\sqrt{f'_c}\,c_{a1}^{1.5}`);
    eq(doc,part,raw`V_b=\min\bigl[7(`+inch(v.le)+'/'+inch(p.d)+raw`)^{0.2}\sqrt{`+inch(p.d)+raw`},9\bigr]\sqrt{`+fc+'}('+inch(v.ca)+')^{1.5}='+n(v.Vb/kNPerLbf,1)+raw`~\mathrm{lbf}`);
    eq(doc,part,raw`\phi V_{cbg}=\phi_V\,k_{dir}\frac{A_{Vc}}{A_{Vco}}\psi_a\psi_{ec,V}\psi_{ed,V}\psi_{c,V}\psi_{h,V}V_b`);
    eq(doc,part,'='+[t.phiConcreteV,v.direction].map(x=>n(x)).join(times)+times+fraction(v.AVc,v.AVco)+times+[psiA,1,v.psied,1,v.psih,v.Vb].map(x=>n(x)).join(times)+'='+n(v.design)+units);
    force('breakoutV',raw`\eta_{Vcb}`);
    part=heading(doc,parent,'群锚混凝土剪撬 · §17.7.3');
    eq(doc,part,raw`\phi V_{cpg}=\phi_V k_{cp}N_{cpg}=`+[t.phiConcreteV,t.kcp,t.tensionGroups[t.controllingPry].nominal].map(x=>n(x)).join(times)+'='+n(t.pryout)+units);
    force('pryout',raw`\eta_{Vcp}`);
    part=heading(doc,parent,'拉剪相互作用 · §§17.8.3、17.8.4');
    const c=t.interaction.concrete, s=t.interaction.steel;
    const row=doc.createElement('p');
    row.textContent='钢材控制锚位于自 −Y 起第 '+s.row+' 排（y = '+n(s.y)+' mm）。该锚的拉力 '+n(s.demandN)+' kN，剪力 '+n(s.demandV)+' kN。';
    part.append(row);
    eq(doc,part,raw`I_c=\left(\frac{N_{ua,g}}{\phi N_{n,cg}}\right)^{5/3}+\left(\frac{V_{ua,g}}{\phi V_{n,cg}}\right)^{5/3}`);
    eq(doc,part,'I_c='+raw`\left(`+fraction(c.demandN,c.capacityN)+raw`\right)^{5/3}+\left(`+fraction(c.demandV,c.capacityV)+raw`\right)^{5/3}=`+n(c.ratio)+relation(c.ratio,1)+'1');
    eq(doc,part,raw`I_s=\max_i\left[\left(\frac{N_{ua,i}}{\phi N_{sa}}\right)^2+\left(\frac{V_{ua,i}}{\phi V_{sa}}\right)^2\right]`);
    eq(doc,part,'I_s='+raw`\left(`+fraction(s.demandN,t.steelN)+raw`\right)^2+\left(`+fraction(s.demandV,t.steelV)+raw`\right)^2=`+n(s.ratio)+relation(s.ratio,1)+'1');
  }
  function welded(doc, parent, p) {
    if (![p.endBarDiameter,p.d,p.endBarLength].every(x=>Number.isFinite(x)&&x>0) || ![1,2].includes(p.endBarCount)) return;
    const part=heading(doc,parent,'短筋构造 · GB/T 50010 §8.3.3');
    const factor=p.endBarCount===1?5:3;
    eq(doc,part,'d_s='+n(p.endBarDiameter)+raw`~\mathrm{mm},\quad d=`+n(p.d)+raw`~\mathrm{mm}`);
    eq(doc,part,raw`L_{\min}=`+factor+'d='+factor+times+n(p.d)+'='+n(factor*p.d)+raw`~\mathrm{mm},\quad L_s=`+n(p.endBarLength)+raw`~\mathrm{mm}`);
  }
  function plateDetail(doc,parent,p) {
    if (![p.plateThickness,p.d].every(v=>Number.isFinite(v)&&v>0)) return;
    const part=heading(doc,parent,'锚板厚度与局部传力');
    const note=doc.createElement('p');
    note.textContent='板带验算使用板带有效宽度和该板带的设计弯矩。下列尺寸仅对应 §17.7.2.2.2(a) 连续焊接锚件的增强剪切公式，其余适用条件见计算书末节。';
    part.append(note);
    const min=Math.max(0.5*p.d,9.525);
    eq(doc,part,raw`t_{p,\rm actual}=`+n(p.plateThickness)+raw`~\mathrm{mm},\quad t_{\rm (a)}=\max(0.5d_a,9.525~\mathrm{mm})=`+n(min)+raw`~\mathrm{mm}`);
  }
  function supplement(doc, parent, id, p, result) {
    if (!result || result.status==='invalid' || !result.checks.length) return;
    const part=heading(doc,parent,'公式代入');
    const item=result.checks[0];
    if(id==='plate') {
      eq(doc,part,raw`S=bt^2/6=`+n(p.b)+times+n(p.t)+'^2/6='+n(p.b*p.t*p.t/6)+raw`~\mathrm{mm^3}`);
      eq(doc,part,raw`t_{\rm req}=\sqrt{\frac{6|M_u|10^6}{0.90F_y b}}=\sqrt{\frac{6(`+n(p.Mu)+raw`)10^6}{0.90(`+n(p.Fy)+')('+n(p.b)+')}}='+n(result.requiredThickness)+raw`~\mathrm{mm}`);
      eq(doc,part,raw`t_{\rm req}=`+n(result.requiredThickness)+relation(result.requiredThickness,Number(p.t))+n(p.t)+raw`~\mathrm{mm}`);
    } else if(id==='weld') {
      eq(doc,part,raw`\phi r_n=(0.75)(0.60)F_{EXX}w/\sqrt2=(0.75)(0.60)(`+n(p.Fexx)+')('+n(p.w)+raw`)/\sqrt2=`+n(item.capacity)+raw`~\mathrm{N/mm}`);
      eq(doc,part,raw`q_{u,\rm dir}=\frac{1000V_u}{nL}=\frac{1000(`+n(p.V)+')}{('+n(p.n)+')('+n(p.L)+')}='+n(1000*p.V/(p.n*p.L))+raw`~\mathrm{N/mm}`);
    } else if(id==='bearing') {
      eq(doc,part,raw`\phi B_n=0.65(0.85)f'_c A_1/1000=0.65(0.85)(`+n(p.fc)+')('+n(p.A1)+')/1000='+n(item.capacity)+raw`~\mathrm{kN}`);
    } else if(id==='hook' && result.hook) {
      const h=result.hook;
      eq(doc,part,raw`\ell_{dh,0}=\frac{f_y\psi_e\psi_s\psi_{cc}\psi_r d_b}{50\lambda\sqrt{f'_c}}\quad(\mathrm{in,psi})`);
      eq(doc,part,raw`\ell_{dh,0}=\frac{`+[h.fy,h.psiE,h.psiS,h.psiCC,h.psiR,h.db].map(x=>n(x)).join(times)+'}{'+[h.coefficient,h.lambda].map(x=>n(x)).join(times)+raw`\sqrt{`+n(h.effectiveFc)+'}}='+n(h.calculated)+raw`~\mathrm{mm}`);
      eq(doc,part,raw`\ell_{dh}=\max(\ell_{dh,0},8d_b,152.4~\mathrm{mm})=`+n(h.required)+raw`~\mathrm{mm}`);
    }
    for(const check of result.checks) {
      eq(doc,part,raw`\eta=`+fraction(check.demand,check.capacity)+'='+n(check.ratio)+relation(check.ratio,1)+'1');
    }
  }
  window.EmbedReportMath=Object.freeze({anchor,welded,supplement,plateDetail});
})();
