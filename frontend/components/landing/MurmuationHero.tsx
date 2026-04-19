'use client';

import { useEffect, useRef } from 'react';

export function MurmuationHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const canvas = canvasRef.current!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const ctx = canvas.getContext('2d')!;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const BASE_COUNT = 600;
    const MAX_SPEED = 130;
    const MIN_SPEED = 40;
    const SEPARATION_RADIUS = 14;
    const NEIGHBOR_RADIUS = 50;
    const SEPARATION_WEIGHT = 350;
    const ALIGNMENT_WEIGHT = 2.5;
    const COHESION_WEIGHT = 0.06; // low cohesion → flock spreads across canvas
    const WIND_SCALE = 0.0003;
    const WIND_STRENGTH = 120;
    const CELL_SIZE = 55;
    const TRAIL_ALPHA = 0.22;
    const IMPULSE_INTERVAL_MIN = 5000;
    const IMPULSE_INTERVAL_MAX = 8000;
    const IMPULSE_SPEED = 300;
    const IMPULSE_STRENGTH = 140;
    const IMPULSE_FALLOFF = 0.5;
    const GRID_CAPACITY = 40;
    const glowSize = 80;

    let mouseX = 0, mouseY = 0;
    let mouseActive = false;
    let mouseDown = false;
    let W = 0, H = 0, dpr = 1;
    let running = true;
    let time = 0;
    let lastTime = 0;
    let frameCount = 0;

    let px: Float32Array, py: Float32Array, pvx: Float32Array, pvy: Float32Array;
    let psize: Float32Array, pbright: Float32Array;
    let pcount = 0;
    let gridData: Int32Array, gridCount: Int32Array;
    let gridCols = 0, gridRows = 0, gridTotal = 0;
    let attractX = 0, attractY = 0;
    const impulses: Array<{ ox: number; oy: number; dx: number; dy: number; born: number; front: number }> = [];
    let nextImpulseTime = 0;
    let animId = 0;

    // Pre-rendered glow sprite — purple
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowSize * 2;
    glowCanvas.height = glowSize * 2;
    const glowCtx = glowCanvas.getContext('2d')!;
    const g = glowCtx.createRadialGradient(glowSize, glowSize, 0, glowSize, glowSize, glowSize);
    g.addColorStop(0, 'rgba(140, 100, 255, 1)');
    g.addColorStop(0.3, 'rgba(140, 100, 255, 0.5)');
    g.addColorStop(1, 'rgba(140, 100, 255, 0)');
    glowCtx.fillStyle = g;
    glowCtx.fillRect(0, 0, glowSize * 2, glowSize * 2);

    // Noise helpers
    const noiseSeed = Math.random() * 65536;
    function hashN(x: number, y: number) {
      const n = Math.sin(x * 127.1 + y * 311.7 + noiseSeed) * 43758.5453;
      return n - Math.floor(n);
    }
    function smoothNoise(x: number, y: number) {
      const ix = Math.floor(x), iy = Math.floor(y);
      let fx = x - ix, fy = y - iy;
      fx = fx * fx * (3 - 2 * fx);
      fy = fy * fy * (3 - 2 * fy);
      const a = hashN(ix, iy), b = hashN(ix + 1, iy);
      const c = hashN(ix, iy + 1), d = hashN(ix + 1, iy + 1);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    }
    function fbmNoise(x: number, y: number) {
      return smoothNoise(x, y) * 0.65 + smoothNoise(x * 2.1, y * 2.1) * 0.25 + smoothNoise(x * 4.3, y * 4.3) * 0.1;
    }

    function scheduleImpulse() {
      nextImpulseTime = time + IMPULSE_INTERVAL_MIN + Math.random() * (IMPULSE_INTERVAL_MAX - IMPULSE_INTERVAL_MIN);
    }

    function spawnImpulse() {
      const edge = Math.random() * 4 | 0;
      let ox: number, oy: number, dx: number, dy: number;
      if (edge === 0) { ox = -50; oy = Math.random() * H; dx = 1; dy = (Math.random() - 0.5) * 0.5; }
      else if (edge === 1) { ox = W + 50; oy = Math.random() * H; dx = -1; dy = (Math.random() - 0.5) * 0.5; }
      else if (edge === 2) { ox = Math.random() * W; oy = -50; dx = (Math.random() - 0.5) * 0.5; dy = 1; }
      else { ox = Math.random() * W; oy = H + 50; dx = (Math.random() - 0.5) * 0.5; dy = -1; }
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len; dy /= len;
      impulses.push({ ox, oy, dx, dy, born: time, front: 0 });
      scheduleImpulse();
    }

    function allocateGrid() {
      gridCols = Math.ceil(W / CELL_SIZE) + 2;
      gridRows = Math.ceil(H / CELL_SIZE) + 2;
      gridTotal = gridCols * gridRows;
      gridCount = new Int32Array(gridTotal);
      gridData = new Int32Array(gridTotal * GRID_CAPACITY);
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      allocateGrid();
    }

    function initParticles() {
      pcount = Math.max(600, Math.min(BASE_COUNT, 5000));
      px = new Float32Array(pcount); py = new Float32Array(pcount);
      pvx = new Float32Array(pcount); pvy = new Float32Array(pcount);
      psize = new Float32Array(pcount); pbright = new Float32Array(pcount);

      const nc = 2 + (Math.random() * 2 | 0);
      const cxArr: number[] = [], cyArr: number[] = [];
      const baseCX = W * 0.35 + Math.random() * W * 0.3;
      const baseCY = H * 0.35 + Math.random() * H * 0.3;
      for (let c = 0; c < nc; c++) {
        cxArr.push(baseCX + (Math.random() - 0.5) * 200);
        cyArr.push(baseCY + (Math.random() - 0.5) * 150);
      }
      for (let i = 0; i < pcount; i++) {
        const ci = i % nc;
        const ang = Math.random() * 6.2832;
        const spread = 20 + Math.random() * 100;
        px[i] = cxArr[ci] + Math.cos(ang) * spread;
        py[i] = cyArr[ci] + Math.sin(ang) * spread;
        const dir = Math.random() * 6.2832;
        const spd = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED) * 0.35;
        pvx[i] = Math.cos(dir) * spd;
        pvy[i] = Math.sin(dir) * spd;
        psize[i] = 1.0 + Math.random() * 0.7;
        pbright[i] = 0.45 + Math.random() * 0.55;
      }
    }

    function buildGrid() {
      for (let i = 0; i < gridTotal; i++) gridCount[i] = 0;
      for (let i = 0; i < pcount; i++) {
        let col = ((px[i] / CELL_SIZE) | 0) + 1;
        let row = ((py[i] / CELL_SIZE) | 0) + 1;
        if (col < 0) col = 0; if (col >= gridCols) col = gridCols - 1;
        if (row < 0) row = 0; if (row >= gridRows) row = gridRows - 1;
        const cell = row * gridCols + col;
        const cnt = gridCount[cell];
        if (cnt < GRID_CAPACITY) { gridData[cell * GRID_CAPACITY + cnt] = i; gridCount[cell] = cnt + 1; }
      }
    }

    function updateParticles(dt: number) {
      const cohW = COHESION_WEIGHT;
      const nR2 = NEIGHBOR_RADIUS * NEIGHBOR_RADIUS;
      const sR2 = SEPARATION_RADIUS * SEPARATION_RADIUS;
      const windT = time * 0.00007;
      buildGrid();

      let flockCX = 0, flockCY = 0;
      for (let i = 0; i < pcount; i++) { flockCX += px[i]; flockCY += py[i]; }
      flockCX /= pcount; flockCY /= pcount;

      const at = time * 0.00015;
      attractX = W * 0.1 + smoothNoise(at, 3.7) * W * 0.8;
      attractY = H * 0.1 + smoothNoise(7.1, at) * H * 0.8;

      const diag = Math.sqrt(W * W + H * H) * 1.3;
      for (let imp = impulses.length - 1; imp >= 0; imp--) {
        impulses[imp].front += IMPULSE_SPEED * dt;
        if (impulses[imp].front > diag) impulses.splice(imp, 1);
      }

      const maxDim = Math.max(W, H);
      for (let i = 0; i < pcount; i++) {
        let x = px[i], y = py[i], vx = pvx[i], vy = pvy[i];
        let col = ((x / CELL_SIZE) | 0) + 1;
        let row = ((y / CELL_SIZE) | 0) + 1;
        if (col < 1) col = 1; if (col >= gridCols - 1) col = gridCols - 2;
        if (row < 1) row = 1; if (row >= gridRows - 1) row = gridRows - 2;

        let sepX = 0, sepY = 0, aliX = 0, aliY = 0, aliN = 0, cohX = 0, cohY = 0, cohN = 0;
        let sepN = 0;

        for (let dc = -1; dc <= 1; dc++) {
          for (let dr = -1; dr <= 1; dr++) {
            const cell = (row + dr) * gridCols + (col + dc);
            const cnt = gridCount[cell];
            const base = cell * GRID_CAPACITY;
            for (let k = 0; k < cnt; k++) {
              const j = gridData[base + k];
              if (j === i) continue;
              const ddx = px[j] - x, ddy = py[j] - y;
              const d2 = ddx * ddx + ddy * ddy;
              if (d2 < sR2 && d2 > 0.1) { const invD2 = 1.0 / d2; sepX -= ddx * invD2; sepY -= ddy * invD2; sepN++; }
              if (d2 < nR2) { aliX += pvx[j]; aliY += pvy[j]; aliN++; cohX += px[j]; cohY += py[j]; cohN++; }
            }
          }
        }

        let ax = 0, ay = 0;
        if (sepN > 0) { ax += sepX * SEPARATION_WEIGHT; ay += sepY * SEPARATION_WEIGHT; }
        if (aliN > 0) { const inv = 1.0 / aliN; ax += (aliX * inv - vx) * ALIGNMENT_WEIGHT; ay += (aliY * inv - vy) * ALIGNMENT_WEIGHT; }
        if (cohN > 0) { const inv = 1.0 / cohN; ax += (cohX * inv - x) * cohW * 0.5; ay += (cohY * inv - y) * cohW * 0.5; }

        const toFCX = flockCX - x, toFCY = flockCY - y;
        const fcDist = Math.sqrt(toFCX * toFCX + toFCY * toFCY);
        if (fcDist > 120) {
          const normDist = (fcDist - 120) / maxDim;
          const fcStr = normDist * 40 * cohW;
          ax += toFCX / fcDist * fcStr; ay += toFCY / fcDist * fcStr;
        }

        const toAX = attractX - x, toAY = attractY - y;
        const aDist = Math.sqrt(toAX * toAX + toAY * toAY);
        if (aDist > 10) {
          const aStr = 6 + Math.min(aDist * 0.015, 10); // gentle drift, no piling
          ax += toAX / aDist * aStr; ay += toAY / aDist * aStr;
        }

        if (mouseActive) {
          const toMX = mouseX - x, toMY = mouseY - y;
          const mDist = Math.sqrt(toMX * toMX + toMY * toMY);
          if (mDist > 5 && mDist < 350) {
            const mStr = mouseDown ? 250 : -400;
            let falloff = 1 - mDist / 350; falloff *= falloff;
            ax += toMX / mDist * mStr * falloff; ay += toMY / mDist * mStr * falloff;
          }
        }

        const globalAngle = smoothNoise(windT * 15, 0) * 6.2832;
        const localVar = fbmNoise(x * WIND_SCALE, y * WIND_SCALE + windT * 3) * 1.5 - 0.75;
        const windAngle = globalAngle + localVar;
        ax += Math.cos(windAngle) * WIND_STRENGTH;
        ay += Math.sin(windAngle) * WIND_STRENGTH;

        for (let imp = 0; imp < impulses.length; imp++) {
          const w = impulses[imp];
          const rx = x - w.ox, ry = y - w.oy;
          const proj = rx * w.dx + ry * w.dy;
          const dist = Math.abs(proj - w.front);
          const ww = 150;
          if (dist < ww && proj > -20) {
            let inf = 1 - dist / ww; inf *= inf;
            const age = (time - w.born) * 0.001;
            const decay = Math.exp(-age * IMPULSE_FALLOFF);
            ax += w.dx * IMPULSE_STRENGTH * inf * decay;
            ay += w.dy * IMPULSE_STRENGTH * inf * decay;
          }
        }

        const margin = 100;
        if (x < margin) ax += (margin - x) * 1.5;
        else if (x > W - margin) ax -= (x - W + margin) * 1.5;
        if (y < margin) ay += (margin - y) * 1.5;
        else if (y > H - margin) ay -= (y - H + margin) * 1.5;

        vx += ax * dt; vy += ay * dt;
        let spd = Math.sqrt(vx * vx + vy * vy);
        if (spd > MAX_SPEED) { const inv = MAX_SPEED / spd; vx *= inv; vy *= inv; }
        else if (spd < MIN_SPEED && spd > 0.1) { const inv = MIN_SPEED / spd; vx *= inv; vy *= inv; }

        x += vx * dt; y += vy * dt;
        if (x < -80) x += W + 160; else if (x > W + 80) x -= W + 160;
        if (y < -80) y += H + 160; else if (y > H + 80) y -= H + 160;
        px[i] = x; py[i] = y; pvx[i] = vx; pvy[i] = vy;
      }
    }

    function render() {
      ctx.fillStyle = `rgba(5, 5, 5, ${TRAIL_ALPHA})`;
      ctx.fillRect(-1, -1, W + 2, H + 2);

      // Density glow pass (every 3rd frame)
      if (frameCount % 3 === 0) {
        for (let cell = 0; cell < gridTotal; cell++) {
          const cnt = gridCount[cell];
          if (cnt > 12) {
            let gcx = 0, gcy = 0;
            const base = cell * GRID_CAPACITY;
            for (let k = 0; k < cnt; k++) { const idx = gridData[base + k]; gcx += px[idx]; gcy += py[idx]; }
            gcx /= cnt; gcy /= cnt;
            const density = Math.min(cnt / 30, 1);
            const sz = (25 + density * 50) / glowSize;
            ctx.globalAlpha = density * 0.03;
            ctx.drawImage(glowCanvas, gcx - glowSize * sz, gcy - glowSize * sz, glowSize * 2 * sz, glowSize * 2 * sz);
          }
        }
        ctx.globalAlpha = 1;
      }

      const invMax = 1.0 / MAX_SPEED;
      const spd100 = 100;
      ctx.lineCap = 'round';

      // Dim particles — brand purple
      ctx.strokeStyle = 'rgba(91, 77, 244, 0.28)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let i = 0; i < pcount; i++) {
        if (pbright[i] >= 0.72) continue;
        const vx = pvx[i], vy = pvy[i];
        const spd2 = vx * vx + vy * vy;
        if (spd2 < spd100) continue;
        const spd = Math.sqrt(spd2);
        const tailLen = spd * invMax * 4.5;
        const inv = 1 / spd;
        ctx.moveTo(px[i] - vx * inv * tailLen, py[i] - vy * inv * tailLen);
        ctx.lineTo(px[i] + vx * inv * tailLen * 0.3, py[i] + vy * inv * tailLen * 0.3);
      }
      ctx.stroke();

      // Bright particles — light violet
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.38)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let i = 0; i < pcount; i++) {
        if (pbright[i] < 0.72) continue;
        const vx = pvx[i], vy = pvy[i];
        const spd2 = vx * vx + vy * vy;
        if (spd2 < spd100) continue;
        const spd = Math.sqrt(spd2);
        const tailLen = spd * invMax * 4.5;
        const inv = 1 / spd;
        ctx.moveTo(px[i] - vx * inv * tailLen, py[i] - vy * inv * tailLen);
        ctx.lineTo(px[i] + vx * inv * tailLen * 0.3, py[i] + vy * inv * tailLen * 0.3);
      }
      ctx.stroke();
    }

    function fillBackground() {
      const grd = ctx.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#07071a');
      grd.addColorStop(1, '#050505');
      ctx.fillStyle = grd;
      ctx.fillRect(-1, -1, W + 2, H + 2);
    }

    function loop(ts: number) {
      if (!running) { animId = requestAnimationFrame(loop); return; }
      if (lastTime === 0) lastTime = ts;
      const rawDt = (ts - lastTime) * 0.001;
      lastTime = ts;
      const dt = rawDt < 0.05 ? rawDt : 0.05;
      time += (dt > 0 ? dt : 0.016) * 1000;
      frameCount++;

      if (prefersReduced) {
        if (Math.random() < 0.02) { updateParticles(dt * 0.1); render(); }
        animId = requestAnimationFrame(loop);
        return;
      }
      if (time > nextImpulseTime) spawnImpulse();
      updateParticles(dt > 0 ? dt : 0.016);
      render();
      animId = requestAnimationFrame(loop);
    }

    resize();
    attractX = W * 0.5; attractY = H * 0.5;
    fillBackground();
    initParticles();
    scheduleImpulse();
    lastTime = 0;
    animId = requestAnimationFrame(loop);

    const onMouseMove = (e: MouseEvent) => { mouseX = e.clientX; mouseY = e.clientY; mouseActive = true; };
    const onMouseLeave = () => { mouseActive = false; };
    const onMouseDown = (e: MouseEvent) => { mouseDown = true; mouseX = e.clientX; mouseY = e.clientY; mouseActive = true; };
    const onMouseUp = () => { mouseDown = false; };
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);

    const onResize = () => {
      const oldW = W, oldH = H;
      resize();
      fillBackground();
      if (oldW > 0 && oldH > 0) {
        const sx = W / oldW, sy = H / oldH;
        for (let i = 0; i < pcount; i++) { px[i] *= sx; py[i] *= sy; }
      }
    };
    window.addEventListener('resize', onResize);

    const onVisibility = () => { running = !document.hidden; if (running) lastTime = 0; };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(animId);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
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
