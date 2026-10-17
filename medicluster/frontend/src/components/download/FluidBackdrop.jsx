import React, { useEffect, useRef } from "react";

const VERTEX = `attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

// Yuva Garden's layered noise flow, with a cooler MediCluster palette.
const FRAGMENT = `precision highp float;
uniform vec2 resolution;
uniform vec2 pointer;
uniform float time;
uniform float scroll;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
}
float flow(vec2 p) {
  float value = 0.0, amplitude = 0.5;
  for (int i = 0; i < 4; i++) { value += amplitude * noise(p); p *= 2.02; amplitude *= 0.5; }
  return value;
}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  vec2 aspect = vec2(resolution.x / resolution.y, 1.0);
  vec2 p = uv * aspect * 1.6;
  float influence = exp(-3.0 * length(p - pointer * aspect * 1.6));
  p.y += scroll * 0.0004;
  vec2 q = vec2(flow(p + time * 0.035), flow(p + vec2(5.2, 1.3) - time * 0.025));
  vec2 w = vec2(flow(p + 3.0 * q + vec2(1.7, 9.2) + time * 0.04 + influence * 0.6),
    flow(p + 3.0 * q + vec2(8.3, 2.8) - time * 0.03));
  float f = flow(p + 2.5 * w);
  vec3 pearl = vec3(0.975, 0.98, 0.99);
  vec3 sage = vec3(0.70, 0.85, 0.82);
  vec3 lilac = vec3(0.81, 0.78, 0.94);
  vec3 sky = vec3(0.66, 0.80, 0.94);
  vec3 color = mix(pearl, sage, smoothstep(0.28, 0.83, f));
  color = mix(color, lilac, smoothstep(0.32, 0.85, length(q)) * 0.65);
  color = mix(color, sky, smoothstep(0.55, 0.95, w.x) * 0.5 + influence * 0.16);
  // Calm center preserves headline contrast; flow remains visible at the edges.
  float center = exp(-3.6 * length((uv - vec2(0.5, 0.52)) * vec2(1.0, 1.25)));
  color = mix(color, vec3(1.0), center * 0.7);
  color += (hash(gl_FragCoord.xy) - 0.5) * 0.009;
  float fade = smoothstep(0.0, 0.16, uv.y);
  gl_FragColor = vec4(mix(vec3(1.0), color, fade), 1.0);
}`;

export default function FluidBackdrop({ paused = false }) {
  const ref = useRef(null);
  const pausedRef = useRef(paused);
  const syncRef = useRef(null);
  useEffect(() => { pausedRef.current = paused; syncRef.current?.(); }, [paused]);

  useEffect(() => {
    const canvas = ref.current, host = canvas.parentElement.parentElement;
    let gl;
    try { gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, powerPreference: "low-power" }); }
    catch { return undefined; }
    if (!gl) return undefined; // CSS fluid field stays visible without WebGL.
    // The noise hash needs fractional precision beyond 16-bit mediump floats.
    // Older mobile GPUs use the static CSS field instead of a banded shader.
    if (!gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision) return undefined;
    const shaders = [];
    let program, buffer;
    const dispose = () => {
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      shaders.forEach((shader) => gl.deleteShader(shader));
    };
    try {
      const compile = (kind, source) => {
        const shader = gl.createShader(kind);
        if (!shader) throw new Error("Shader unavailable");
        shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Shader compilation failed");
        return shader;
      };
      program = gl.createProgram();
      if (!program) throw new Error("Program unavailable");
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Shader linking failed");
      gl.useProgram(program);
      buffer = gl.createBuffer();
      if (!buffer) throw new Error("Buffer unavailable");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    } catch { dispose(); return undefined; }

    const resolution = gl.getUniformLocation(program, "resolution");
    const time = gl.getUniformLocation(program, "time");
    const pointerUniform = gl.getUniformLocation(program, "pointer");
    const scroll = gl.getUniformLocation(program, "scroll");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = matchMedia("(pointer: coarse)");
    const pointer = { x: .5, y: .5, targetX: .5, targetY: .5 };
    let frame = 0, visible = false, lost = false, elapsed = 0, last = 0;
    const canAnimate = () => visible && !document.hidden && !reduced.matches && !pausedRef.current && !lost;
    const paint = () => {
      if (lost) return;
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(time, elapsed);
      gl.uniform2f(pointerUniform, pointer.x, pointer.y);
      gl.uniform1f(scroll, reduced.matches || pausedRef.current ? 0 : window.scrollY);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      canvas.dataset.ready = "true";
    };
    const animate = (now) => {
      // Recheck here too: media/visibility changes can precede their events.
      if (!canAnimate()) { sync(); return; }
      const delta = now - last;
      if (delta >= (coarse.matches ? 1000 / 24 : 1000 / 30)) {
        elapsed += Math.min(delta, 100) / 1000;
        pointer.x += (pointer.targetX - pointer.x) * .08;
        pointer.y += (pointer.targetY - pointer.y) * .08;
        last = now; paint();
      }
      frame = requestAnimationFrame(animate);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      const active = canAnimate();
      host.classList.toggle("is-motion-active", active);
      canvas.dataset.motion = active ? "running" : "paused";
      if (active) { last = performance.now(); frame = requestAnimationFrame(animate); }
      else if (!pausedRef.current) { pointer.x = pointer.y = .5; paint(); }
    };
    syncRef.current = sync;
    const resize = new ResizeObserver(() => {
      const scale = coarse.matches ? .6 : Math.min(devicePixelRatio || 1, 1.5) * .65;
      canvas.width = Math.max(1, Math.round(host.clientWidth * scale));
      canvas.height = Math.max(1, Math.round(host.clientHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height); paint();
    });
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    const move = (event) => {
      if (coarse.matches || reduced.matches || pausedRef.current) return;
      const box = host.getBoundingClientRect();
      pointer.targetX = (event.clientX - box.left) / box.width;
      pointer.targetY = 1 - (event.clientY - box.top) / box.height;
    };
    const leave = () => { pointer.targetX = pointer.targetY = .5; };
    const contextLost = () => { lost = true; canvas.dataset.ready = "false"; sync(); };
    resize.observe(host); observer.observe(host);
    host.addEventListener("pointermove", move, { passive: true }); host.addEventListener("pointerleave", leave);
    canvas.addEventListener("webglcontextlost", contextLost);
    document.addEventListener("visibilitychange", sync); reduced.addEventListener("change", sync);
    return () => {
      syncRef.current = null;
      cancelAnimationFrame(frame); resize.disconnect(); observer.disconnect(); dispose();
      delete canvas.dataset.ready; host.classList.remove("is-motion-active");
      host.removeEventListener("pointermove", move); host.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("webglcontextlost", contextLost);
      document.removeEventListener("visibilitychange", sync); reduced.removeEventListener("change", sync);
    };
  }, []);
  return <div className="download-fluid-field" aria-hidden="true"><canvas ref={ref} className="download-fluid-canvas" /></div>;
}
