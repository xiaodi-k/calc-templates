/* Orthographic solid rendering. Per-fragment depth replaces SVG face-centroid sorting. */
(function(){'use strict';
const palette={plate:'#7196a9',column:'#b7c9d4',anchor:'#d5b781',rib:'#9fb8ae',key:'#88a9d2'};
const rgb=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)/255),sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function bary(p,a,b,c){let den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-9)return null;let u=((b[1]-c[1])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[1]))/den,v=((c[1]-a[1])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[1]))/den;return u>=-1e-6&&v>=-1e-6&&u+v<=1.000001?[u,v,1-u-v]:null;}
class SolidRenderer{
 constructor(host){this.canvas=document.createElement('canvas');this.canvas.className='solid-canvas';this.canvas.setAttribute('aria-hidden','true');this.canvas.width=1600;this.canvas.height=1216;host.prepend(this.canvas);this.gl=this.canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,preserveDrawingBuffer:true,premultipliedAlpha:false});this.projected=[];this.geometry=[];this.visibleParts=[];if(this.gl)this.setup();else{this.canvas.remove();this.canvas=document.createElement('canvas');this.canvas.className='solid-canvas';this.canvas.width=1000;this.canvas.height=760;host.prepend(this.canvas);this.ctx=this.canvas.getContext('2d');}}
 setup(){let gl=this.gl,compile=(type,source)=>{let s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};let p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,'attribute vec3 a_position;attribute vec3 a_color;varying vec3 v_color;void main(){gl_Position=vec4(a_position,1.0);v_color=a_color;}'));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,'precision mediump float;varying vec3 v_color;void main(){gl_FragColor=vec4(v_color,1.0);}'));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));this.program=p;this.buffer=gl.createBuffer();gl.useProgram(p);for(let [name,offset]of[['a_position',0],['a_color',12]]){let a=gl.getAttribLocation(p,name);gl.enableVertexAttribArray(a);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.vertexAttribPointer(a,3,gl.FLOAT,false,24,offset);}gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);}
 draw(faces,project,raw,active,wires=[]){
  const xray=active==='key',triangles=[],edges=[],ghost=[],meta=[],projected=[];
  // All body fills are opaque. X-ray selection explicitly uses wireframe context,
  // instead of layering translucent body faces with incorrect visual occlusion.
  let maxDepth=Math.max(1,...faces.flatMap(f=>f.points.map(p=>Math.abs(raw(p)[2]))))*1.1;
  const light=[-.35,-.45,.822],zero=raw([0,0,0]);
  // Context outlines are drawn before the solid pass, so they never show through bodies.
  for(let wire of wires)for(let i=1;i<wire.points.length;i++){let a=[...project(wire.points[i-1]),raw(wire.points[i-1])[2]],b=[...project(wire.points[i]),raw(wire.points[i])[2]],len=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let d=0;d<len;d+=10){let point=t=>a.map((v,j)=>v+(b[j]-v)*t);ghost.push({pts:[point(d/len),point(Math.min(len,d+5)/len)],color:rgb(active==='concrete'?'#8ab5bf':'#cbd7df')});}}

  for(let f of faces){let pts=f.points.map(p=>{let xy=project(p);return[xy[0],xy[1],raw(p)[2]];}),base=rgb(palette[f.part]||'#90a8b5'),normal=cross(sub(f.points[1],f.points[0]),sub(f.points[2],f.points[0])),len=Math.hypot(...normal)||1;normal=normal.map(x=>x/len);let viewNormal=sub(raw(normal),zero);if(viewNormal[2]<0)viewNormal=viewNormal.map(x=>-x);let intensity=.58+.42*Math.max(0,dot(viewNormal,light));if(f.part===active)base=base.map((x,i)=>x*.78+rgb(f.part==='anchor'?'#d9ab65':f.part==='key'?'#679cd0':'#76a9b7')[i]*.22);let color=base.map(v=>Math.min(1,v*intensity)),isGhost=xray&&f.part!=='key';
   meta.push({part:f.part,points:pts});
   for(let i=1;i<pts.length-1;i++)if(!isGhost){let triangle={pts:[pts[0],pts[i],pts[i+1]],color,part:f.part};triangles.push(triangle);projected.push(triangle);}
   for(let i=0;i<pts.length;i++)(isGhost?ghost:edges).push({pts:[pts[i],pts[(i+1)%pts.length]],color:isGhost?[.82,.87,.9]:base.map(v=>v*.65)});
  }
  this.projected=projected;this.geometry=meta;this.visibleParts=[...new Set(triangles.map(t=>t.part))];this.xray=xray;this.active=active;this.maxDepth=maxDepth;
  if(this.gl){let gl=this.gl;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);const draw=(items,mode)=>{let vertices=[];for(let item of items)for(let p of item.pts)vertices.push(p[0]/500-1,1-p[1]/380,-p[2]/maxDepth,...item.color);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);gl.drawArrays(mode,0,vertices.length/6);};gl.depthMask(false);gl.disable(gl.DEPTH_TEST);draw(ghost,gl.LINES);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,1);draw(triangles,gl.TRIANGLES);gl.disable(gl.POLYGON_OFFSET_FILL);draw(edges,gl.LINES);}
  else this.software(triangles,edges,ghost);
 }
 software(triangles,edges,ghost){
  // Depth-buffer fallback for browsers without WebGL; deliberately no painter sorting.
  let W=this.canvas.width,H=this.canvas.height,s=W/1000,depth=new Float64Array(W*H);depth.fill(-Infinity);let img=this.ctx.createImageData(W,H),data=img.data;
  const pixel=(x,y,z,color,test=true)=>{let id=y*W+x;if(x<0||x>=W||y<0||y>=H||(test&&z<depth[id]-.02))return;depth[id]=test?Math.max(depth[id],z):depth[id];for(let j=0;j<3;j++)data[id*4+j]=Math.round(color[j]*255);data[id*4+3]=255;};
  const lines=(items,test)=>{for(let {pts,color}of items){let a=pts[0],b=pts[1],steps=Math.max(1,Math.ceil(Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]))*s));for(let j=0;j<=steps;j++){let t=j/steps;pixel(Math.round((a[0]+t*(b[0]-a[0]))*s),Math.round((a[1]+t*(b[1]-a[1]))*s),a[2]+t*(b[2]-a[2]),color,test);}}};lines(ghost,false);
  for(let {pts,color}of triangles){let ps=pts.map(p=>[p[0]*s,p[1]*s,p[2]]),minx=Math.max(0,Math.floor(Math.min(...ps.map(p=>p[0])))),maxx=Math.min(W-1,Math.ceil(Math.max(...ps.map(p=>p[0])))),miny=Math.max(0,Math.floor(Math.min(...ps.map(p=>p[1])))),maxy=Math.min(H-1,Math.ceil(Math.max(...ps.map(p=>p[1]))));for(let y=miny;y<=maxy;y++)for(let x=minx;x<=maxx;x++){let b=bary([x+.5,y+.5],...ps);if(b)pixel(x,y,dot(b,ps.map(p=>p[2])),color);}}
  lines(edges,true);this.ctx.putImageData(img,0,0);
 }
 pick(point){let best=null;for(let t of this.projected){let b=bary(point,...t.pts);if(!b)continue;let z=dot(b,t.pts.map(p=>p[2]));if(!best||z>best.depth)best={part:t.part,depth:z,color:t.color};}return best;}
 getInfo(){return{active:this.active,backend:this.gl?'webgl-depth':'software-depth',xray:this.xray,faceCounts:Object.fromEntries(Object.keys(palette).map(k=>[k,this.geometry.filter(f=>f.part===k).length])),geometry:this.geometry};}
}
window.SolidRenderer=SolidRenderer;
})();
