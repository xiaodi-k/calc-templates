/* Printable calculation record and the two published comparison cases. */
(function () {
  'use strict';
  const codeUrl = 'https://www.concrete.org/store/productdetail.aspx?ItemID=318U25';
  const paperUrl = 'https://www.doc88.com/p-69037866447199.html';
  const number = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString('zh-CN', {maximumFractionDigits: digits}) : '—';
  function el(doc, tag, text, className) {
    const element = doc.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function section(doc, title) {
    const node = el(doc, 'section');
    node.append(el(doc, 'h3', title));
    return node;
  }
  function table(doc, columns, rows) {
    const scroll = el(doc, 'div', undefined, 'er-scroll');
    const t = el(doc, 'table');
    const header = t.createTHead().insertRow();
    for (const name of columns) {
      const th = el(doc, 'th', name);
      th.scope = 'col';
      header.append(th);
    }
    const body = t.createTBody();
    for (const values of rows) {
      const row = body.insertRow();
      for (const value of values) row.append(el(doc, 'td', value));
    }
    scroll.append(t);
    return scroll;
  }
  function link(doc, label, url) {
    const a = el(doc, 'a', label);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }
  function show(doc, title, subtitle) {
    const prior = doc.querySelector('#embed-record');
    if (prior) prior.close();
    const panel = el(doc, 'dialog', undefined, 'er-dialog');
    panel.id = 'embed-record';
    panel.setAttribute('aria-labelledby', 'embed-record-title');
    const bar = el(doc, 'header', undefined, 'er-head');
    const intro = el(doc, 'div');
    const heading = el(doc, 'h2', title);
    heading.id = 'embed-record-title';
    intro.append(heading, el(doc, 'p', subtitle));
    const actions = el(doc, 'div', undefined, 'er-actions');
    const print = el(doc, 'button', '打印 / 存为 PDF');
    const close = el(doc, 'button', '返回模型');
    print.type = close.type = 'button';
    print.addEventListener('click', () => doc.defaultView.print());
    close.addEventListener('click', () => panel.close());
    actions.append(print, close);
    bar.append(intro, actions);
    const content = el(doc, 'div', undefined, 'er-body');
    panel.append(bar, content);
    const win = doc.defaultView;
    const expand = () => panel.querySelectorAll('details:not([open])').forEach(item => {
      item.dataset.printOpened = '';
      item.open = true;
    });
    const restore = () => panel.querySelectorAll('[data-print-opened]').forEach(item => {
      item.open = false;
      delete item.dataset.printOpened;
    });
    win.addEventListener('beforeprint', expand);
    win.addEventListener('afterprint', restore);
    panel.addEventListener('close', () => {
      win.removeEventListener('beforeprint', expand);
      win.removeEventListener('afterprint', restore);
      panel.remove();
      if (!doc.querySelector('#embed-record')) doc.body.classList.remove('has-embed-record');
    });
    doc.body.append(panel);
    doc.body.classList.add('has-embed-record');
    panel.showModal();
    close.focus();
    return content;
  }
  function report(doc, params, current, context = {}) {
    const cases = context.cases?.length ? context.cases : [params];
    const active = context.activeIndex ?? 0;
    const content = show(doc, '美标混凝土埋件计算书', (context.name || '预埋件节点') + ' · ACI CODE-318-25');
    const model = section(doc, '节点与荷载约定');
    model.append(el(doc, 'p', '开裂普通重混凝土，非冗余连接，无补充配筋。矩形规则锚群焊于同一刚性锚板。N 向外为正，正 Mx 使 +Y 排受拉。Vy 沿 Y 轴、通过锚群形心，按有效传力焊缝将全剪力分配至背排。输入值为锚板传力面处的同一强度组合设计内力。'));
    const anchors = {headed:'焊接有头栓钉',hooked:'L 形锚栓',headedBolt:'端部螺母锚栓',weldedRebar:'端部纵向附焊短筋',rebar:'带肋弯钩钢筋'};
    const anchor = anchors[params.anchorType] || '待核锚型';
    const ends = {
      hooked:['弯钩有效伸出',number(params.eh)+' mm'],
      headed:['钉头直径',number(params.dh)+' mm'],
      headedBolt:['螺母对边 / 净承压面积',number(params.dh)+' mm / '+number(params.bearingArea)+' mm²'],
      weldedRebar:['附焊短筋',number(params.endBarCount)+' 根 × φ'+number(params.endBarDiameter)+' × '+number(params.endBarLength)+' mm'],
      rebar:['端部形式','带肋钢筋标准弯钩']
    };
    model.append(table(doc, ['参数','项目输入'], [
      ['锚型与布置', anchor+' · X 向 '+number(params.nx)+' 列 × Y 向 '+number(params.ny)+' 排'],
      ['锚板宽 × 长 × 实厚 / 混凝土厚度',[params.plateX,params.plateY,params.plateThickness].map(v=>number(v)).join(' × ')+' mm / '+number(params.h)+' mm'],
      ['杆径 / 有效埋深',number(params.d)+' / '+number(params.hef)+' mm'],
      ['锚距 sx / sy', number(params.sx)+' / '+number(params.sy)+' mm'],
      ['混凝土边距（左、右、下、上）',[params.left,params.right,params.bottom,params.top].map(v=>number(v)).join(' / ')+' mm'],
      ends[params.anchorType] || ['端部尺寸','待确认'],
      ['混凝土 f′c / 锚材 fy / fu',[params.fc,params.fy,params.fu].map(v=>number(v)).join(' / ')+' MPa']
    ]));
    model.append(el(doc,'p','主表采用 ACI CODE-318-25（美国惯用单位版）。输入以 mm、MPa、kN 表示；含经验系数的基本强度公式按 in、psi、lbf 代入，再换算为 kN。各式显示值经舍入，判定使用未舍入值。'));
    if(['hooked','headed','headedBolt'].includes(params.anchorType)) window.EmbedReportMath.plateDetail(doc,model,params);
    content.append(model);
    const results = context.results || cases.map((c, j) => j===active ? current : window.EmbedEngine.calculate({...params,...c}));
    const summary = section(doc,'各荷载组合');
    summary.append(table(doc,['工况','Nu (kN)','Mx (kN·m)','Vy (kN)','控制利用率','锚固结论'],
      cases.map((c,j)=>[c.name||'工况 '+(j+1),number(c.nu),number(c.mx),number(c.vy),number(results[j]?.utilization,3),
        results[j]?.ok ? (results[j].status==='pass'?'满足':'超限') : results[j]?.status==='special'?'仅构造核对':'待核对'])));
    content.append(summary);
    cases.forEach((c, j) => {
      const result = results[j];
      const group = section(doc, (c.name||'工况 '+(j+1))+' · 分项验算');
      if (!result?.ok) {
        if(result?.specialChecks?.length) {
          const states={pass:'构造满足',fail:'构造不满足',review:'须专项核定'};
          group.append(table(doc,['构造项目','实设','要求','结果','依据'],result.specialChecks.map(k=>[
            k.label,k.actual,k.required,states[k.status]||k.status,k.clause
          ])));
        }
        group.append(el(doc,'p',(result?.errors||['请核对输入']).join('；'),'er-warning'));
        if (params.anchorType==='weldedRebar') window.EmbedReportMath.welded(doc,group,params);
      } else {
        group.append(el(doc,'p','受拉控制比 '+number(result.etaN,3)+'，受剪控制比 '+number(result.etaV,3)+'。混凝土锚群和最不利单根锚杆分别按式 (17.8.3) 和 (17.8.4) 校核。'));
        group.append(table(doc,['验算项目','设计需求','设计承载力 / 限值','利用率','依据'],
          result.checks.map(k=>[k.label,k.applicable===false?'—':number(k.demand,3)+(k.unit==='kN'?' kN':''),
            k.applicable===false?'—':number(k.capacity,3)+(k.unit==='kN'?' kN':''),k.applicable===false?'未触发':number(k.ratio,3),k.clause])));
        if (result.distribution?.rows?.length) {
          const rows = el(doc,'details');
          rows.append(el(doc,'summary','各排锚件的拉力分配'),table(doc,['排中心 y (mm)','本排拉力合计 (kN)','每根锚件拉力 (kN)'],
            result.distribution.rows.map(r=>[number(r.y),number(r.tension,3),number(r.perAnchor,3)])));
          group.append(rows);
        }
        window.EmbedReportMath.anchor(doc,group,{...params,...c},result);
        const explain = el(doc,'details');
        explain.append(el(doc,'summary','投影面积与各自由边参数'));
        const trace = result.trace;
        const groupN = trace.tensionGroups[result.distribution.activeGroup];
        explain.append(table(doc,['受拉参数','代入值'],[
          ['受拉 / 受剪有效面积 Ase',number(trace.AseN)+' / '+number(trace.AseV)+' mm²'],
          ['钢材设计采用的抗拉强度',number(trace.fut)+' MPa'],
          ['φ 混凝土拉 / 剪，ψa',[trace.phiConcreteN,trace.phiConcreteV,trace.psiA].map(v=>number(v)).join(' / ')],
          ['受拉锚群投影 ANc / ANco',number(groupN.ANc)+' / '+number(groupN.ANco)+' mm²'],
          ['受拉基本强度 Nb / 计算埋深',number(groupN.Nb)+' kN / '+number(groupN.he)+' mm'],
          ['偏心 e′N / ψec,N / ψed,N',number(result.distribution.eccN)+' mm / '+number(trace.psiEc,3)+' / '+number(groupN.psiEd,3)],
          ['剪撬系数 kcp',number(trace.kcp)]
        ]));
        const edges={top:'上边（+Y）',bottom:'下边（−Y）',left:'左边（−X）',right:'右边（+X）'};
        explain.append(table(doc,['受剪自由边','计算边距 (mm)','AVc / AVco','基本 Vb (kN)','φVcbg (kN)'],
          trace.shearFaces.map(f=>[edges[f.face]+(f.face===trace.controllingFace?' · 控制':''),number(f.ca),
            number(f.AVc/f.AVco,3),number(f.Vb),number(f.design)])));
        group.append(explain);
      }
      content.append(group);
    });
    if (window.EmbedSupplement?.appendRecord) {
      window.EmbedSupplement.appendRecord(doc,content,window.EmbedSupplement.snapshot(doc));
    }
    const limits = section(doc, '使用范围');
    limits.append(el(doc,'p','锚板实厚须根据节点传力和板弯曲确定。采用 §17.7.2.2.2 连续焊接锚件的剪切增强式时，连接钢板厚度条件为 t ≥ max(0.5dₐ, 3/8 in)，还须同时满足锚距、角部钢筋和受剪排条件。本工具采用一般剪切公式，锚板另按输入的板带弯矩检算。'),
      el(doc,'p','钢筋锚固参见 §17.1.7、§17.1.8 和第 25 章。附焊短筋构造依据 GB/T 50010-2010（2024 年版）表 8.3.3、图 8.3.3(c)、(d) 和 §8.3.4。项目所在地、当地采纳的版本、焊缝、主体传力和地震条件须由项目设计人核定。'),
      link(doc,'ACI CODE-318-25 · 官方出版信息',codeUrl));
    content.append(limits);
  }
  function paper(doc) {
    const content=show(doc,'论文算例对照','王蔚、张广杰 · 《中美规范混凝土预埋件设计对比分析》 · 2016');
    const explanation=section(doc,'为什么同一节点会有两种结果？');
    explanation.append(el(doc,'p','论文讨论越南某港口皮带机头架基础。M-1 采用 3 × 3 根直径 16 mm 的 L 形锚筋，作者以梁纵筋和箍筋约束为由排除了混凝土受拉锥破与剪切边缘破坏。是否能建立这条配筋传力路径，直接影响结论。'));
    const cases=window.EmbedEngine.paperCases();
    explanation.append(table(doc,['论文表 1','M-1','M-2'],[
      ['设计拉力 Nu (kN)',...cases.map(c=>number(c.nu))],
      ['设计剪力 Vu (kN)',...cases.map(c=>number(c.vy))],
      ['作者选用的拉 / 剪承载力 (kN)',...cases.map(c=>number(c.author.capN)+' / '+number(c.author.capV))],
      ['按刊载数值复算 ηN + ηV（限 1.20）',...cases.map(c=>number(c.author.sum,3))],
      ['论文刊载 ηN + ηV',...cases.map(c=>number(c.publishedSum))],
      ['混凝土崩裂的拉 / 剪承载力 (kN)',...cases.map(c=>number(c.breakoutN)+' / '+number(c.breakoutV))],
      ['保留崩裂后的拉 / 剪需求比（各限 1.00）',...cases.map(c=>number(c.withBreakout.etaN,3)+' / '+number(c.withBreakout.etaV,3))],
    ]));
    explanation.append(el(doc,'p','M-1 的受拉锥破设计承载力 118.1 kN 小于设计拉力 124.8 kN。工程中若采用专门锚固钢筋传力，须核算受力钢筋、潜在破坏面两侧的锚固及荷载传至主体的路径。'));
    content.append(explanation);
    const edition=section(doc,'把论文用于当前设计时');
    edition.append(el(doc,'p','论文对比 GB 50010-2010 §9.7.2 与 ACI 318-14 第 17 章。上表按原文刊载值复算 2014 版算例。工作台采用 ACI CODE-318-25，§17.8 将混凝土和钢材分开验算。论文使用 ASTM A615 带肋钢筋，需核查发展长度、群筋崩裂及后续传力。论文的 1.6 荷载系数仅用于此处复算。'),
      link(doc,'原文第 49–50 页 · 图 6、表 1',paperUrl),doc.createTextNode('　'),link(doc,'ACI CODE-318-25',codeUrl));
    content.append(edition);
  }
  window.EmbedReport=Object.freeze({open:report,paper});
}());
