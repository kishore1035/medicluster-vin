import { useEffect, type RefObject } from "react";

const VERTEX = `attribute vec2 a_position; varying vec2 v_uv;
void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;
const FRAGMENT = `precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_image;
uniform vec2 u_cover;
uniform vec2 u_pointer;
uniform vec2 u_subject;
uniform float u_hover;
uniform float u_scroll;
void main(){
  vec2 uv=(v_uv-.5)*u_cover/(1.035+u_hover*.045)+.5;
  vec2 subject=(uv-u_subject)*vec2(1.2,.85);
  float depth=.22+.58*exp(-dot(subject,subject)*5.)+.12*(1.-uv.y);
  uv+=u_pointer*.085*(depth-.3)*u_hover;
  uv.y+=u_scroll*.008;
  vec2 focus=vec2(.5)+u_pointer;
  float radius=smoothstep(.12,.8,length(v_uv-focus))*.0018*u_hover;
  vec3 color=texture2D(u_image,uv).rgb*.5;
  color+=texture2D(u_image,uv+vec2(radius,0.)).rgb*.125;
  color+=texture2D(u_image,uv-vec2(radius,0.)).rgb*.125;
  color+=texture2D(u_image,uv+vec2(0.,radius)).rgb*.125;
  color+=texture2D(u_image,uv-vec2(0.,radius)).rgb*.125;
  gl_FragColor=vec4(color,1.);
}`;

function createLayer(card: HTMLElement, canvas: HTMLCanvasElement, image: HTMLImageElement) {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, powerPreference: "low-power" });
  if (!gl) return null;
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  const dispose = () => { shaders.forEach(shader => gl.deleteShader(shader)); gl.deleteProgram(program); gl.deleteBuffer(buffer); gl.deleteTexture(texture); };
  if (!program || !buffer || !texture) { dispose(); return null; }
  for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
    const shader = gl.createShader(type);
    if (!shader) { dispose(); return null; }
    shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { dispose(); return null; }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { dispose(); return null; }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image); }
  catch { dispose(); return null; }
  const uniforms = Object.fromEntries(["u_image","u_cover","u_pointer","u_subject","u_hover","u_scroll"].map(name => [name, gl.getUniformLocation(program, name)]));
  gl.uniform1i(uniforms.u_image, 0);
  const subjects: Record<string, [number, number]> = { medicluster: [.45,.55], patient: [.62,.4], dispatch: [.5,.55], crew: [.5,.55] };
  gl.uniform2fv(uniforms.u_subject, subjects[card.dataset.app ?? ""] ?? [.5,.5]);
  let frame = 0, dead = false, visible = true;
  let x = 0, y = 0, hover = 0, scroll = 0, targetX = 0, targetY = 0, targetHover = 0;
  const paint = () => {
    frame = 0;
    if (dead || !visible || document.hidden) return;
    x += (targetX-x)*.11; y += (targetY-y)*.11; hover += (targetHover-hover)*.085;
    const box = canvas.getBoundingClientRect();
    const targetScroll = Math.max(-1,Math.min(1,(innerHeight*.5-box.top-box.height*.5)/innerHeight));
    scroll += (targetScroll-scroll)*.12;
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    const width = Math.max(1,Math.round(box.width*ratio)), height = Math.max(1,Math.round(box.height*ratio));
    if (canvas.width!==width || canvas.height!==height) { canvas.width=width; canvas.height=height; }
    gl.viewport(0,0,width,height);
    const aspect = box.width / box.height, imageAspect = image.naturalWidth / image.naturalHeight;
    gl.uniform2f(uniforms.u_cover,Math.min(1,aspect/imageAspect),Math.min(1,imageAspect/aspect));
    gl.uniform2f(uniforms.u_pointer,x,y); gl.uniform1f(uniforms.u_hover,hover); gl.uniform1f(uniforms.u_scroll,scroll);
    gl.drawArrays(gl.TRIANGLES,0,6);
    card.dataset.depthState="ready";
    card.style.setProperty("--depth-x",x.toFixed(4));
    if (Math.abs(targetX-x)+Math.abs(targetY-y)+Math.abs(targetHover-hover)+Math.abs(targetScroll-scroll)>.002) frame=requestAnimationFrame(paint);
  };
  const schedule = () => { if (!frame && !dead && visible && !document.hidden) frame=requestAnimationFrame(paint); };
  const move = (event: PointerEvent) => {
    if (event.pointerType==="touch") return;
    const box=canvas.getBoundingClientRect();
    targetX=Math.max(-.5,Math.min(.5,(event.clientX-box.left)/box.width-.5));
    targetY=Math.max(-.5,Math.min(.5,.5-(event.clientY-box.top)/box.height));
    targetHover=1; schedule();
  };
  const enter = () => { targetHover=1; schedule(); };
  const leave = () => { targetX=0; targetY=0; targetHover=0; schedule(); };
  const lost = (event: Event) => { event.preventDefault(); dead=true; cancelAnimationFrame(frame); card.dataset.depthState="fallback"; };
  card.addEventListener("pointerenter",enter); card.addEventListener("pointermove",move,{passive:true}); card.addEventListener("pointerleave",leave);
  card.addEventListener("focusin",enter); card.addEventListener("focusout",leave);
  canvas.addEventListener("webglcontextlost",lost);
  addEventListener("scroll",schedule,{passive:true}); document.addEventListener("visibilitychange",schedule);
  const resize = new ResizeObserver(schedule); resize.observe(canvas);
  schedule();
  return {
    setVisible(value: boolean) { visible=value; if (value) schedule(); else { cancelAnimationFrame(frame); frame=0; } },
    dispose() {
      dead=true; cancelAnimationFrame(frame); resize.disconnect();
      card.removeEventListener("pointerenter",enter); card.removeEventListener("pointermove",move); card.removeEventListener("pointerleave",leave);
      card.removeEventListener("focusin",enter); card.removeEventListener("focusout",leave); canvas.removeEventListener("webglcontextlost",lost);
      removeEventListener("scroll",schedule); document.removeEventListener("visibilitychange",schedule);
      dispose(); card.style.removeProperty("--depth-x");
    },
  };
}

export default function useCardDepth(rootRef: RefObject<HTMLElement>, paused: boolean) {
  useEffect(() => {
    const root=rootRef.current;
    if (!root) return;
    const reduced=matchMedia("(prefers-reduced-motion: reduce)"), desktop=matchMedia("(min-width:813px) and (pointer:fine)");
    const cards=[...root.querySelectorAll<HTMLElement>(".mc-workspace-card")];
    let stop=()=>{};
    const sync=()=>{
      stop(); stop=()=>{};
      cards.forEach(card=>card.dataset.depthState="static");
      if (paused || reduced.matches || !desktop.matches) return;
      let cancelled=false;
      const layers=new Map<HTMLElement,ReturnType<typeof createLayer>>();
      const pending=new Set<HTMLElement>();
      const visible=new Set<HTMLElement>();
      const observer=new IntersectionObserver(entries=>{
        entries.forEach(entry=>{
          const card=entry.target as HTMLElement;
          if (entry.isIntersecting) visible.add(card); else visible.delete(card);
          if (layers.has(card)) { layers.get(card)?.setVisible(entry.isIntersecting); return; }
          if (!entry.isIntersecting || pending.has(card)) return;
          pending.add(card);
          const image=card.querySelector<HTMLImageElement>("img")!,canvas=card.querySelector<HTMLCanvasElement>("canvas")!;
          image.decode().then(()=>{
            if (cancelled) return;
            const layer=createLayer(card,canvas,image);
            layers.set(card,layer); layer?.setVisible(visible.has(card));
            if (!layer) card.dataset.depthState="fallback";
          }).catch(()=>{ if (!cancelled) card.dataset.depthState="fallback"; });
        });
      },{rootMargin:"100px"});
      cards.forEach(card=>observer.observe(card));
      stop=()=>{ cancelled=true; observer.disconnect(); layers.forEach(layer=>layer?.dispose()); };
    };
    reduced.addEventListener("change",sync); desktop.addEventListener("change",sync); sync();
    return ()=>{ stop(); reduced.removeEventListener("change",sync); desktop.removeEventListener("change",sync); cards.forEach(card=>delete card.dataset.depthState); };
  },[rootRef,paused]);
}
