"use client";

import { useEffect, useRef } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────
const SIM_RES        = 128;
const PRESSURE_ITER  = 20;
const SPLAT_R        = 0.003;
const VEL_DISS       = 0.995;
const DYE_DISS       = 0.999;
const VEL_SCALE      = 35;

// ─── Shaders ──────────────────────────────────────────────────────────────────
const VS = `#version 300 es
in vec2 a;out vec2 uv;
void main(){gl_Position=vec4(a,0,1);uv=a*.5+.5;}`;

const FS_SPLAT = `#version 300 es
precision highp float;
in vec2 uv;out vec4 o;
uniform sampler2D tgt;
uniform float ar,radius;
uniform vec2 pt;
uniform vec3 col;
void main(){
  vec2 p=(uv-pt)*vec2(ar,1.);
  o=vec4(texture(tgt,uv).rgb+exp(-dot(p,p)/radius)*col,1.);
}`;

const FS_ADVECT = `#version 300 es
precision highp float;
in vec2 uv;out vec4 o;
uniform sampler2D vel,src;
uniform float dt,diss;
void main(){
  o=vec4(diss*texture(src,uv-dt*texture(vel,uv).xy).rgb,1.);
}`;

const FS_DIV = `#version 300 es
precision mediump float;
in vec2 uv;out vec4 o;
uniform sampler2D vel;uniform vec2 ts;
void main(){
  float L=texture(vel,uv-vec2(ts.x,0)).x,R=texture(vel,uv+vec2(ts.x,0)).x;
  float B=texture(vel,uv-vec2(0,ts.y)).y,T=texture(vel,uv+vec2(0,ts.y)).y;
  o=vec4(.5*(R-L+T-B),0,0,1);
}`;

const FS_PRESSURE = `#version 300 es
precision mediump float;
in vec2 uv;out vec4 o;
uniform sampler2D p,div;uniform vec2 ts;
void main(){
  float L=texture(p,uv-vec2(ts.x,0)).x,R=texture(p,uv+vec2(ts.x,0)).x;
  float B=texture(p,uv-vec2(0,ts.y)).x,T=texture(p,uv+vec2(0,ts.y)).x;
  o=vec4((L+R+B+T-texture(div,uv).x)*.25,0,0,1);
}`;

const FS_GRAD = `#version 300 es
precision mediump float;
in vec2 uv;out vec4 o;
uniform sampler2D p,vel;uniform vec2 ts;
void main(){
  float L=texture(p,uv-vec2(ts.x,0)).x,R=texture(p,uv+vec2(ts.x,0)).x;
  float B=texture(p,uv-vec2(0,ts.y)).x,T=texture(p,uv+vec2(0,ts.y)).x;
  o=vec4(texture(vel,uv).xy-.5*vec2(R-L,T-B),0,1);
}`;

const FS_RENDER = `#version 300 es
precision mediump float;
in vec2 uv;out vec4 o;
uniform sampler2D dye;
void main(){
  float lum=length(texture(dye,uv).rgb)*.75;
  o=vec4(vec3(.04,.04,.06)+lum*vec3(.78,.88,1.),1.);
}`;

// ─── Component ────────────────────────────────────────────────────────────────
export default function FluidBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      antialias: false, powerPreference: "default", alpha: false,
    }) as WebGL2RenderingContext | null;
    if (!gl) return;

    // ── Helpers ──────────────────────────────────────────────────────────────
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s); return s;
    };
    const mkProg = (vs: string, fs: string) => {
      const p = gl.createProgram()!;
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p); return p;
    };
    const ul = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);

    // ── FBO ──────────────────────────────────────────────────────────────────
    const mkFBO = (w: number, h: number) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.viewport(0, 0, w, h); gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT);
      return { t, fb };
    };
    const mkPing = (w: number, h: number) => {
      let r = mkFBO(w, h), w2 = mkFBO(w, h);
      return { get r(){ return r; }, get w(){ return w2; }, swap(){ [r,w2]=[w2,r]; } };
    };

    // ── Setup ─────────────────────────────────────────────────────────────────
    const pSplat  = mkProg(VS, FS_SPLAT);
    const pAdvect = mkProg(VS, FS_ADVECT);
    const pDiv    = mkProg(VS, FS_DIV);
    const pPress  = mkProg(VS, FS_PRESSURE);
    const pGrad   = mkProg(VS, FS_GRAD);
    const pRender = mkProg(VS, FS_RENDER);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);

    const bq = (p: WebGLProgram) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const l = gl.getAttribLocation(p, "a");
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    };

    const mobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    const DYE_RES = mobile ? 256 : 512;

    const fVel  = mkPing(SIM_RES, SIM_RES);
    const fDye  = mkPing(DYE_RES, DYE_RES);
    const fDiv  = mkFBO(SIM_RES, SIM_RES);
    const fPres = mkPing(SIM_RES, SIM_RES);

    // ── Splat ─────────────────────────────────────────────────────────────────
    const splat = (x: number, y: number, dx: number, dy: number) => {
      const ar = canvas.clientWidth / canvas.clientHeight;
      gl.useProgram(pSplat); bq(pSplat);
      gl.uniform1f(ul(pSplat,"ar"), ar);
      gl.uniform2f(ul(pSplat,"pt"), x, y);
      gl.uniform1f(ul(pSplat,"radius"), SPLAT_R);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fVel.w.fb);
      gl.viewport(0, 0, SIM_RES, SIM_RES);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fVel.r.t);
      gl.uniform1i(ul(pSplat,"tgt"), 0);
      gl.uniform3f(ul(pSplat,"col"), dx, dy, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      fVel.swap();

      gl.bindFramebuffer(gl.FRAMEBUFFER, fDye.w.fb);
      gl.viewport(0, 0, DYE_RES, DYE_RES);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fDye.r.t);
      gl.uniform3f(ul(pSplat,"col"), 1, 1, 1);
      gl.uniform1f(ul(pSplat,"radius"), SPLAT_R * 0.6);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      fDye.swap();
    };

    // ── Step ──────────────────────────────────────────────────────────────────
    const step = (dt: number) => {
      const ts: [number, number] = [1/SIM_RES, 1/SIM_RES];

      // Advect velocity
      gl.useProgram(pAdvect); bq(pAdvect);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fVel.w.fb);
      gl.viewport(0, 0, SIM_RES, SIM_RES);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fVel.r.t);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fVel.r.t);
      gl.uniform1i(ul(pAdvect,"vel"), 0); gl.uniform1i(ul(pAdvect,"src"), 1);
      gl.uniform1f(ul(pAdvect,"dt"), dt); gl.uniform1f(ul(pAdvect,"diss"), VEL_DISS);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); fVel.swap();

      // Divergence
      gl.useProgram(pDiv); bq(pDiv);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fDiv.fb);
      gl.viewport(0, 0, SIM_RES, SIM_RES);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fVel.r.t);
      gl.uniform1i(ul(pDiv,"vel"), 0); gl.uniform2f(ul(pDiv,"ts"), ...ts);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Pressure
      gl.useProgram(pPress); bq(pPress);
      gl.uniform2f(ul(pPress,"ts"), ...ts);
      for (let i = 0; i < PRESSURE_ITER; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fPres.w.fb);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fPres.r.t);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fDiv.t);
        gl.uniform1i(ul(pPress,"p"), 0); gl.uniform1i(ul(pPress,"div"), 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); fPres.swap();
      }

      // Gradient subtract
      gl.useProgram(pGrad); bq(pGrad);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fVel.w.fb);
      gl.viewport(0, 0, SIM_RES, SIM_RES);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fPres.r.t);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fVel.r.t);
      gl.uniform1i(ul(pGrad,"p"), 0); gl.uniform1i(ul(pGrad,"vel"), 1);
      gl.uniform2f(ul(pGrad,"ts"), ...ts);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); fVel.swap();

      // Advect dye
      gl.useProgram(pAdvect); bq(pAdvect);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fDye.w.fb);
      gl.viewport(0, 0, DYE_RES, DYE_RES);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fVel.r.t);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fDye.r.t);
      gl.uniform1i(ul(pAdvect,"vel"), 0); gl.uniform1i(ul(pAdvect,"src"), 1);
      gl.uniform1f(ul(pAdvect,"dt"), dt); gl.uniform1f(ul(pAdvect,"diss"), DYE_DISS);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); fDye.swap();
    };

    // ── Render ────────────────────────────────────────────────────────────────
    const render = () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(pRender); bq(pRender);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fDye.r.t);
      gl.uniform1i(ul(pRender,"dye"), 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    // ── Loop ─────────────────────────────────────────────────────────────────
    let raf = 0, lastT = performance.now(), visible = true;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      const now = performance.now();
      step(Math.min((now - lastT) * 0.001, 0.016));
      lastT = now;
      render();
    };
    raf = requestAnimationFrame(loop);

    // ── Input ─────────────────────────────────────────────────────────────────
    let lx = 0.5, ly = 0.5, down = false;
    const xy = (e: PointerEvent): [number, number] =>
      [e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight];

    const onDown = (e: PointerEvent) => { down = true; [lx, ly] = xy(e); };
    const onMove = (e: PointerEvent) => {
      const [x, y] = xy(e);
      if (down) splat(x, y, (x-lx)*VEL_SCALE, (y-ly)*VEL_SCALE);
      lx = x; ly = y;
    };
    const onUp = () => { down = false; };

    // Touch (mobile drag)
    let ltx = 0.5, lty = 0.5;
    const txy = (t: Touch): [number, number] =>
      [t.clientX / window.innerWidth, 1 - t.clientY / window.innerHeight];
    const onTStart = (e: TouchEvent) => { [ltx, lty] = txy(e.touches[0]); };
    const onTMove  = (e: TouchEvent) => {
      e.preventDefault();
      const [x, y] = txy(e.touches[0]);
      splat(x, y, (x-ltx)*VEL_SCALE, (y-lty)*VEL_SCALE);
      ltx = x; lty = y;
    };

    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup",   onUp);
    document.addEventListener("touchstart",  onTStart, { passive: true });
    document.addEventListener("touchmove",   onTMove,  { passive: false });

    // ── Resize ────────────────────────────────────────────────────────────────
    const resize = () => { canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const onVis = () => { visible = !document.hidden; };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup",   onUp);
      document.removeEventListener("touchstart",  onTStart);
      document.removeEventListener("touchmove",   onTMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="fixed inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  );
}
