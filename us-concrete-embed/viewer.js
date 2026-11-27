/* Engineering drawing for the ACI embed workbench. All dimensions are in mm. */
(() => {
  'use strict';
  const TAU = 2 * Math.PI;
  const axisColor = {x:'#ae6755',y:'#397e70',z:'#4378a0'};
  const viewNames = {iso:'轴测',plan:'平面 XY',section:'剖面 YZ'};
  const scalar = value => value === '' || value == null ? NaN : Number(value);
  const number = value => Number(value.toFixed(2)).toLocaleString('en-US');
  const clamp = (x,lo,hi) => Math.max(lo,Math.min(x,hi));
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const attr = properties => Object.entries(properties).map(([k,v]) => k+'="'+escape(v)+'"').join(' ');
  const tag = (type,props,content='') => '<'+type+' '+attr(props)+'>'+content+'</'+type+'>';
  const line = (a,b,style) => tag('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,...style});
  const text = (pt,str,style) => tag('text',{x:pt.x,y:pt.y,...style},escape(str));
  const points = pts => pts.map(q=>q.x.toFixed(2)+','+q.y.toFixed(2)).join(' ');
  const poly = (pts,style) => tag('polygon',{points:points(pts),...style});
  const pline = (pts,style) => tag('polyline',{points:points(pts),fill:'none',...style});
  const parse = (p,load) => {
    const g = {hooked:p.anchorType==='hooked',type:p.anchorType};
    const common = ['d','hef','h','sx','sy','nx','ny','left','right','top','bottom','plateX','plateY'];
    for (const key of [...common,'eh','dh','headHeight']) g[key]=scalar(p[key]);
    for (const key of ['nu','vy','mx']) g[key]=scalar(load?.[key] ?? p[key]);
    const needed = [...common,...(g.hooked?['eh']:['dh','headHeight'])];
    if (!['hooked','headed'].includes(g.type) || needed.some(k=>!Number.isFinite(g[k])||g[k]<=0||g[k]>1e6)
        || ![g.nx,g.ny].every(v=>Number.isInteger(v)&&v>=2&&v<=10)) return null;
    g.ax=(g.nx-1)*g.sx/2; g.ay=(g.ny-1)*g.sy/2;
    g.x0=-g.ax-g.left; g.x1=g.ax+g.right; g.y0=-g.ay-g.bottom; g.y1=g.ay+g.top;
    g.w=g.x1-g.x0; g.b=g.y1-g.y0;
    return g;
  };
  const button = (key,label,title) => '<button type="button" class="ev-button" data-action="'+key+'" title="'+title+'" aria-label="'+title+'">'+label+'</button>';
  function create(container,onSelect) {
    if (typeof container==='string') container=document.querySelector(container);
    if (!container) throw new Error('EmbedViewer needs a container');
    const shell=document.createElement('div');
    shell.className='embed-viewer';
    shell.innerHTML='<div class="ev-toolbar"><div class="ev-modes" role="group" aria-label="工程视图">'+
      Object.entries(viewNames).map(([k,v])=>button(k,v,'切换到'+v)).join('')+'</div>'+
      '<div class="ev-controls" role="group" aria-label="模型控制">'+button('out','−','缩小')+
      '<span class="ev-zoom-readout">100%</span>'+button('in','+','放大')+
      button('dims','标注','显示或隐藏尺寸标注')+button('fit','复位','复位视图')+'</div></div>'+
      '<div class="ev-stage" tabindex="0" role="group" aria-label="锚固模型，可用方向键旋转轴测图，加号或减号缩放，Home 复位">'+
      '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="混凝土与预埋锚板工程图"></svg></div>'+
      '<div class="ev-caption"><div class="ev-legend"><span class="ev-key ev-key-conc">混凝土</span>'+
      '<span class="ev-key ev-key-plate">锚板</span><span class="ev-key ev-key-anchor">锚件</span></div><span class="ev-status"></span></div>';
    container.replaceChildren(shell);
    const stage=shell.querySelector('.ev-stage'),svg=stage.querySelector('svg'),zoomReadout=shell.querySelector('.ev-zoom-readout');
    let g=null, view='iso',yaw=.58,elev=.48,zoom=1,pan={x:0,y:0},dims=true,active='', frame=0, width=800,height=440;
    const pointer=new Map(); let gesture=null;
    function position(p) {
      const [x,y,z]=p;
      if(view==='plan')return {x,y:-y,depth:z};
      if(view==='section')return {x:y,y:-z,depth:x};
      const c=Math.cos(yaw),s=Math.sin(yaw),cv=Math.cos(elev),sv=Math.sin(elev),near=x*s-y*c;
      return {x:x*c+y*s,y:near*sv-z*cv,depth:near*cv+z*sv};
    }
    function fit(){
      zoom=1;pan={x:0,y:0};yaw=.58;elev=.48;queue();
    }
    function setView(v){
      const aliases={top:'plan',side:'section'}; v=aliases[v]||v;
      if(viewNames[v]){view=v;fit();}
    }
    function scaleBy(factor,cx=width/2,cy=height/2){
      const old=zoom;zoom=clamp(zoom*factor,.45,5);
      const r=zoom/old; pan={x:(cx-width/2)*(1-r)+pan.x*r,y:(cy-height/2)*(1-r)+pan.y*r}; queue();
    }
    function queue(){ if(!frame) frame=requestAnimationFrame(()=>{frame=0;draw();}); }
    function draw() {
      width=Math.max(270,stage.clientWidth||770); height=Math.max(220,stage.clientHeight||420);
      svg.setAttribute('viewBox','0 0 '+width+' '+height);
      for(const b of shell.querySelectorAll('.ev-button[data-action]')){
        const k=b.dataset.action;if(viewNames[k]||k==='dims')b.setAttribute('aria-pressed',String(k==='dims'?dims:k===view));
      }
      zoomReadout.textContent=Math.round(zoom*100)+'%';
      if(!g){svg.innerHTML=text({x:width/2,y:height/2},'请输入有效的锚件、锚板及混凝土尺寸。',{'text-anchor':'middle',fill:'#56717d','font-size':13});shell.querySelector('.ev-status').textContent='';return;}
      const first=[g.x0,g.y0],last=[g.x1,g.y1],compact=width<510;
      const blockCorners=z=>[[first[0],first[1],z],[last[0],first[1],z],[last[0],last[1],z],[first[0],last[1],z]];
      const plate=[[ -g.plateX/2,-g.plateY/2,0],[g.plateX/2,-g.plateY/2,0],[g.plateX/2,g.plateY/2,0],[-g.plateX/2,g.plateY/2,0]];
      const top=blockCorners(0),base=blockCorners(-g.h);
      const ext=[...top,...base,...plate].map(position);
      const minX=Math.min(...ext.map(p=>p.x)),maxX=Math.max(...ext.map(p=>p.x)),minY=Math.min(...ext.map(p=>p.y)),maxY=Math.max(...ext.map(p=>p.y));
      const plotW=width-(compact?66:120),plotH=height-(view==='plan'?90:76);
      const scale=Math.min(plotW/Math.max(1,maxX-minX),plotH/Math.max(1,maxY-minY))*zoom;
      const P=pt=>{const q=position(pt);return{x:width*.5+pan.x+(q.x-(minX+maxX)/2)*scale,y:height*.5+pan.y+(q.y-(minY+maxY)/2)*scale};};
      const annotations=[],loads=[];let body='';
      const field=(key,title,content,css='')=>tag('g',{'data-field':key,class:css+(key===active?' is-focused':''),tabindex:'0',role:'button','aria-label':'编辑'+title},tag('title',{},'编辑'+title)+content);
      function boxedLabel(at,label,angle=0,ink='#385865'){
        // CJK and numeric glyphs have different widths; the box also serves as a touch target.
        const len=Array.from(label).reduce((sum,c)=>sum+(/[^\x00-\xff]/.test(c)?11:6.8),0)+12;
        return tag('g',{transform:'translate('+at.x+' '+at.y+') rotate('+angle+')'},
          tag('rect',{x:-len/2,y:-9,width:len,height:18,rx:2,fill:'#fafcfb','fill-opacity':.96,class:'ev-label-bg'})+
          text({x:0,y:3.8},label,{'text-anchor':'middle',class:'ev-dimt',style:'fill:'+ink}));
      }
      function dimension(a,b,label,key,shift,rotation=true) {
        if(!dims)return;
        const u=P(a),v=P(b),dx=v.x-u.x,dy=v.y-u.y,len=Math.hypot(dx,dy);
        if(len<8)return;
        const nx=-dy/len,ny=dx/len;const off=(p,d)=>({x:p.x+nx*d,y:p.y+ny*d});
        const aa=off(u,shift),bb=off(v,shift),m={x:(aa.x+bb.x)/2,y:(aa.y+bb.y)/2};
        const pen={stroke:'#728c96','stroke-width':.85};let deg=rotation?Math.atan2(dy,dx)*180/Math.PI:0;
        if(deg>90)deg-=180;if(deg< -90)deg+=180;
        const tick=p=>line({x:p.x-3*dx/len-nx*3,y:p.y-3*dy/len-ny*3},{x:p.x+3*dx/len+nx*3,y:p.y+3*dy/len+ny*3},pen);
        const ink=line(u,off(u,shift+Math.sign(shift)*4),pen)+line(v,off(v,shift+Math.sign(shift)*4),pen)+line(aa,bb,pen)+tick(aa)+tick(bb);
        annotations.push(ink+field(key,label,boxedLabel(m,label,deg),'ev-dim'));
      }
      function leader(world,label,key,delta){
        if(!dims)return;
        const a=P(world),b={x:a.x+delta[0],y:a.y+delta[1]};
        annotations.push(line(a,b,{stroke:'#738b94','stroke-width':.9})+field(key,label,boxedLabel(b,label),'ev-dim'));
      }
      // Concrete side faces are translucent so that embedded anchors remain inspectable.
      if(view==='iso'){
        const sides=top.map((p,i)=>[p,top[(i+1)%4],base[(i+1)%4],base[i]]);
        sides.sort((a,b)=>a.reduce((s,p)=>s+position(p).depth,0)-b.reduce((s,p)=>s+position(p).depth,0));
        sides.forEach((f,i)=>{body+=poly(f.map(P),{fill:i%2?'#cbd8d8':'#c2d0d3','fill-opacity':i>1?.39:.12,stroke:'#97aeb5','stroke-width':.85});});
        body+=poly(top.map(P),{fill:'#e0e7e6','fill-opacity':.37,stroke:'#8fa4ac','stroke-width':1});
      }else if(view==='plan'){
        body+=poly(top.map(P),{fill:'#d8e2e0','fill-opacity':.56,stroke:'#97aeb0','stroke-width':1.2});
      }else{
        body+=poly([top[1],top[2],base[2],base[1]].map(P),{fill:'#d6e0df','fill-opacity':.55,stroke:'#92a9ae','stroke-width':1.2});
      }
      const xy=[];
      for(let iy=0;iy<g.ny;iy++)for(let ix=0;ix<g.nx;ix++){
        if(view==='section'&&ix!==g.nx-1)continue;
        xy.push([-g.ax+ix*g.sx,-g.ay+iy*g.sy]);
      }
      xy.sort((a,b)=>position([...a,0]).depth-position([...b,0]).depth);
      const dPx=clamp(g.d*scale,2,28), accent=active==='d'||active==='anchorType';
      const metal=accent?'#e1a33d':'#be944f', edge=accent?'#965b19':'#805f30';
      function rodStroke(pts,px) {
        const projected=pts.map(P);return pline(projected,{stroke:edge,'stroke-width':px+1.1,'stroke-linecap':'round','stroke-linejoin':'round'})+
          pline(projected,{stroke:metal,'stroke-width':px,'stroke-linecap':'round','stroke-linejoin':'round'});
      }
      for(const [x,y] of xy) {
        if(view==='plan') continue;
        if(g.hooked){
          // Hook azimuth and bend radius are schematic. The top face of the return is at -hef.
          const r=Math.min(2*g.d,g.eh*.6,g.hef*.4),zc=-g.hef-g.d/2,pts=[[x,y,0],[x,y,zc+r]];
          for(let i=1;i<=9;i++){const t=(Math.PI/2)*i/9;pts.push([x,y+r*(1-Math.cos(t)),zc+r*(1-Math.sin(t))]);}
          pts.push([x,y+g.eh,zc]);body+=rodStroke(pts,dPx);
        }else{
          body+=rodStroke([[x,y,0],[x,y,-g.hef]],dPx);
          const headZ=-g.hef-g.headHeight;
          if(view==='section'){
            body+=poly([[x,y-g.dh/2,-g.hef],[x,y+g.dh/2,-g.hef],[x,y+g.dh/2,headZ],[x,y-g.dh/2,headZ]].map(P),{fill:metal,stroke:edge,'stroke-width':1});
          }else{
            const ring=(z)=>Array.from({length:20},(_,j)=>[x+Math.cos(j*TAU/20)*g.dh/2,y+Math.sin(j*TAU/20)*g.dh/2,z]);
            const htop=ring(-g.hef),hbase=ring(headZ);
            body+=poly(hbase.map(P),{fill:'#a1793b',stroke:edge,'stroke-width':.8});
            const headSides=htop.map((a,i)=>[a,htop[(i+1)%20],hbase[(i+1)%20],hbase[i]]);
            headSides.sort((a,b)=>position(a[0]).depth-position(b[0]).depth);
            headSides.forEach(face=>{body+=poly(face.map(P),{fill:'#ba8e4d',stroke:'none'});});
            body+=poly(htop.map(P),{fill:'#d3ad70',stroke:edge,'stroke-width':.7});
          }
        }
      }
      // Plate thickness is not an input; render its contact plane, not a fictitious scaled plate.
      if(view==='section'){
        body+=line(P([0,-g.plateY/2,0]),P([0,g.plateY/2,0]),{stroke:'#496b80','stroke-width':5});
      }else{
        body+=poly(plate.map(P),{fill:'#91abb8','fill-opacity':view==='plan'?.74:.83,stroke:'#3f657a','stroke-width':1.7});
        for(const [x,y] of xy){
          const q=P([x,y,0]);
          body+=tag('ellipse',{cx:q.x,cy:q.y,rx:Math.max(2,dPx/2),ry:Math.max(1.5,view==='plan'?dPx/2:dPx/2*Math.sin(elev)),fill:'#d6b37a',stroke:edge,'stroke-width':.8});
        }
      }
      if(view==='plan'){
        const dn=g.y0,right=g.x1;
        dimension([g.x0,dn,0],[-g.ax,dn,0],'左 '+number(g.left),'left',17);
        dimension([g.ax,dn,0],[g.x1,dn,0],'右 '+number(g.right),'right',17);
        dimension([right,g.y0,0],[right,-g.ay,0],'下 '+number(g.bottom),'bottom',17);
        dimension([right,g.ay,0],[right,g.y1,0],'上 '+number(g.top),'top',17);
        dimension([-g.ax,g.ay,0],[-g.ax+g.sx,g.ay,0],'sₓ '+number(g.sx),'sx',-17);
        dimension([-g.ax,-g.ay,0],[-g.ax,-g.ay+g.sy,0],'sᵧ '+number(g.sy),'sy',-16);
      }else if(view==='section'){
        const p=[0,-g.ay,-g.hef];
        dimension([0,g.y0,0],[0,g.y0,-g.h],'h '+number(g.h),'h',16);
        dimension([0,g.y1,0],[0,g.y1,-g.hef],'hₑf '+number(g.hef),'hef',-18);
        dimension([0,-g.plateY/2,0],[0,g.plateY/2,0],'Ly '+number(g.plateY),'plateY',-25);
        leader(p,(g.hooked?'eₕ '+number(g.eh):'dₕ '+number(g.dh)),g.hooked?'eh':'dh',[-12,33]);
        if(!compact)dimension([0,-g.ay,-g.h],[0,-g.ay+g.sy,-g.h],'sᵧ '+number(g.sy),'sy',17);
      }else{
        dimension(plate[0],plate[1],'Lx '+number(g.plateX),'plateX',17);
        dimension(plate[1],plate[2],'Ly '+number(g.plateY),'plateY',19);
        const embedX=Math.max(g.ax,g.plateX/2)+g.d*1.8;
        dimension([embedX,-g.plateY/2,0],[embedX,-g.plateY/2,-g.hef],'hₑf '+number(g.hef),'hef',compact?-20:-27);
        if(!compact)leader([-g.ax,-g.ay,-g.hef*.55],'Ø '+number(g.d),'d',[-49,-8]);
      }
      function arrow(a,b,color,name) {
        const dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy); if(l<5)return;
        const ux=dx/l,uy=dy/l,tip={x:b.x,y:b.y},tail={x:b.x-ux*9,y:b.y-uy*9};
        loads.push(line(a,tail,{stroke:color,'stroke-width':2.3})+poly([tip,{x:tail.x-3.6*uy,y:tail.y+3.6*ux},{x:tail.x+3.6*uy,y:tail.y-3.6*ux}],{fill:color}));
        if(name)loads.push(loadText({x:b.x+ux*7,y:b.y+uy*7+(uy>0?9:0)},name,ux>=.25?'start':ux<=-.25?'end':'middle',color));
      }
      const loadText=(at,name,anchor,color)=>text(at,name,{'text-anchor':anchor,fill:color,stroke:'#fbfdfb','stroke-width':3,'paint-order':'stroke','stroke-linejoin':'round','font-size':compact?10:12,'font-weight':700});
      const q=P([0,0,0]),length=compact?39:56;
      function direct(axis,val,name,color){
        if(!Number.isFinite(val)||val===0)return;
        const a=position([0,0,0]),b=position(axis),dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy),sgn=Math.sign(val);
        const signed=val>0?'+'+number(val):'−'+number(Math.abs(val));
        if(l<.01){
          const off= {x:q.x-7,y:q.y-6};
          loads.push(tag('circle',{cx:off.x,cy:off.y,r:5.5,stroke:color,fill:'#fff','stroke-width':1.5}));
          loads.push(val>0?tag('circle',{cx:off.x,cy:off.y,r:2,fill:color}):text({x:off.x,y:off.y+3},'×',{'text-anchor':'middle',fill:color,'font-size':11}));
          loads.push(loadText({x:off.x-9,y:off.y-6},name+' '+signed+' kN','end',color));return;
        }
        const tip={x:q.x+sgn*dx/l*length,y:q.y+sgn*dy/l*length};
        arrow(q,tip,color,name+' '+signed+' kN');
      }
      direct([0,0,1],g.nu,'N','#a24f43');
      direct([0,1,0],g.vy,'Vᵧ','#187d79');
      if(Number.isFinite(g.mx)&&g.mx!==0){
        const r=(compact?21:29)/scale,sgn=Math.sign(g.mx),seq=[];
        for(let j=0;j<=22;j++){
          const a=(sgn>0?.08:1.2)*Math.PI+sgn*(j/22)*1.2*Math.PI;
          seq.push(P([0,r*Math.cos(a),r*Math.sin(a)]));
        }
        loads.push(pline(seq,{stroke:'#826084','stroke-width':1.7}));
        arrow(seq[seq.length-4],seq[seq.length-1],'#826084');
        loads.push(loadText({x:q.x-12,y:q.y+31},'Mₓ '+(g.mx>0?'+':'−')+number(Math.abs(g.mx))+' kN·m','end','#78557b'));
      }
      // Place axis triad and scale in viewport coordinates so neither moves outside the stage.
      const origin={x:32,y:height-29}; let legend='';
      for(const [k,vec] of [['x',[1,0,0]],['y',[0,1,0]],['z',[0,0,1]]]){
        const u=position(vec),l=Math.hypot(u.x,u.y);if(l<.18)continue;
        const b={x:origin.x+u.x*21,y:origin.y+u.y*21};
        legend+=line(origin,b,{stroke:axisColor[k],'stroke-width':1.5})+text({x:b.x+3,y:b.y+2},k.toUpperCase(),{fill:axisColor[k],class:'ev-axis-text'});
      }
      const steps=[1,2,5,10,20,50,100,200,500,1000,2000,5000,10000,20000];
      const mm=steps.filter(v=>v*scale<(compact?53:82)).pop()||1,l=mm*scale;
      const e={x:width-16,y:height-15},a={x:e.x-l,y:e.y};
      const bar={stroke:'#69818b','stroke-width':1.25};
      legend+=line(a,e,bar)+line({x:a.x,y:a.y-5},a,bar)+line({x:e.x,y:e.y-5},e,bar)+text({x:e.x,y:e.y-8},number(mm)+' mm',{'text-anchor':'end',fill:'#5f7880','font-size':10});
      svg.innerHTML=tag('title',{},escape(viewNames[view]+'，'+g.nx+' × '+g.ny+' '+(g.hooked?'L 形锚栓':'有头栓钉')))+body+annotations.join('')+loads.join('')+legend;
      shell.querySelector('.ev-status').textContent=(g.hooked?'L 钩朝向示意。':'')+'荷载箭头仅示方向。';
    }
    function beginGesture() {
      const pts=[...pointer.values()];
      if(pts.length>=2){
        const [a,b]=pts;gesture={type:'pinch',x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.max(2,Math.hypot(b.x-a.x,b.y-a.y))};
      }else if(pts.length===1){
        const a=pts[0];gesture={type:view==='iso'&&!a.pan?'rotate':'pan',x:a.x,y:a.y};
      }else gesture=null;
    }
    function activate(target) {
      const el=target.closest?.('[data-field]');
      if(el){active=el.dataset.field;onSelect?.(active);queue();return;}
      const action=target.closest?.('[data-action]')?.dataset.action;
      if(viewNames[action])setView(action);
      else if(action==='in'||action==='out')scaleBy(action==='in'?1.22:1/1.22);
      else if(action==='fit')fit();
      else if(action==='dims'){dims=!dims;queue();}
    }
    shell.addEventListener('click',e=>activate(e.target));
    stage.addEventListener('keydown',e=>{
      if(e.target.hasAttribute('data-field')&&[' ','Enter'].includes(e.key)){e.preventDefault();activate(e.target);return;}
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(e.key))return;
      e.preventDefault();
      if(e.key==='Home'){fit();return;}
      if(['+','=','-'].includes(e.key)){scaleBy(e.key==='-'?1/1.2:1.2);return;}
      const dx=+(e.key==='ArrowRight')-+(e.key==='ArrowLeft'),dy=+(e.key==='ArrowUp')-+(e.key==='ArrowDown');
      if(view==='iso'){yaw+=dx*.12;elev=clamp(elev+dy*.08,.08,1.4);}else{pan.x+=dx*14;pan.y-=dy*14;}
      queue();
    });
    stage.addEventListener('wheel',e=>{
      e.preventDefault();const rect=stage.getBoundingClientRect();
      scaleBy(Math.exp(-clamp(e.deltaY,-180,180)*.0016),e.clientX-rect.left,e.clientY-rect.top);
    },{passive:false});
    stage.addEventListener('pointerdown',e=>{
      if(e.target.closest('[data-field]') || ![0,1].includes(e.button))return;
      stage.setPointerCapture(e.pointerId);pointer.set(e.pointerId,{x:e.clientX,y:e.clientY,pan:e.shiftKey||e.button===1});beginGesture();
    });
    stage.addEventListener('pointermove',e=>{
      const prev=pointer.get(e.pointerId);if(!prev||!gesture)return;
      pointer.set(e.pointerId,{...prev,x:e.clientX,y:e.clientY});
      if(gesture.type==='pinch'){
        const [a,b]=[...pointer.values()], d=Math.max(2,Math.hypot(b.x-a.x,b.y-a.y)),x=(a.x+b.x)/2,y=(a.y+b.y)/2,rect=stage.getBoundingClientRect();
        pan.x+=x-gesture.x;pan.y+=y-gesture.y;scaleBy(d/gesture.d,x-rect.left,y-rect.top);beginGesture();return;
      }
      const dx=e.clientX-prev.x,dy=e.clientY-prev.y;
      if(gesture.type==='pan'){pan.x+=dx;pan.y+=dy;}
      else {yaw+=dx*.008;elev=clamp(elev+dy*.006,.08,1.4);}
      queue();
    });
    const finish=e=>{if(pointer.delete(e.pointerId))beginGesture();};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,finish);
    const observer=new ResizeObserver(queue);observer.observe(stage);queue();
    return {
      update(params={},loadCase){g=parse(params,loadCase);queue();},
      focus(key){active=key||'';queue();},
      setView,
      destroy(){observer.disconnect();cancelAnimationFrame(frame);shell.remove();}
    };
  }
  window.EmbedViewer={create};
})();
