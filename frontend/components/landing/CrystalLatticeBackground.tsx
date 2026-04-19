'use client';

import { useEffect, useRef } from 'react';

const FRAG_SRC = `
precision highp float;
uniform float u_time;
uniform vec2 u_res;
uniform float u_growthSpeed;
uniform float u_refraction;
uniform float u_rotX;
uniform float u_rotY;
uniform vec2 u_center;
uniform float u_scale;

#define PI 3.14159265359
#define TAU 6.28318530718
#define MAX_STEPS 48
#define MAX_DIST 25.0
#define SURF_DIST 0.004

mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float hash(float n) { return fract(sin(n) * 43758.5453123); }
float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = i.x + i.y * 157.0 + i.z * 113.0;
  return mix(
    mix(mix(hash(n), hash(n+1.0), f.x), mix(hash(n+157.0), hash(n+158.0), f.x), f.y),
    mix(mix(hash(n+113.0), hash(n+114.0), f.x), mix(hash(n+270.0), hash(n+271.0), f.x), f.y),
    f.z);
}

float sdHexPrism(vec3 p, vec2 h) {
  vec3 q = abs(p);
  float d1 = q.z - h.y;
  float d2 = max(q.x * 0.866025 + q.y * 0.5, q.y) - h.x;
  return min(max(d1, d2), 0.0) + length(max(vec2(d1, d2), 0.0));
}

float crystalShaft(vec3 p, float radius, float height, float pointiness) {
  float taperLen = min(radius * pointiness, height * 0.4);
  p.y -= height * 0.5;
  float body = sdHexPrism(p.xzy, vec2(radius, height * 0.5));
  float tipLocal = height * 0.5;
  float slope = radius / taperLen;
  vec3 q = abs(p);
  float hexDist = max(q.x * 0.866025 + q.z * 0.5, q.z);
  float pyramid = hexDist - max(0.0, tipLocal - p.y) * slope;
  return max(body, pyramid);
}

float sceneSDF(vec3 p, float t) {
  float d = MAX_DIST;
  float density = u_growthSpeed;
  float ga = smoothstep(0.0, 2.5, t);
  { vec3 cp = p - vec3(0.0, -1.0, 0.0); cp.xz = rot2(0.05) * cp.xz; d = min(d, crystalShaft(cp, 0.5*ga, 2.8*ga, 2.2)); }
  if (density > 0.3) { vec3 cp = p - vec3(0.4, -1.0, 0.1); cp.xy = rot2(-0.3)*cp.xy; cp.xz = rot2(0.2)*cp.xz; d = min(d, crystalShaft(cp, 0.4*ga, 2.2*ga, 2.0)); }
  if (density > 0.3) { vec3 cp = p - vec3(-0.45,-1.0,-0.1); cp.xy = rot2(0.35)*cp.xy; cp.xz = rot2(-0.3)*cp.xz; d = min(d, crystalShaft(cp, 0.38*ga, 2.0*ga, 1.9)); }
  if (density > 0.5) { vec3 cp = p - vec3(0.1,-1.0,-0.5); cp.yz = rot2(-0.3)*cp.yz; cp.xz = rot2(0.5)*cp.xz; d = min(d, crystalShaft(cp, 0.32*ga, 1.8*ga, 2.3)); }
  if (density > 0.5) { vec3 cp = p - vec3(-0.5,-1.0,-0.4); cp.xy = rot2(0.35)*cp.xy; cp.yz = rot2(-0.25)*cp.yz; d = min(d, crystalShaft(cp, 0.3*ga, 1.5*ga, 2.0)); }
  if (density > 0.8) { vec3 cp = p - vec3(-0.35,-1.0,0.45); cp.xy = rot2(0.4)*cp.xy; cp.yz = rot2(0.3)*cp.yz; d = min(d, crystalShaft(cp, 0.26*ga, 1.3*ga, 2.1)); }
  if (density > 0.8) { vec3 cp = p - vec3(0.5,-1.0,0.35); cp.xy = rot2(-0.5)*cp.xy; cp.xz = rot2(-0.2)*cp.xz; d = min(d, crystalShaft(cp, 0.22*ga, 1.0*ga, 2.4)); }
  if (density > 1.0) {
    { vec3 cp = p-vec3(0.65,-1.0,0.3); cp.xy=rot2(-0.6)*cp.xy; cp.xz=rot2(0.8)*cp.xz; d=min(d,crystalShaft(cp,0.12*ga,0.5*ga,2.0)); }
    { vec3 cp = p-vec3(-0.6,-1.0,0.5); cp.xy=rot2(0.55)*cp.xy; cp.xz=rot2(-0.6)*cp.xz; d=min(d,crystalShaft(cp,0.1*ga,0.4*ga,2.2)); }
    { vec3 cp = p-vec3(0.3,-1.0,-0.6); cp.xy=rot2(-0.4)*cp.xy; cp.yz=rot2(-0.5)*cp.yz; d=min(d,crystalShaft(cp,0.14*ga,0.55*ga,1.8)); }
    { vec3 cp = p-vec3(-0.25,-1.0,-0.55); cp.xy=rot2(0.5)*cp.xy; cp.yz=rot2(-0.35)*cp.yz; d=min(d,crystalShaft(cp,0.11*ga,0.45*ga,2.1)); }
  }
  return d;
}

float march(vec3 ro, vec3 rd, float t) {
  float d = 0.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    float ds = sceneSDF(ro + rd * d, t);
    d += ds;
    if (ds < SURF_DIST || d > MAX_DIST) break;
  }
  return d;
}

vec3 getNormal(vec3 p, float t) {
  const vec2 e = vec2(0.008, -0.008);
  return normalize(
    e.xyy * sceneSDF(p+e.xyy,t) + e.yyx * sceneSDF(p+e.yyx,t) +
    e.yxy * sceneSDF(p+e.yxy,t) + e.xxx * sceneSDF(p+e.xxx,t));
}

vec3 spectral(float t) {
  t = fract(t); vec3 c;
  if (t < 0.17) c = mix(vec3(0.4,0.0,0.8), vec3(0.2,0.2,1.0), t/0.17);
  else if (t < 0.33) c = mix(vec3(0.2,0.2,1.0), vec3(0.1,0.7,1.0), (t-0.17)/0.16);
  else if (t < 0.5)  c = mix(vec3(0.1,0.7,1.0), vec3(0.4,0.2,1.0), (t-0.33)/0.17);
  else if (t < 0.67) c = mix(vec3(0.4,0.2,1.0), vec3(0.7,0.3,1.0), (t-0.5)/0.17);
  else if (t < 0.83) c = mix(vec3(0.7,0.3,1.0), vec3(0.5,0.1,0.9), (t-0.67)/0.16);
  else c = mix(vec3(0.5,0.1,0.9), vec3(0.3,0.0,0.7), (t-0.83)/0.17);
  return c;
}

float fresnel(vec3 rd, vec3 n, float ior) {
  float cosI = abs(dot(rd, n));
  float r0 = (1.0-ior)/(1.0+ior); r0 = r0*r0;
  return r0 + (1.0-r0)*pow(1.0-cosI, 5.0);
}

vec3 internalColor(vec3 p, vec3 rd, vec3 n, float t) {
  float ior = 1.55;
  vec3 refractDir = refract(rd, n, 1.0/ior);
  if (length(refractDir) < 0.01) refractDir = reflect(rd, n);
  float sd = sceneSDF(p - n*0.3, t);
  float pathLen = clamp(-sd*3.0+0.3, 0.1, 1.0);
  float cr = pathLen*1.95 + dot(refractDir, vec3(1.0,0.3,0.2))*0.55;
  float cg = pathLen*2.0  + dot(refractDir, vec3(0.3,1.0,0.2))*0.55;
  float cb = pathLen*2.05 + dot(refractDir, vec3(0.2,0.3,1.0))*0.55;
  vec3 prism = vec3(spectral(cr*0.3+t*0.05).r, spectral(cg*0.3+t*0.05).g, spectral(cb*0.3+t*0.05).b);
  // Purple-tinted absorption
  vec3 absorption = exp(-pathLen * vec3(1.2, 1.5, 0.3));
  return prism*0.4 + absorption*0.6;
}

float ao(vec3 p, vec3 n, float t) {
  float h1=0.05, h2=0.2;
  float d1=sceneSDF(p+n*h1,t), d2=sceneSDF(p+n*h2,t);
  return clamp(1.0 - 1.5*((h1-d1)+(h2-d2)*0.5), 0.0, 1.0);
}

void main() {
  vec2 origin = u_scale > 0.0 ? u_center : vec2(0.5);
  float sc = u_scale > 0.0 ? u_scale : 1.0;
  vec2 uv = (gl_FragCoord.xy - u_res*origin) / (min(u_res.x, u_res.y)*sc);
  float t = u_time;
  float slowT = t * 0.2;

  float camAngle = slowT*0.3 + u_rotX;
  float camRadius = 5.5;
  float camHeight = clamp(1.0 + sin(slowT*0.4)*0.4 + u_rotY, -1.5, 4.0);
  vec3 ro = vec3(sin(camAngle)*camRadius, camHeight, cos(camAngle)*camRadius);
  vec3 target = vec3(0.0, -0.3, 0.0);
  vec3 fwd = normalize(target - ro);
  vec3 right = normalize(cross(fwd, vec3(0,1,0)));
  vec3 up = cross(right, fwd);
  vec3 rd = normalize(fwd*1.1 + right*uv.x + up*uv.y);

  // Purple-themed lights
  vec3 light1Dir = normalize(vec3(0.8, 1.2, 0.6));
  vec3 light1Col = vec3(0.85, 0.80, 1.0) * 1.5;   // cool white-lavender
  vec3 light2Dir = normalize(vec3(-0.5, 0.3, -0.8));
  vec3 light2Col = vec3(0.4, 0.3, 1.0) * 0.8;     // deep purple fill
  vec3 light3Dir = normalize(vec3(0.0, -0.5, 1.0));
  vec3 light3Col = vec3(0.6, 0.5, 1.0) * 0.4;

  float d = march(ro, rd, t);

  // Dark purple background
  vec3 col = vec3(0.010, 0.008, 0.025);
  float glowDist = length(uv);
  col += vec3(0.06, 0.04, 0.18) * exp(-glowDist * 1.5);
  col += vec3(0.01, 0.008, 0.02) * (1.0 - uv.y);
  float vig = 1.0 - dot(uv, uv) * 0.6;
  col *= vig;

  if (d < MAX_DIST) {
    vec3 p = ro + rd * d;
    vec3 n = getNormal(p, t);

    float diff1 = max(dot(n, light1Dir), 0.0);
    float diff2 = max(dot(n, light2Dir), 0.0);
    float diff3 = max(dot(n, light3Dir), 0.0);
    vec3 h1 = normalize(light1Dir - rd);
    vec3 h2 = normalize(light2Dir - rd);
    float spec1 = pow(max(dot(n,h1),0.0), 90.0);
    float spec2 = pow(max(dot(n,h2),0.0), 60.0);
    float fres = fresnel(rd, n, 1.55);
    float occ = ao(p, n, t);
    float sha = smoothstep(0.0, 0.5, sceneSDF(p + light1Dir*0.3, t));

    // Purple crystal base
    float heightFade = smoothstep(-1.2, 1.5, p.y);
    vec3 crystalBase = mix(vec3(0.3, 0.18, 0.85), vec3(0.55, 0.38, 1.0), heightFade);
    crystalBase += noise(p*6.0 + t*0.1) * vec3(-0.02, -0.03, 0.08);

    vec3 interior = internalColor(p, rd, n, t) * u_refraction;

    float envNoise = noise(reflect(rd,n)*3.0 + t*0.1);
    vec3 envColor = mix(vec3(0.08, 0.05, 0.28), vec3(0.25, 0.15, 0.6), envNoise);
    envColor += spectral(dot(reflect(rd,n), vec3(0.5,1.0,0.3))*0.5 + t*0.05) * 0.3 * u_refraction;

    vec3 crystalCol = mix(interior, envColor, fres*0.5);
    vec3 diffuse = crystalBase * (diff1*light1Col*sha + diff2*light2Col + diff3*light3Col);
    vec3 specular = light1Col*spec1*sha + light2Col*spec2;

    float sFlicker = sin(dot(p, vec3(13.7,7.3,11.1))*50.0 + t*3.0)*0.5 + 0.5;
    float sparkle = spec1 * sFlicker;
    vec3 sparkleCol = mix(vec3(0.85,0.80,1.0), spectral(dot(p, vec3(3.1,7.3,5.7)) + t*0.3), 0.4);

    float striation = sin(dot(p,n)*80.0 + noise(p*12.0)*6.0)*0.5 + 0.5;
    striation = smoothstep(0.3, 0.7, striation) * 0.15;
    crystalCol *= 1.0 + striation;

    col = diffuse*0.15 + crystalCol*0.75 + specular*0.7 + sparkleCol*sparkle*0.5;
    col *= occ;

    float rim = pow(1.0 - max(dot(-rd,n),0.0), 3.0);
    col += crystalBase * rim * 0.4;

    float edgeShimmer = fres * pow(max(dot(n,light1Dir),0.0), 0.5);
    vec3 prismEdge = spectral(dot(p,vec3(3.0,5.0,7.0))*0.4 + dot(n,rd)*2.0 + t*0.08);
    col += prismEdge * edgeShimmer * 0.4 * u_refraction;

    float caustic = pow(max(sin(dot(p,vec3(5.0,3.0,7.0))*4.0 + t*1.5),0.0), 8.0);
    col += spectral(dot(p,vec3(2.1,5.3,3.7))*0.5 + t*0.1) * caustic * 0.15 * u_refraction;

    float backLight = pow(clamp(dot(rd, light1Dir),0.0,1.0), 2.0);
    col += crystalBase * backLight * 0.5;
  }

  // Floating sparkles
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec3 sparkPos = vec3(sin(fi*2.37+t*0.15)*2.0, sin(fi*1.73+t*0.1)*1.5+0.5, cos(fi*3.11+t*0.12)*2.0);
    float distToRay = length(cross(sparkPos - ro, rd));
    float depthAlongRay = dot(sparkPos - ro, rd);
    if (depthAlongRay > 0.0 && depthAlongRay < d) {
      float brightness = exp(-distToRay*80.0) * 0.6;
      float flicker = sin(t*3.0 + fi*5.0)*0.5 + 0.5;
      col += vec3(0.7, 0.6, 1.0) * brightness * flicker;
    }
  }

  col = col * (2.51*col + 0.03) / (col*(2.43*col + 0.59) + 0.14);
  col = pow(col, vec3(1.0/2.2));
  gl_FragColor = vec4(col, 1.0);
}
`;

const VERT_SRC = `attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

export function CrystalLatticeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const canvas = canvasRef.current!;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, preserveDrawingBuffer: false })!;
    if (!gl) return;

    function compile(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      return s;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uGrowthSpeed = gl.getUniformLocation(prog, 'u_growthSpeed');
    const uRefraction = gl.getUniformLocation(prog, 'u_refraction');
    const uRotX = gl.getUniformLocation(prog, 'u_rotX');
    const uRotY = gl.getUniformLocation(prog, 'u_rotY');
    const uCenter = gl.getUniformLocation(prog, 'u_center');
    const uScale = gl.getUniformLocation(prog, 'u_scale');

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let animId = 0;

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
      resize();
      gl.uniform1f(uTime, prefersReduced ? 0.0 : now * 0.001);
      gl.uniform1f(uGrowthSpeed, 1.0);
      gl.uniform1f(uRefraction, 1.2);
      gl.uniform1f(uRotX, 0);
      gl.uniform1f(uRotY, 0);
      // Top-right corner — small scale keeps it from getting clipped
      gl.uniform2f(uCenter, 0.84, 0.70);
      gl.uniform1f(uScale, 0.46);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      animId = requestAnimationFrame(render);
    }

    resize();
    animId = requestAnimationFrame(render);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      gl.deleteProgram(prog);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  );
}
