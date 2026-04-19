'use client';

import { useEffect, useRef } from 'react';

const VERT_SRC = `attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG_SRC = `
precision highp float;
uniform float u_time;
uniform vec2 u_res;
uniform float u_driftSpeed;
uniform float u_starDensity;
uniform vec2 u_mouse;

#define PI 3.14159265359
#define TAU 6.28318530718

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash1(float n) { return fract(sin(n) * 43758.5453123); }
vec2 hash2(vec2 p) {
  return vec2(
    fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453),
    fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453)
  );
}

float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1,0)), c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}

float fbm(vec2 p, int octaves) {
  float val = 0.0, amp = 0.5, freq = 1.0;
  for (int i = 0; i < 7; i++) {
    if (i >= octaves) break;
    val += amp * noise(p * freq);
    freq *= 2.03; amp *= 0.49; p += vec2(1.7, 9.2);
  }
  return val;
}

float warpedFbm(vec2 p, float t) {
  vec2 q = vec2(fbm(p + t*0.02, 5), fbm(p + vec2(5.2,1.3) + t*0.015, 5));
  vec2 r = vec2(fbm(p + 3.5*q + vec2(1.7,9.2) + t*0.01, 6), fbm(p + 3.5*q + vec2(8.3,2.8) + t*0.012, 6));
  return fbm(p + 3.0*r, 7);
}

vec3 backgroundNebula(vec2 uv, float t) {
  vec2 p = uv * 1.8;
  float n1 = warpedFbm(p, t);
  float n2 = warpedFbm(p + vec2(4.3, 7.1), t*0.8);
  vec3 col = mix(vec3(0.06,0.02,0.10), vec3(0.03,0.03,0.09), n1);
  col = mix(col, vec3(0.08,0.03,0.07), n2*0.5);
  col = mix(col, vec3(0.04,0.02,0.08), smoothstep(0.3,0.7,n1*n2)*0.6);
  col += smoothstep(0.35,0.65,n1) * 0.06;
  return col;
}

vec3 auroraRibbons(vec2 uv, float t) {
  vec3 col = vec3(0.0);
  float drift = u_driftSpeed;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float yOffset = -0.4 + fi*0.25 + sin(fi*1.7)*0.1;
    vec2 warpP = uv * vec2(1.5,2.0) + vec2(t*0.03*drift + fi*3.0, fi*2.7);
    float warpX = fbm(warpP, 5) * 0.4;
    float warpY = fbm(warpP + vec2(3.3,7.7), 5) * 0.3;
    vec2 warped = vec2(uv.x + warpX, uv.y + warpY);
    float ribbonNoise = fbm(vec2(warped.x*2.5 + t*0.04*drift, warped.y*3.0 + yOffset) + fi*5.0, 6);
    float ridged = pow(1.0 - abs(ribbonNoise*2.0 - 1.0), 4.0);
    float ribbonNoise2 = fbm(vec2(warped.x*4.0 - t*0.025*drift, warped.y*5.0 + yOffset*1.5) + fi*8.0, 5);
    float ridged2 = pow(1.0 - abs(ribbonNoise2*2.0 - 1.0), 5.0);
    float ribbon = ridged*0.7 + ridged2*0.3;
    // All purple-violet palette
    vec3 bandColor;
    if (i == 0)      bandColor = vec3(0.55, 0.45, 0.88);  // lavender
    else if (i == 1) bandColor = vec3(0.65, 0.40, 0.80);  // violet
    else if (i == 2) bandColor = vec3(0.45, 0.35, 0.90);  // deep indigo-purple
    else             bandColor = vec3(0.70, 0.45, 0.75);  // rose-purple
    float breath = 0.6 + 0.4*sin(t*0.08 + fi*1.3);
    col += bandColor * ribbon * breath * 0.08;
  }
  return col;
}

float starLayer(vec2 uv, float scale, float threshold, float t, float speed, float seed) {
  vec2 p = uv * scale;
  p.y += t * speed * u_driftSpeed;
  p.x += t * speed * u_driftSpeed * 0.3 + sin(t*0.05)*0.2;
  vec2 cell = floor(p); vec2 f = fract(p);
  float stars = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 neighbor = vec2(float(dx),float(dy));
      vec2 cellId = cell + neighbor;
      vec2 starCenter = hash2(cellId + seed);
      vec2 diff = neighbor + starCenter - f;
      float dist = length(diff);
      float present = step(threshold, hash(cellId*0.7 + seed + 77.0));
      float brightness = hash(cellId*1.3 + seed + 33.0);
      float twinklePhase = hash(cellId*2.1 + seed + 99.0) * TAU;
      float twinkleSpeed = 0.8 + hash(cellId*3.7 + seed + 55.0) * 2.0;
      float twinkle = 0.5 + 0.5*sin(t*twinkleSpeed + twinklePhase);
      float starSize = 0.015 + brightness*0.02;
      float core = smoothstep(starSize, starSize*0.1, dist);
      float glow = exp(-dist*dist / (starSize*starSize*4.0));
      stars += (core*1.2 + glow*0.4) * brightness * twinkle * present;
    }
  }
  return stars * u_starDensity;
}

float starFlare(vec2 uv, float scale, float t, float seed) {
  vec2 p = uv*scale; p.y += t*0.12*u_driftSpeed; p.x += t*0.04*u_driftSpeed;
  vec2 cell = floor(p); vec2 f = fract(p); float flare = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 neighbor = vec2(float(dx),float(dy));
      vec2 cellId = cell + neighbor;
      vec2 diff = neighbor + hash2(cellId + seed) - f;
      float dist = length(diff);
      float isBright = step(0.82, hash(cellId*1.3 + seed + 33.0));
      float present = step(0.7, hash(cellId*0.7 + seed + 77.0));
      float flarePhase = hash(cellId*4.1 + seed + 111.0) * TAU;
      float flareRate = 0.3 + hash(cellId*5.3 + seed + 222.0)*0.4;
      float flarePulse = pow(max(sin(t*flareRate + flarePhase), 0.0), 12.0);
      float haloSize = 0.08 + flarePulse*0.06;
      float halo = exp(-dist*dist / (haloSize*haloSize));
      flare += halo * flarePulse * isBright * present;
    }
  }
  return flare * u_starDensity;
}

float travelingWave(vec2 uv, float t) {
  float diag = uv.x*0.7 + uv.y*0.3;
  float wavePos = fract(t/5.0)*3.0 - 1.0;
  float wavePos2 = fract((t+2.5)/6.5)*3.0 - 1.0;
  float wave = exp(-(diag-wavePos)*(diag-wavePos)/0.1225);
  float wave2 = exp(-(diag-wavePos2)*(diag-wavePos2)/0.3);
  return wave*0.35 + wave2*0.2;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - u_res*0.5) / min(u_res.x, u_res.y);
  float t = u_time;

  vec3 col = backgroundNebula(uv, t);
  col += auroraRibbons(uv, t);

  float farStars = starLayer(uv, 35.0, 0.35, t, 0.02, 0.0);
  col += vec3(0.65,0.70,0.95) * farStars * 0.14;

  float midStars = starLayer(uv, 18.0, 0.45, t, 0.06, 100.0);
  col += vec3(0.80,0.65,0.90) * midStars * 0.24;

  float nearStars = starLayer(uv, 8.0, 0.65, t, 0.12, 200.0);
  col += vec3(0.85,0.72,1.00) * nearStars * 0.28;

  float flares = starFlare(uv, 8.0, t, 200.0);
  col += vec3(0.80,0.70,1.0) * flares * 0.28;

  float wave = travelingWave(uv, t);
  col *= 1.0 + wave * 0.4;
  col += vec3(0.60,0.50,0.90) * wave * 0.02;

  float shimmer = noise(uv*12.0 + t*0.5) * noise(uv*8.0 - t*0.3);
  col += vec3(0.70,0.60,0.90) * shimmer * 0.012;

  float dist = length(uv);
  float vignette = 1.0 - smoothstep(0.5, 1.4, dist);
  col *= 0.7 + vignette*0.3;

  float grain = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)) + fract(t*0.1)*100.0)*43758.5453) - 0.5)*0.010;
  col += grain;

  col = max(col, vec3(0.0));
  col = col / (col + 0.85) * 1.15;
  col = pow(col, vec3(0.97,1.0,1.04));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export function StardustVeilHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const canvas = canvasRef.current!;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: false })!;
    if (!gl) return;

    function compile(type: number, src: string) {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s); return s;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(prog); gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uDrift = gl.getUniformLocation(prog, 'u_driftSpeed');
    const uDensity = gl.getUniformLocation(prog, 'u_starDensity');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let mouseX = -1, mouseY = -1;
    let animId = 0;
    let running = true;

    function resize() {
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(uRes, w, h);
      }
    }

    function render(now: number) {
      if (!running) return;
      resize();
      gl.uniform1f(uTime, prefersReduced ? 0.0 : now * 0.001);
      gl.uniform1f(uDrift, 0.4);
      gl.uniform1f(uDensity, 0.60);
      gl.uniform2f(uMouse, mouseX, mouseY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      animId = requestAnimationFrame(render);
    }

    resize();
    animId = requestAnimationFrame(render);

    const onResize = () => resize();
    const onMouseMove = (e: MouseEvent) => { mouseX = e.clientX * dpr; mouseY = (canvas.clientHeight / dpr - e.clientY) * dpr; };
    const onMouseLeave = () => { mouseX = -1; mouseY = -1; };
    const onVisibility = () => { if (document.hidden) { running = false; } else { running = true; animId = requestAnimationFrame(render); } };

    window.addEventListener('resize', onResize);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteProgram(prog);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
