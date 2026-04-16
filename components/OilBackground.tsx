"use client";

import { useEffect, useRef } from "react";

// ── Vertex Shader ─────────────────────────────────────────────────────────────
const VS = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// ── Fragment Shader ───────────────────────────────────────────────────────────
const FS = `
precision mediump float;
uniform float u_time;
uniform vec2  u_res;

// Hash / noise
float h21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(h21(i), h21(i + vec2(1,0)), u.x),
    mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), u.x),
    u.y
  ) * 2.0 - 1.0;
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
  return v;
}

// Smooth minimum for metaball blending
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Metaball field — large blobs stay near edges, small blobs drift in center
float field(vec2 p, float t) {
  float d = 1e5;
  // Outer large blobs
  d = smin(d, length(p - vec2( cos(t*0.31)*0.76,  sin(t*0.23)*0.55)) - 0.38, 0.28);
  d = smin(d, length(p - vec2( cos(t*0.19+2.1)*0.82, sin(t*0.27+1.3)*0.61)) - 0.34, 0.28);
  d = smin(d, length(p - vec2( cos(t*0.24+4.2)*0.71, sin(t*0.21+2.7)*0.66)) - 0.32, 0.28);
  d = smin(d, length(p - vec2( cos(t*0.17+1.0)*0.86, sin(t*0.29+0.5)*0.52)) - 0.27, 0.28);
  d = smin(d, length(p - vec2( cos(t*0.22+3.3)*0.78, sin(t*0.18+3.8)*0.58)) - 0.30, 0.28);
  // Inner small blobs (calm center)
  d = smin(d, length(p - vec2( cos(t*0.13)*0.20,  sin(t*0.18+1.0)*0.18)) - 0.12, 0.15);
  d = smin(d, length(p - vec2( cos(t*0.11+2.0)*0.25, sin(t*0.15)*0.22)) - 0.10, 0.15);
  d = smin(d, length(p - vec2( cos(t*0.09+4.5)*0.18, sin(t*0.12+2.3)*0.20)) - 0.09, 0.12);
  return d;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - u_res * 0.5) / min(u_res.x, u_res.y);
  float t = u_time * 0.22;

  // Organic noise distortion
  float nois = fbm(uv * 2.8 + t * 0.35) * 0.07;
  float d = field(uv + nois, t);

  // Surface normal from SDF gradient (for lighting)
  float eps = 0.006;
  vec2 g = vec2(
    field(uv + vec2(eps, 0.0), t) - field(uv - vec2(eps, 0.0), t),
    field(uv + vec2(0.0, eps), t) - field(uv - vec2(0.0, eps), t)
  ) / (2.0 * eps);
  vec3 norm = normalize(vec3(-g, 0.45));

  // Lighting — single key light, slight rim
  vec3 ld   = normalize(vec3(0.5, 0.8, 1.0));
  vec3 view = vec3(0.0, 0.0, 1.0);
  float diff = max(dot(norm, ld), 0.0);
  float spec = pow(max(dot(normalize(ld + view), norm), 0.0), 40.0);
  float rim  = pow(1.0 - max(dot(view, norm), 0.0), 3.0);

  // Colors
  vec3 bg     = vec3(0.04, 0.04, 0.06);
  vec3 oilCol = vec3(0.10, 0.11, 0.14);
  vec3 specCol = vec3(0.65, 0.70, 0.90);

  float fill = smoothstep(0.025, -0.025, d);
  float edge = smoothstep(0.10, 0.0, abs(d));

  // Subtle iridescent shimmer
  float irid = sin(d * 28.0 + t * 1.5) * 0.5 + 0.5;

  vec3 col = bg;
  col = mix(col, oilCol, fill);
  col += diff * 0.07 * fill;
  col += spec * 0.42 * fill * specCol;
  col += rim  * 0.04 * fill * specCol;
  col += edge * 0.025 * specCol;
  col += fill * irid * 0.018 * vec3(0.25, 0.10, 0.45);

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function OilBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      antialias: false,
      powerPreference: "low-power",
      alpha: false,
    });
    if (!gl) return;

    function compile(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      return s;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // Full-screen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    const posLoc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRes  = gl.getUniformLocation(prog, "u_res");

    // Low resolution for performance (upscaled via CSS)
    const SCALE = typeof window !== "undefined" && window.devicePixelRatio > 1 ? 0.35 : 0.5;

    function resize() {
      const w = Math.max(1, Math.floor(canvas!.offsetWidth  * SCALE));
      const h = Math.max(1, Math.floor(canvas!.offsetHeight * SCALE));
      canvas!.width  = w;
      canvas!.height = h;
      gl!.viewport(0, 0, w, h);
      gl!.uniform2f(uRes, w, h);
    }
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    const start = performance.now();
    let visible = true;

    function draw() {
      raf = requestAnimationFrame(draw);
      if (!visible) return;
      gl!.uniform1f(uTime, (performance.now() - start) / 1000);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    }
    raf = requestAnimationFrame(draw);

    const onVis = () => { visible = !document.hidden; };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ zIndex: 0, imageRendering: "auto" }}
    />
  );
}
