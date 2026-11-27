/* Printable calculation record and the two published comparison cases. */
(function () {
  'use strict';
  const codeUrl = 'https://www.concrete.org/store/productdetail.aspx?ItemID=318U19';
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
    const content = show(doc, '美标混凝土埋件计算书', (context.name || '预埋件节点') + ' · ACI 318-19（SI）');
    const model = section(doc, '节点与荷载约定');
    model.append(el(doc, 'p', '普通重、开裂混凝土，矩形规则锚群焊于同一刚性锚板。N 向外为正，正 Mx 使 +Y 排受拉；Vy 沿 Y 轴、通过锚群形心。输入值为锚板传力面处的同一强度组合设计内力。'));
    const anchor = params.anchorType === 'headed' ? '有头栓钉' : params.anchorType === 'hooked' ? 'L 形锚栓' : '待核锚型';
    model.append(table(doc, ['参数','项目输入'], [
      ['锚型与布置', anchor+' · X 向 '+number(params.nx)+' 列 × Y 向 '+number(params.ny)+' 排'],
      ['锚板 / 混凝土厚度',number(params.plateX)+' × '+number(params.plateY)+' mm / '+number(params.h)+' mm'],
      ['杆径 / 有效埋深',number(params.d)+' / '+number(params.hef)+' mm'],
      ['锚距 sx / sy', number(params.sx)+' / '+number(params.sy)+' mm'],
      ['混凝土边距（左、右、下、上）',[params.left,params.right,params.bottom,params.top].map(v=>number(v)).join(' / ')+' mm'],
      [params.anchorType==='headed'?'钉头直径 dh':'弯钩伸出 eh',number(params.anchorType==='headed'?params.dh:params.eh)+' mm'],
      ['混凝土 f′c / 锚材 fy / fu',[params.fc,params.fy,params.fu].map(v=>number(v)).join(' / ')+' MPa']
    ]));
    content.append(model);
    const results = cases.map((c, j) => j===active ? current : window.EmbedEngine.calculate({...params,...c}));
    const summary = section(doc,'各荷载组合');
    summary.append(table(doc,['工况','Nu (kN)','Mx (kN·m)','Vy (kN)','控制利用率','锚固结论'],
      cases.map((c,j)=>[c.name||'工况 '+(j+1),number(c.nu),number(c.mx),number(c.vy),number(results[j]?.utilization,3),
        results[j]?.ok ? (results[j].status==='pass'?'满足':'超限') : '待核对'])));
    content.append(summary);
    cases.forEach((c, j) => {
      const result = results[j];
      const group = section(doc, (c.name||'工况 '+(j+1))+' · 分项验算');
      if (!result?.ok) {
        group.append(el(doc,'p',(result?.errors||['请核对输入']).join('；'),'er-warning'));
      } else {
        group.append(el(doc,'p','受拉控制比 '+number(result.etaN,3)+'，受剪控制比 '+number(result.etaV,3)+'。单项比值限值为 1.00；两者均大于 0.20 时，还须满足两者之和 ≤ 1.20。'));
        group.append(table(doc,['验算项目','设计需求','设计承载力 / 限值','利用率','依据'],
          result.checks.map(k=>[k.label,k.applicable===false?'—':number(k.demand,3)+(k.unit==='kN'?' kN':''),
            k.applicable===false?'—':number(k.capacity,3)+(k.unit==='kN'?' kN':''),k.applicable===false?'未触发':number(k.ratio,3),k.clause])));
        if (result.distribution?.rows?.length) {
          const rows = el(doc,'details');
          rows.append(el(doc,'summary','各排锚件的拉力分配'),table(doc,['排中心 y (mm)','本排拉力合计 (kN)','每根锚件拉力 (kN)'],
            result.distribution.rows.map(r=>[number(r.y),number(r.tension,3),number(r.perAnchor,3)])));
          group.append(rows);
        }
        const explain = el(doc,'details');
        explain.append(el(doc,'summary','公式与条款'));
        for (const check of result.checks) {
          if (check.applicable === false) continue;
          explain.append(el(doc,'p',check.label+' · '+check.clause+'　'+check.formula));
        }
        const trace = result.trace;
        const groupN = trace.tensionGroups[result.distribution.activeGroup];
        explain.append(table(doc,['受拉参数','代入值'],[
          ['有效截面 Ase / 限制后的 f*',number(trace.As)+' mm² / '+number(trace.fut)+' MPa'],
          ['φ 钢拉 / 钢剪 / 混凝土',[trace.phiN,trace.phiV,trace.phiConcrete].map(v=>number(v)).join(' / ')],
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
    limits.append(el(doc,'p','以上结论涵盖本页计算的锚固破坏模式。锚板弯曲、转接件、焊缝、钢筋可焊性、主体传力和地震专项应结合实际节点另核。采用带肋弯钩钢筋时，须按第 25 章核对钢筋发展及弯折构造。项目采用的规范版本及地方修订由设计人确认。'),
      link(doc,'ACI 318-19 官方出版信息',codeUrl));
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
    edition.append(el(doc,'p','论文对比 GB 50010-2010 §9.7.2 与 ACI 318-14 第 17 章。工作台按 ACI 318-19 公制计算，默认保留混凝土崩裂。论文使用 ASTM A615 带肋钢筋，应用时应先判定锚固依靠弯部承压还是钢筋黏结、发展；锚栓与普通弯钩钢筋各有适用构造。论文算例的 1.6 荷载系数只用于复算这两组数据。'),
      link(doc,'原文第 49–50 页 · 图 6、表 1',paperUrl),doc.createTextNode('　'),link(doc,'ACI 318-19',codeUrl));
    content.append(edition);
  }
  window.EmbedReport=Object.freeze({open:report,paper});
}());
