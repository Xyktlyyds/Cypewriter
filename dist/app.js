const editor=document.querySelector('textarea'),mirror=document.querySelector('#mirror'),caret=document.querySelector('#caret');
const textPixelRatio = devicePixelRatio || 1;
function sizeEditorText() {
 const physicalWidth = innerWidth * (devicePixelRatio || 1) / textPixelRatio;
 document.documentElement.style.setProperty('--editor-font-size', Math.max(24, Math.min(38, physicalWidth * .03)) + 'px');
}
sizeEditorText();
addEventListener('resize', sizeEditorText);
let composing=false;
function positionCaret(){
 mirror.replaceChildren(document.createTextNode(editor.value.slice(0,editor.selectionStart)));
 const marker=document.createElement('span');marker.textContent='\u200b';mirror.append(marker,document.createTextNode(editor.value.slice(editor.selectionStart)||' '));
 const a=marker.getBoundingClientRect(),b=mirror.getBoundingClientRect();
 caret.style.left=(a.left-b.left-editor.scrollLeft)+'px';caret.style.top=(a.top-b.top-editor.scrollTop)+'px';
 caret.style.visibility=!composing&&editor.selectionStart===editor.selectionEnd&&a.top-b.top-editor.scrollTop>=0&&a.top-b.top-editor.scrollTop<editor.clientHeight?'visible':'hidden';
}
['input','keyup','click','scroll','select','focus'].forEach(event=>editor.addEventListener(event,positionCaret));
editor.addEventListener('compositionstart',()=>{composing=true;caret.style.visibility='hidden';editor.style.caretColor='#f0f5f3';});
editor.addEventListener('compositionend',()=>{composing=false;editor.style.caretColor='transparent';positionCaret();});
document.addEventListener('selectionchange',positionCaret);addEventListener('resize',positionCaret);positionCaret();
const canvas=document.querySelector('#fluid'),gl=canvas.getContext('webgl',{alpha:false,antialias:false});
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
if(gl){
 const vertex='attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
 const fragment=`precision highp float;
 uniform vec2 size;uniform float time;uniform vec2 mouse;
 vec3 palette(float v){return .5+.5*cos(6.2831853*(v+vec3(0.,.33,.67)));}
 void main(){
 vec2 uv=gl_FragCoord.xy/size;vec2 p=(uv-.5)*vec2(size.x/size.y,1.);
 float t=time*.075;vec2 q=p;
 for(int i=0;i<5;i++){float f=float(i)+1.;q+=.19*vec2(sin(q.y*f*2.1+t*.7+f),cos(q.x*f*1.7-t*.5+f))/f;}
 vec2 m=(mouse-.5)*vec2(size.x/size.y,1.);vec2 d=p-m;
 q+=.15*vec2(sin(d.y*6.+t),cos(d.x*6.-t))*exp(-dot(d,d)*3.);
 float wave=sin(q.x*2.8+t*.6)+cos(q.y*3.1-t*.4)+sin((q.x+q.y)*2.-t*.3);
 float hue=time/180.+wave*.14;
 vec3 color=palette(hue)*(.14+.11*(wave*.16+.5))+vec3(.025,.032,.04);
 float vignette=1.-.32*dot(uv-.5,uv-.5);
 gl_FragColor=vec4(color*vignette,1.);
 }`;
 function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
 try{
 const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
 const pos=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
 const uSize=gl.getUniformLocation(program,'size'),uTime=gl.getUniformLocation(program,'time'),uMouse=gl.getUniformLocation(program,'mouse');
 let x=.5,y=.5,tx=.5,ty=.5,elapsed=0,last=0,frame=0;
 addEventListener('pointermove',e=>{tx=e.clientX/innerWidth;ty=1-e.clientY/innerHeight;},{passive:true});
 function resize(){const ratio=Math.min(devicePixelRatio,1.5);canvas.width=Math.round(innerWidth*ratio);canvas.height=Math.round(innerHeight*ratio);gl.viewport(0,0,canvas.width,canvas.height);}
 function draw(now){frame=0;if(document.hidden)return;if(last)elapsed+=Math.min((now-last)/1000,.1);last=now;x+=(tx-x)*.025;y+=(ty-y)*.025;gl.uniform2f(uSize,canvas.width,canvas.height);gl.uniform1f(uTime,reduced.matches?0:elapsed);gl.uniform2f(uMouse,x,y);gl.drawArrays(gl.TRIANGLES,0,6);if(!reduced.matches)frame=requestAnimationFrame(draw);}
 function resume(){if(frame)cancelAnimationFrame(frame);last=0;frame=requestAnimationFrame(draw);}
 addEventListener('resize',()=>{resize();resume();});document.addEventListener('visibilitychange',resume);reduced.addEventListener('change',resume);canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);});canvas.addEventListener('webglcontextrestored',()=>location.reload());resize();resume();
 }catch(error){console.error('Fluid background unavailable',error);}
}
