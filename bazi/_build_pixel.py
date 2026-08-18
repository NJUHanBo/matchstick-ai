#!/usr/bin/env python3
"""Assemble bazi/pixel.html from pro.html: keep logic, swap skin + background."""
from pathlib import Path

HERE = Path(__file__).resolve().parent
src = (HERE / "pro.html").read_text(encoding="utf-8")

src = src.replace(
    "<title>墨里知几 · 八字排盘</title>",
    "<title>墨里知几 · 像素排盘</title>",
)
src = src.replace(
    "<html lang=\"zh-CN\">\n<head>",
    "<html lang=\"zh-CN\">\n<!-- 像素皮肤复刻自 pro.html，排盘 / 档案 / 兑换 / AI 逻辑未改 -->\n<head>",
)

old_style_start = src.find("<style>")
old_style_end = src.find("</style>")
if old_style_start < 0 or old_style_end < 0:
    raise SystemExit("cannot find <style> block")
src = (
    src[:old_style_start]
    + '<link rel="stylesheet" href="pixel.css">\n'
    + src[old_style_end + len("</style>"):]
)

src = src.replace(
    '<p class="disclaimer">*天干合标注"合化X"为理论化神，是否真正合化成功需结合月令、通根、克神等条件人工判别。<br>节气以近似日期计算，交接日请核实精确时刻。命理仅供参考。</p>',
    '<p class="disclaimer">*天干合标注"合化X"为理论化神，是否真正合化成功需结合月令、通根、克神等条件人工判别。<br>节气以近似日期计算，交接日请核实精确时刻。命理仅供参考。<br>像素字体：缝合像素 Fusion Pixel 12px（OFL，TakWolf）</p>',
)

src = src.replace(
    """<div class="ink-bg" aria-hidden="true">
  <canvas id="fluid"></canvas>
  <div class="ink-veil"></div>
</div>""",
    """<div class="pixel-bg" aria-hidden="true">
  <canvas id="pixelField"></canvas>
  <div class="pixel-scanlines"></div>
  <div class="pixel-vignette"></div>
</div>""",
)

src = src.replace(
    "https://matchstick-ai.xyz/bazi/pro.html",
    "https://matchstick-ai.xyz/bazi/pixel.html",
)

marker = "墨里知几 · 湿拓墨流背景"
idx = src.find(marker)
if idx < 0:
    raise SystemExit("cannot find ink script")
script_open = src.rfind("<script>", 0, idx)
script_close = src.find("</script>", idx)
if script_open < 0 or script_close < 0:
    raise SystemExit("cannot bound ink script")
script_close += len("</script>")

pixel_bg_js = r"""<script>
/* 像素场：网格 + 双涡旋流场。粒子带短尾，指针轻搅。不拦交互。 */
(function pixelField() {
  const canvas = document.getElementById('pixelField');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLORS = ['#5aaa50', '#ff6b2f', '#c8a040', '#d6ceb4', '#4a88c8'];
  let w = 0, h = 0, dots = [], dust = [], raf = 0, last = 0;
  let mx = -9999, my = -9999;

  function makeDot() {
    const trail = [];
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      s: Math.random() < 0.55 ? 2 : 1,
      c: COLORS[(Math.random() * COLORS.length) | 0],
      spd: 22 + Math.random() * 28,
      a: 0.38 + Math.random() * 0.45,
      trail
    };
  }

  function seed() {
    const n = Math.max(90, Math.min(220, Math.floor((w * h) / 4200)));
    dots = Array.from({ length: n }, makeDot);
    dust = Array.from({ length: Math.floor(n * 0.35) }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      s: 1,
      c: COLORS[(Math.random() * COLORS.length) | 0],
      a: 0.12 + Math.random() * 0.2,
      p: Math.random() * Math.PI * 2
    }));
  }

  function flow(x, y, t) {
    const nx = x / w;
    const ny = y / h;
    const a = t * 0.00018;
    const c1x = 0.32 + 0.16 * Math.sin(a);
    const c1y = 0.40 + 0.12 * Math.cos(a * 0.85);
    const c2x = 0.70 + 0.14 * Math.cos(a * 0.72);
    const c2y = 0.58 + 0.15 * Math.sin(a * 1.05);

    function vortex(cx, cy, sign) {
      const dx = nx - cx;
      const dy = ny - cy;
      const r2 = dx * dx + dy * dy + 0.018;
      const s = sign * 0.42 / r2;
      return [-dy * s, dx * s];
    }
    const v1 = vortex(c1x, c1y, 1);
    const v2 = vortex(c2x, c2y, -1);
    let vx = v1[0] + v2[0] + 0.10 * Math.sin(ny * 5.5 + t * 0.00045);
    let vy = v1[1] + v2[1] + 0.06 * Math.cos(nx * 4.8 + t * 0.00032);

    const pdx = nx - mx / w;
    const pdy = ny - my / h;
    const pr2 = pdx * pdx + pdy * pdy + 0.01;
    if (pr2 < 0.08) {
      const ps = 0.22 / pr2;
      vx += -pdy * ps;
      vy += pdx * ps;
    }
    return [vx, vy];
  }

  function wrap(p) {
    let jumped = false;
    if (p.x < -4) { p.x = w + 2; jumped = true; }
    else if (p.x > w + 4) { p.x = -2; jumped = true; }
    if (p.y < -4) { p.y = h + 2; jumped = true; }
    else if (p.y > h + 4) { p.y = -2; jumped = true; }
    if (jumped) p.trail.length = 0;
  }

  function drawGrid() {
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    for (let x = 0; x < w; x += 16) ctx.fillRect(x, 0, 1, h);
    for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 1);
  }

  function draw(t) {
    drawGrid();
    for (const d of dust) {
      ctx.globalAlpha = REDUCED ? d.a : d.a * (0.55 + 0.45 * Math.abs(Math.sin(t / 480 + d.p)));
      ctx.fillStyle = d.c;
      ctx.fillRect(d.x | 0, d.y | 0, 1, 1);
    }
    for (const p of dots) {
      const tr = p.trail;
      for (let i = 0; i < tr.length; i++) {
        ctx.globalAlpha = p.a * ((i + 1) / (tr.length + 1)) * 0.55;
        ctx.fillStyle = p.c;
        ctx.fillRect(tr[i][0], tr[i][1], p.s, p.s);
      }
      ctx.globalAlpha = p.a;
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x | 0, p.y | 0, p.s, p.s);
    }
    ctx.globalAlpha = 1;
  }

  function step(dt, t) {
    for (const p of dots) {
      const [fx, fy] = flow(p.x, p.y, t);
      p.trail.push([p.x | 0, p.y | 0]);
      if (p.trail.length > 8) p.trail.shift();
      p.x += fx * p.spd * dt;
      p.y += fy * p.spd * dt;
      wrap(p);
    }
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    seed();
    draw(0);
  }

  function frame(t) {
    const dt = Math.min(0.05, ((t - last) / 1000) || 0.016);
    last = t;
    step(dt, t);
    draw(t);
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
  window.addEventListener('pointerleave', () => { mx = -9999; my = -9999; });
  resize();
  if (!REDUCED) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
})();
</script>"""

src = src[:script_open] + pixel_bg_js + src[script_close:]

out = HERE / "pixel.html"
out.write_text(src, encoding="utf-8")
print(f"wrote {out} ({len(src.splitlines())} lines)")
