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
   * 巨型锯齿银剑（无敌剑原画武器：尖头剑柄底、宽护手、双侧锯齿鳍、修长银刃）
   * @param {number} bladeLenMult 剑刃伸长倍率（默认 1.0，K 技能变长时可达 1.85）
   */
  function drawSerratedSilverSword(ctx, hx, hy, angle, scale = 1, seed = 60, inkColor = '#2b2d30', bladeLenMult = 1.0) {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle);
    ctx.scale(scale, scale);

    const tipY = -158 * bladeLenMult;
    const midY = -88 * bladeLenMult;
    const finScale = 1 + (bladeLenMult - 1) * 0.65;

    const silverGrad = ctx.createLinearGradient(-16, tipY, 16, 20);
    silverGrad.addColorStop(0, bladeLenMult > 1.05 ? '#ffffff' : '#f5f7fa');
    silverGrad.addColorStop(0.45, bladeLenMult > 1.05 ? '#e2ecf8' : '#d7dde5');
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

    // Jagged dragon-fin spikes along BOTH sides of blade (scales with extension)
    ctx.fillStyle = silverGrad;
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 2.4;

    ctx.beginPath();
    ctx.moveTo(-6, -8 * finScale);
    ctx.lineTo(-19 + jitter(seed + 4, 0.8), -18 * finScale);
    ctx.lineTo(-7, -23 * finScale);
    ctx.lineTo(-21 + jitter(seed + 5, 0.8), -36 * finScale);
    ctx.lineTo(-7, -42 * finScale);
    ctx.lineTo(-19 + jitter(seed + 6, 0.8), -56 * finScale);
    ctx.lineTo(-6, -61 * finScale);
    ctx.lineTo(-14 + jitter(seed + 7, 0.8), -74 * finScale);
    ctx.lineTo(-5, -78 * finScale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(6, -6 * finScale);
    ctx.lineTo(22 + jitter(seed + 8, 0.8), -15 * finScale);
    ctx.lineTo(8, -22 * finScale);
    ctx.lineTo(25 + jitter(seed + 9, 0.8), -33 * finScale);
    ctx.lineTo(8, -41 * finScale);
    ctx.lineTo(24 + jitter(seed + 10, 0.8), -52 * finScale);
    ctx.lineTo(7, -60 * finScale);
    ctx.lineTo(18 + jitter(seed + 11, 0.8), -71 * finScale);
    ctx.lineTo(5, -78 * finScale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Extended metallic aura glow when sword is elongated
    if (bladeLenMult > 1.08) {
      ctx.save();
      ctx.strokeStyle = 'rgba(225, 198, 95, 0.55)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(0, tipY - 6);
      ctx.stroke();
      ctx.restore();
    }

    // Main long tapering silver blade
    ctx.fillStyle = silverGrad;
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-6.5, -2);
    ctx.lineTo(-4.8 + jitter(seed + 12, 0.6), midY);
    ctx.lineTo(0, tipY + jitter(seed + 13, 0.9));
    ctx.lineTo(4.8 + jitter(seed + 14, 0.6), midY);
    ctx.lineTo(6.5, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Metallic center highlight line
    sketchLine(ctx, 0, -12, 0, tipY + 18, 1.7, 'rgba(255,255,255,0.92)', seed + 15, 0.5);

    ctx.restore();
  }

  /**
   * 定身光束/光弹（无敌剑远程技能 L：发射一道光，击中让敌人静止 1 秒）
   */
  function drawFreezeLight(ctx, o, seed) {
    const dir = Math.sign(o.vx) || 1;
    ctx.save();
    ctx.translate(o.x, o.y);

    // Outer radiant light beam glow
    const grad = ctx.createLinearGradient(-dir * 52, 0, dir * 24, 0);
    grad.addColorStop(0, 'rgba(255, 240, 170, 0)');
    grad.addColorStop(0.55, 'rgba(255, 242, 178, 0.55)');
    grad.addColorStop(1, 'rgba(255, 252, 232, 0.95)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(-dir * 12, 0, 44, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hand-drawn expanding wave arcs ")))" from sketch + streaking rays
    for (let i = 0; i < 3; i++) {
      const wx = -dir * (14 + i * 15);
      const wr = 11 + i * 4.5;
      ctx.save();
      ctx.strokeStyle = i === 0 ? '#1e1c1a' : 'rgba(30,28,26,0.72)';
      ctx.lineWidth = 2.4 - i * 0.3;
      ctx.beginPath();
      if (dir > 0) ctx.arc(wx - wr * 0.4, 0, wr, -0.78, 0.78);
      else ctx.arc(wx + wr * 0.4, 0, wr, Math.PI - 0.78, Math.PI + 0.78);
      ctx.stroke();
      ctx.restore();
    }
    sketchLine(ctx, dir * 18, 0, -dir * 48, 0, 3.6, '#e6b83a', seed + 1, 1.2);

    // Leading bright 4-point star head
    drawFourPointStar(ctx, dir * 10, 0, 15, 19, '#1e1c1a', '#fffef0', 2.4, seed + 4);
    drawFourPointStar(ctx, dir * 10, 0, 7, 10, '#d69f22', '#ffffff', 1.6, seed + 5);

    ctx.restore();
  }

  /**
   * 敌人被定身（静止 1 秒）时的手绘光环笼罩效果
   */
  function drawFrozenOverlay(ctx, f, time) {
    if (f.frozenTimer <= 0) return;
    const s = boilSeed(1700 + f.id * 41, time);
    const cy = f.y - f.height * 0.52;
    const rx = Math.max(32, f.halfW + 12);
    const ry = f.height * 0.56;

    ctx.save();
    // Soft golden-white freeze halo
    ctx.fillStyle = 'rgba(255, 246, 195, 0.34)';
    ctx.beginPath();
    ctx.ellipse(f.x, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Concentric sketchy freeze rings
    sketchEllipse(ctx, f.x, cy, rx, ry, 2.4, '#c9922c', null, s + 1, 1.2);
    sketchEllipse(ctx, f.x, cy, rx * 0.82, ry * 0.22, 2.0, '#1e1c1a', null, s + 2, 0.9);
    drawFourPointStar(ctx, f.x - rx * 0.78, cy - ry * 0.55, 8, 11, '#1e1c1a', '#fffef0', 1.8, s + 3);
    drawFourPointStar(ctx, f.x + rx * 0.78, cy + ry * 0.35, 7, 10, '#1e1c1a', '#fffef0', 1.8, s + 4);

    // Tiny countdown label ("静止 0.8s")
    ctx.font = 'bold 13px "PingFang SC", sans-serif';
    ctx.fillStyle = '#9c6c12';
    ctx.textAlign = 'center';
    ctx.fillText(`静止 ${f.frozenTimer.toFixed(1)}s`, f.x, f.y - f.height - 16);
    ctx.restore();
  }

  /**
   * 影子角色：手绘紫色长围巾（平时随动作飘逸，大招时向前弹射抓取）
   */
  function drawShadowScarf(ctx, nx, ny, dir, vx, time, seed, grabExt = 0) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Neck wrap ring (紫色围巾绕颈一圈)
    ctx.fillStyle = '#7b4ca8';
    ctx.strokeStyle = '#47256b';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.ellipse(nx, ny + 3, 10, 4.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (grabExt > 4) {
      // 大招弹射：紫围巾笔直高速向前延伸抓人（带紫色彩铅笔触与末端勾爪）
      const tipX = nx + dir * grabExt;
      const tipY = ny + 2 + Math.sin(time * 28) * 3;
      const ctrlX = nx + dir * grabExt * 0.52;
      const ctrlY = ny - 9 + Math.cos(time * 22) * 5;

      ctx.strokeStyle = '#7b4ca8';
      ctx.lineWidth = 8.5;
      ctx.beginPath();
      ctx.moveTo(nx, ny + 3);
      ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
      ctx.stroke();

      ctx.strokeStyle = '#47256b';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(nx, ny + 1);
      ctx.quadraticCurveTo(ctrlX, ctrlY - 3, tipX, tipY - 2);
      ctx.moveTo(nx, ny + 6);
      ctx.quadraticCurveTo(ctrlX, ctrlY + 3, tipX, tipY + 3);
      ctx.stroke();

      // Trailing wrap curls at the tip
      sketchCircle(ctx, tipX, tipY, 8, 2.5, '#47256b', 'rgba(123,76,168,0.45)', seed + 9, 1.2);
      ctx.restore();
      return;
    }

    // Idle / moving: flowing purple scarf streaming behind (还原草图斜向垂落飘动的紫围巾)
    const speedLag = Math.min(26, Math.abs(vx) * 0.08);
    const wave1 = Math.sin(time * 6.2 + seed * 0.01) * 5;
    const wave2 = Math.cos(time * 5.1 + seed * 0.01) * 6;
    const p1x = nx - dir * (18 + speedLag * 0.45);
    const p1y = ny + 16 + wave1 * 0.4;
    const p2x = nx - dir * (38 + speedLag);
    const p2y = ny + 36 + wave2 * 0.65;

    // Main filled scarf ribbon
    ctx.fillStyle = 'rgba(128, 82, 176, 0.85)';
    ctx.strokeStyle = '#4e2a73';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(nx - dir * 3, ny + 1);
    ctx.quadraticCurveTo(p1x - dir * 2, p1y - 4, p2x - dir * 6, p2y - 3);
    ctx.lineTo(p2x + dir * 2, p2y + 8);
    ctx.quadraticCurveTo(p1x + dir * 4, p1y + 6, nx + dir * 2, ny + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Colored-pencil wispy purple strands at tail (彩铅斜刷笔触质感)
    sketchLine(ctx, nx - dir * 2, ny + 3, p2x - dir * 9, p2y + 2, 2.4, '#6b3e99', seed + 1, 1.4);
    sketchLine(ctx, p1x, p1y + 2, p2x - dir * 13, p2y + 7, 1.8, '#9b6fd1', seed + 2, 1.5);
    sketchLine(ctx, p1x - dir * 2, p1y - 1, p2x - dir * 5, p2y - 6, 1.6, '#563080', seed + 3, 1.2);

    ctx.restore();
  }

  /**
   * 影子一技能：贴地紫色阴影圆斑（藏进阴影 5s）
   */
  function drawShadowPuddle(ctx, x, y, alpha, seed) {
    if (alpha <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Flat purple puddle on ground
    sketchEllipse(ctx, x, y - 2, 27, 6.5, 2.4, '#4e2a73', 'rgba(116, 68, 168, 0.58)', seed + 1, 1.2);
    // Tiny domed bump peeking out (还原草图 1 格左图的小拱起)
    ctx.fillStyle = 'rgba(92, 48, 140, 0.55)';
    ctx.strokeStyle = '#3b1e59';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(x, y - 4, 10, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 影子大招：围巾暗影空间演出（深紫反色暗场 + 紫色空间门 + 四面八方放射状影刺穿刺）
   */
  function drawShadowDomain(ctx, dom, W, H, time) {
    if (!dom || !dom.active) return;
    const s = boilSeed(2300, time);
    const p = Math.min(1, dom.elapsed / dom.duration);
    const fadeIn = Math.min(1, dom.elapsed / 0.16);
    const fadeOut = dom.elapsed > dom.duration - 0.22 ? Math.max(0, (dom.duration - dom.elapsed) / 0.22) : 1;
    const alpha = fadeIn * fadeOut;

    ctx.save();
    // Dark purple-ink shadow realm backdrop
    ctx.fillStyle = `rgba(24, 14, 38, ${0.84 * alpha})`;
    ctx.fillRect(0, 0, W, H);

    // Hand-drawn purple portal rift ring around domain center
    const cx = dom.targetX;
    const cy = dom.targetY;
    ctx.globalAlpha = alpha;
    sketchEllipse(ctx, cx, cy, 175, 138, 3.0, '#9a6bd4', 'rgba(52, 24, 86, 0.36)', s + 1, 2.2);
    sketchEllipse(ctx, cx, cy, 145, 112, 1.8, 'rgba(182, 142, 232, 0.65)', null, s + 2, 1.8);

    // Radiating shadow spears piercing victim from ALL directions (忠实还原草图大招右图!)
    const spikeCount = 16;
    for (let i = 0; i < spikeCount; i++) {
      const ang = (i / spikeCount) * Math.PI * 2 + (i % 2 === 0 ? 0.08 : -0.05);
      const startAt = 0.14 + (i % 4) * 0.13;
      const localT = (dom.elapsed - startAt) / 0.24;
      if (localT <= 0) continue;
      const reach = Math.min(1, localT);
      const outerR = 235 + (i % 3) * 32;
      const innerR = outerR * (1 - reach) - 24 * reach; // Pierces right through center!
      const ox = cx + Math.cos(ang) * outerR;
      const oy = cy + Math.sin(ang) * outerR;
      const ix = cx + Math.cos(ang) * innerR;
      const iy = cy + Math.sin(ang) * innerR;

      // Tapered purple spear polygon
      const perpX = -Math.sin(ang);
      const perpY = Math.cos(ang);
      const baseHalfW = 5.5 + (i % 2) * 2.5;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(138, 86, 196, 0.88)' : 'rgba(98, 52, 152, 0.92)';
      ctx.strokeStyle = '#e2ccf7';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(ox + perpX * baseHalfW, oy + perpY * baseHalfW);
      ctx.lineTo(ix, iy);
      ctx.lineTo(ox - perpX * baseHalfW, oy - perpY * baseHalfW);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Center impact cross-flash
    if (p > 0.2 && p < 0.88) {
      const pulse = 18 + Math.sin(time * 42) * 6;
      drawFourPointStar(ctx, cx, cy, pulse, pulse * 1.25, '#f2e4ff', 'rgba(155, 102, 214, 0.72)', 2.0, s + 30);
    }

    // Callout caption inside domain
    ctx.font = '900 28px "Kaiti SC", "STKaiti", "PingFang SC", cursive';
    ctx.fillStyle = '#efe2ff';
    ctx.textAlign = 'center';
    ctx.fillText('暗影空间 · 万影穿刺!', W * 0.5, 92);
    ctx.restore();
  }

  /**
   * 藤蔓角色：背后四条可活动的手绘绿色藤蔓（黄绿 + 翠绿彩铅质感）
   */
  function drawVineTendrils(ctx, nx, ny, dir, time, seed, scale = 1.0, activeMode = 'idle') {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const colors = ['#2f7d32', '#52a33a', '#7db838', '#3c8c30'];
    const configs = [
      { ang: -2.45, len: 38, amp: 7, freq: 3.8, phase: 0.0 },
      { ang: -2.85, len: 46, amp: 8, freq: 4.3, phase: 1.4 },
      { ang: -3.25, len: 42, amp: 7, freq: 3.5, phase: 2.7 },
      { ang: -3.65, len: 34, amp: 6, freq: 4.1, phase: 4.0 }
    ];

    configs.forEach((cfg, i) => {
      const sway = Math.sin(time * cfg.freq + cfg.phase) * cfg.amp * scale;
      const len = cfg.len * scale * (activeMode === 'slash' ? 1.25 : 1.0);
      const baseAng = dir > 0 ? cfg.ang : (Math.PI - cfg.ang);
      const mx = nx + Math.cos(baseAng) * (len * 0.55) + Math.cos(baseAng + 1.57) * sway;
      const my = ny + Math.sin(baseAng) * (len * 0.55) + Math.sin(baseAng + 1.57) * sway;
      const ex = nx + Math.cos(baseAng) * len + Math.cos(baseAng + 1.57) * (-sway * 0.8);
      const ey = ny + Math.sin(baseAng) * len + Math.sin(baseAng + 1.57) * (-sway * 0.8);

      // Outer dark-green outline + inner bright yellow-green pencil highlight
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = (4.2 - (i % 2) * 0.6) * Math.max(0.75, scale * 0.72);
      ctx.beginPath();
      ctx.moveTo(nx, ny + i * 2);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();

      ctx.strokeStyle = '#a4cc42';
      ctx.lineWidth = 1.4 * Math.max(0.75, scale * 0.7);
      ctx.beginPath();
      ctx.moveTo(nx, ny + i * 2);
      ctx.quadraticCurveTo(mx + 1.5, my - 1.5, ex, ey);
      ctx.stroke();

      // Tiny curled leaf / vine tip hook
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = 1.9 * Math.max(0.75, scale * 0.7);
      ctx.beginPath();
      ctx.arc(ex, ey, 3.8 * Math.max(0.7, scale * 0.7), 0, Math.PI * 1.4);
      ctx.stroke();
    });
    ctx.restore();
  }

  /**
   * 藤蔓一技能 / 二技能：地底藤蔓蔓延抓捕（4身位）与破盾地刺（3身位斜刺破土）
   */
  function drawGroundVineEffect(ctx, gv, groundY, time) {
    const s = boilSeed(2600 + gv.id * 37, time);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (gv.kind === 'bind') {
      // 地底黄绿色蔓延藤蔓线（从施法者脚下延伸至目标脚下）
      const x0 = gv.startX;
      const x1 = gv.currentX;
      const segs = 12;
      for (let layer = 0; layer < 2; layer++) {
        ctx.strokeStyle = layer === 0 ? '#2f7d32' : '#9ec938';
        ctx.lineWidth = layer === 0 ? 4.4 : 2.2;
        ctx.beginPath();
        for (let i = 0; i <= segs; i++) {
          const t = i / segs;
          const px = x0 + (x1 - x0) * t;
          const py = groundY - 3 + Math.sin(t * Math.PI * 5 + time * 10 + layer * 1.8) * 5.5;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      // Small soil bursts along ground path
      sketchCircle(ctx, x1, groundY - 4, 8, 2.2, '#3d7a2c', 'rgba(130, 190, 58, 0.35)', s + 4, 1.5);
    } else if (gv.kind === 'pierce') {
      // 跺脚钻地通道 + 3身位处破土而出的粗壮绿色藤蔓尖刺（还原草图 2 格！）
      const progress = Math.min(1, gv.elapsed / 0.14);
      const fade = gv.life < 0.18 ? Math.max(0, gv.life / 0.18) : 1;
      ctx.globalAlpha = fade;

      // Underground vine trail
      sketchLine(ctx, gv.startX, groundY + 4, gv.tipX, groundY + 4, 4.0, '#4c9934', s + 1, 1.6);
      sketchLine(ctx, gv.startX, groundY + 7, gv.tipX, groundY + 7, 2.0, '#9ec938', s + 2, 1.2);

      // Massive erupting thorny vine spike at tipX
      const dir = gv.dir;
      const spikeH = 112 * progress;
      const bx = gv.tipX;
      const by = groundY + 4;
      const tx = bx + dir * (28 * progress);
      const ty = by - spikeH;

      ctx.fillStyle = gv.brokeShield ? 'rgba(98, 184, 52, 0.92)' : 'rgba(84, 152, 56, 0.72)';
      ctx.strokeStyle = '#1f5722';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(bx - 16, by);
      ctx.quadraticCurveTo(bx - 6 + dir * 6, by - spikeH * 0.55, tx, ty);
      ctx.quadraticCurveTo(bx + 14 + dir * 10, by - spikeH * 0.45, bx + 16, by);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Spiral vine wraps climbing up the spike
      for (let k = 1; k <= 4; k++) {
        const ft = k / 5;
        const wx = bx + (tx - bx) * ft;
        const wy = by + (ty - by) * ft;
        const hw = (1 - ft) * 14 + 3;
        sketchLine(ctx, wx - hw, wy + 3, wx + hw, wy - 4, 2.2, '#a8d442', s + 10 + k, 0.8);
      }
    }
    ctx.restore();
  }

  /**
   * 敌人被藤蔓一技能缠绕时的四条破土绿藤捆绑效果
   */
  function drawVineBoundOverlay(ctx, f, time) {
    if (!f.vineBoundTimer || f.vineBoundTimer <= 0) return;
    const s = boilSeed(2800 + f.id * 43, time);
    const rx = Math.max(24, f.halfW + 7);
    const h = f.height;
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const y = f.y - h * (0.18 + i * 0.21);
      const col = i % 2 === 0 ? '#2f7d32' : '#7cb836';
      sketchEllipse(ctx, f.x, y, rx, 7.5, 3.0, col, null, s + i * 3, 1.3);
    }
    // Vertical climbing vines on left/right
    sketchLine(ctx, f.x - rx * 0.8, f.y, f.x - rx * 0.5, f.y - h * 0.85, 2.8, '#3f9432', s + 20, 1.8);
    sketchLine(ctx, f.x + rx * 0.8, f.y, f.x + rx * 0.5, f.y - h * 0.85, 2.8, '#9ec938', s + 21, 1.8);

    ctx.font = 'bold 13px "PingFang SC", sans-serif';
    ctx.fillStyle = '#256628';
    ctx.textAlign = 'center';
    ctx.fillText(`缠绕吸血 ${f.vineBoundTimer.toFixed(1)}s`, f.x, f.y - h - 18);
    ctx.restore();
  }

  /**
   * 藤蔓大招一：螺旋绿色藤蔓茧（还原草图左下 1大）
   */
  function drawVineCocoon(ctx, x, y, h, timer, time, seed) {
    ctx.save();
    // Soft green glowing core behind coils
    ctx.fillStyle = 'rgba(136, 198, 66, 0.30)';
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.48, 30, h * 0.50, 0, 0, Math.PI * 2);
    ctx.fill();

    // Stacked spiral vine rings from bottom up to dome head (还原草图一圈圈缠成的绿茧)
    const rings = 7;
    for (let i = 0; i < rings; i++) {
      const t = i / (rings - 1);
      const ry = y - 8 - t * (h * 0.82);
      const rx = 28 - Math.pow(t, 1.5) * 9 + Math.sin(time * 7 + i) * 1.6;
      const col = i % 2 === 0 ? '#398a32' : '#85bd38';
      sketchEllipse(ctx, x, ry, rx, 8.5, 3.6, col, null, seed + i * 4, 1.5);
    }
    // Top coiled dome cap
    sketchCircle(ctx, x, y - h * 0.86, 17, 3.2, '#2f7d32', 'rgba(118, 184, 58, 0.35)', seed + 40, 1.6);

    ctx.font = 'bold 13px "PingFang SC", sans-serif';
    ctx.fillStyle = '#246627';
    ctx.textAlign = 'center';
    ctx.fillText(`藤蔓茧 ${timer.toFixed(1)}s（再按;赌命）`, x, y - h - 22);
    ctx.restore();
  }

  /**
   * 螺旋藤蔓肢体辅助：用于藤蔓大招二「巨藤狂化」（还原草图右下 2大 浓密螺旋绿藤巨人！）
   */
  function drawCoiledVineLimb(ctx, x1, y1, x2, y2, radius, seed) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(4, Math.floor(dist / (radius * 0.72)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x1 + (x2 - x1) * t + jitter(seed + i * 3, radius * 0.18);
      const py = y1 + (y2 - y1) * t + jitter(seed + i * 5, radius * 0.18);
      const col = i % 2 === 0 ? '#2f7d32' : '#6cb038';
      const fill = i % 3 === 0 ? 'rgba(126, 188, 56, 0.42)' : 'rgba(62, 138, 48, 0.35)';
      sketchCircle(ctx, px, py, radius, 2.6, col, fill, seed + i * 7, 1.6);
    }
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
    drawSerratedSilverSword,
    drawFreezeLight,
    drawFrozenOverlay,
    drawShadowScarf,
    drawShadowPuddle,
    drawShadowDomain,
    drawVineTendrils,
    drawGroundVineEffect,
    drawVineBoundOverlay,
    drawVineCocoon,
    drawCoiledVineLimb
  };
})(window);
