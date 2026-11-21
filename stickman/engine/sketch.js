/**
 * engine/sketch.js — 手绘纸面风格渲染原语（8fps 线条微抖动）
 *
 * 可跨同类手绘小游戏复用的基础绘图工具库。
 */
(function (global) {
  'use strict';

  const PaperArena = (global.PaperArena = global.PaperArena || {});

  function createPaperTexture(W, H) {
    const tex = document.createElement('canvas');
    tex.width = W;
    tex.height = H;
    const pctx = tex.getContext('2d');
    pctx.fillStyle = '#f6f2e8';
    pctx.fillRect(0, 0, W, H);

    let s = 1337;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    for (let i = 0; i < 2400; i++) {
      const x = rand() * W;
      const y = rand() * H;
      const a = rand() * 0.04;
      pctx.fillStyle = rand() > 0.5 ? `rgba(60,50,35,${a})` : `rgba(255,255,255,${a * 1.4})`;
      pctx.fillRect(x, y, rand() * 2.2 + 0.5, rand() * 2.2 + 0.5);
    }

    const grad = pctx.createLinearGradient(W * 0.48, 0, W * 0.52, 0);
    grad.addColorStop(0, 'rgba(30,28,26,0)');
    grad.addColorStop(0.5, 'rgba(30,28,26,0.035)');
    grad.addColorStop(1, 'rgba(30,28,26,0)');
    pctx.fillStyle = grad;
    pctx.fillRect(W * 0.48, 0, W * 0.04, H);
    return tex;
  }

  function hashFloat(seed) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function jitter(seed, amp) {
    return (hashFloat(seed) - 0.5) * 2 * amp;
  }

  function boilSeed(id, time) {
    const f = Math.floor(time * 8);
    return ((id * 73856093) ^ (f * 19349663)) >>> 0;
  }

  function sketchLine(ctx, x1, y1, x2, y2, width = 3, color = '#1e1c1a', seed = 1, wob = 1.4) {
    const mx = (x1 + x2) * 0.5 + jitter(seed + 1, wob);
    const my = (y1 + y2) * 0.5 + jitter(seed + 2, wob);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1 + jitter(seed + 3, wob * 0.4), y1 + jitter(seed + 4, wob * 0.4));
    ctx.quadraticCurveTo(mx, my, x2 + jitter(seed + 5, wob * 0.4), y2 + jitter(seed + 6, wob * 0.4));
    ctx.stroke();
    ctx.restore();
  }

  function sketchCircle(ctx, cx, cy, r, width = 3, color = '#1e1c1a', fill = null, seed = 10, wob = 1.1) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const rr = r + jitter(seed + i * 3, wob);
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.stroke();
    ctx.restore();
  }

  function sketchEllipse(ctx, cx, cy, rx, ry, width = 3, color = '#1e1c1a', fill = null, seed = 20, wob = 1.1) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const steps = 22;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = cx + Math.cos(a) * (rx + jitter(seed + i * 3, wob));
      const py = cy + Math.sin(a) * (ry + jitter(seed + i * 5, wob * 0.6));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawCurvedPointer(ctx, fromX, fromY, toX, toY, seed = 77) {
    const cx = (fromX + toX) * 0.5 + (fromY - toY) * 0.22;
    const cy = (fromY + toY) * 0.5 + (toX - fromX) * 0.14;
    ctx.save();
    ctx.strokeStyle = '#1e1c1a';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.quadraticCurveTo(cx + jitter(seed, 1.5), cy + jitter(seed + 1, 1.5), toX, toY);
    ctx.stroke();
    const ang = Math.atan2(toY - cy, toX - cx);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - Math.cos(ang - 0.55) * 9, toY - Math.sin(ang - 0.55) * 9);
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - Math.cos(ang + 0.55) * 9, toY - Math.sin(ang + 0.55) * 9);
    ctx.stroke();
    ctx.restore();
  }

  function drawDiamond(ctx, x, y, size, stroke = '#1e1c1a', fill = '#fffdf5') {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = stroke;
    ctx.fillStyle = fill;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.72, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.72, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawFourPointStar(ctx, x, y, rx, ry, stroke = '#1e1c1a', fill = '#f4f6f9', lineWidth = 2.4, seed = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = stroke;
    ctx.fillStyle = fill;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const k = 0.28;
    ctx.moveTo(0, -ry + jitter(seed + 1, 0.8));
    ctx.quadraticCurveTo(rx * k, -ry * k, rx + jitter(seed + 2, 0.8), 0);
    ctx.quadraticCurveTo(rx * k, ry * k, 0, ry + jitter(seed + 3, 0.8));
    ctx.quadraticCurveTo(-rx * k, ry * k, -rx + jitter(seed + 4, 0.8), 0);
    ctx.quadraticCurveTo(-rx * k, -ry * k, 0, -ry + jitter(seed + 1, 0.8));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawBroadSword(ctx, hx, hy, angle, scale = 1, slim = false, seed = 40) {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle);
    ctx.scale(scale, scale);

    if (slim) {
      sketchLine(ctx, 0, 6, 0, -42, 4.8, '#1e1c1a', seed + 1, 0.8);
      sketchLine(ctx, -9, -4, 9, -4, 3.6, '#1e1c1a', seed + 2, 0.6);
    } else {
      ctx.fillStyle = '#f6f2e8';
      ctx.strokeStyle = '#1e1c1a';
      ctx.lineWidth = 2.8;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-6, -6);
      ctx.lineTo(-4 + jitter(seed + 1, 0.7), -54);
      ctx.lineTo(1, -66);
      ctx.lineTo(6 + jitter(seed + 2, 0.7), -54);
      ctx.lineTo(6, -6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#1e1c1a';
      ctx.fillRect(-11, -8, 22, 6);
      sketchLine(ctx, 0, -2, 0, 11, 5.2, '#1e1c1a', seed + 4, 0.4);
    }
    ctx.restore();
  }

  /**
   * 巨型锯齿银剑（三眼银剑王原画武器：尖头剑柄底、宽护手、双侧锯齿鳍、修长银刃）
   */
  function drawSerratedSilverSword(ctx, hx, hy, angle, scale = 1, seed = 60, inkColor = '#2b2d30') {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle);
    ctx.scale(scale, scale);

    const silverGrad = ctx.createLinearGradient(-16, -155, 16, 20);
    silverGrad.addColorStop(0, '#f5f7fa');
    silverGrad.addColorStop(0.45, '#d7dde5');
    silverGrad.addColorStop(1, '#b6bec9');

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Handle + pointed diamond pommel
    ctx.fillStyle = silverGrad;
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 2.7;
    ctx.beginPath();
    ctx.moveTo(-5.5, 0);
    ctx.lineTo(-5.5, 22);
    ctx.lineTo(0, 34);
    ctx.lineTo(5.5, 22);
    ctx.lineTo(5.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    sketchLine(ctx, -5, 22, 5, 22, 2.0, inkColor, seed + 1, 0.4);

    // Wide crossguard
    sketchLine(ctx, -23, -1, 23, -1, 3.8, inkColor, seed + 2, 0.7);
    sketchLine(ctx, -21, -2.5, 21, -2.5, 1.4, '#eef2f6', seed + 3, 0.4);

    // Jagged dragon-fin spikes along BOTH sides of lower-middle blade
    ctx.fillStyle = silverGrad;
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 2.4;

    // Left fin spikes (4 teeth climbing up)
    ctx.beginPath();
    ctx.moveTo(-6, -8);
    ctx.lineTo(-19 + jitter(seed + 4, 0.8), -18);
    ctx.lineTo(-7, -23);
    ctx.lineTo(-21 + jitter(seed + 5, 0.8), -36);
    ctx.lineTo(-7, -42);
    ctx.lineTo(-19 + jitter(seed + 6, 0.8), -56);
    ctx.lineTo(-6, -61);
    ctx.lineTo(-14 + jitter(seed + 7, 0.8), -74);
    ctx.lineTo(-5, -78);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right fin spikes (4 teeth climbing up)
    ctx.beginPath();
    ctx.moveTo(6, -6);
    ctx.lineTo(22 + jitter(seed + 8, 0.8), -15);
    ctx.lineTo(8, -22);
    ctx.lineTo(25 + jitter(seed + 9, 0.8), -33);
    ctx.lineTo(8, -41);
    ctx.lineTo(24 + jitter(seed + 10, 0.8), -52);
    ctx.lineTo(7, -60);
    ctx.lineTo(18 + jitter(seed + 11, 0.8), -71);
    ctx.lineTo(5, -78);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Main long tapering silver blade
    ctx.fillStyle = silverGrad;
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-6.5, -2);
    ctx.lineTo(-4.8 + jitter(seed + 12, 0.6), -88);
    ctx.lineTo(0, -158 + jitter(seed + 13, 0.9));
    ctx.lineTo(4.8 + jitter(seed + 14, 0.6), -88);
    ctx.lineTo(6.5, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Metallic center highlight line
    sketchLine(ctx, 0, -12, 0, -138, 1.5, 'rgba(255,255,255,0.85)', seed + 15, 0.5);

    ctx.restore();
  }

  PaperArena.Sketch = {
    createPaperTexture,
    hashFloat,
    jitter,
    boilSeed,
    sketchLine,
    sketchCircle,
    sketchEllipse,
    drawCurvedPointer,
    drawDiamond,
    drawFourPointStar,
    drawBroadSword,
    drawSerratedSilverSword
  };
})(window);
