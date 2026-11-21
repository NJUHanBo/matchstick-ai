/**
 * assets/characters.js — 可插拔角色动画资产注册表
 *
 * 每个角色资产包含：
 * - id / name / scale
 * - metrics：身高、半宽、剑击范围、投射物出手点、气泡高度
 * - draw(ctx, fighter, env)：完整状态机动画渲染函数
 *
 * 新增手绘角色时，只需调用 PaperArena.CharacterAssets.register({...})，
 * 选角菜单、碰撞体积、AI 距离判定与战斗系统会自动适配，无需改主引擎。
 */
(function (global) {
  'use strict';

  const PaperArena = (global.PaperArena = global.PaperArena || {});
  const S = PaperArena.Sketch;

  const registry = new Map();

  function register(def) {
    registry.set(def.id, def);
    return def;
  }

  function get(id) {
    return registry.get(id) || registry.get('angry');
  }

  function list() {
    return Array.from(registry.values());
  }

  // =========================================================
  // 共用：经典火柴人渲染器（怒气大剑客 / 「人」字剑客）
  // =========================================================
  function drawClassicFace(ctx, role, state, hx, hy, facing, seed) {
    ctx.save();
    ctx.strokeStyle = '#1e1c1a';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';

    if (state === 'slip' || state === 'hurt') {
      S.sketchCircle(ctx, hx + facing * 3, hy + 2, 4.5, 2.2, '#1e1c1a', null, seed + 1, 0.4);
    } else if (state === 'ko') {
      S.sketchLine(ctx, hx - 4, hy - 2, hx + 4, hy + 2, 2, '#1e1c1a', seed + 1, 0.3);
      S.sketchLine(ctx, hx + 4, hy - 2, hx - 4, hy + 2, 2, '#1e1c1a', seed + 2, 0.3);
    } else if (state === 'walkoff') {
      ctx.beginPath();
      ctx.arc(hx + facing * 3, hy + 8, 5, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (role === 'angry') {
      const vx = hx - facing * 3;
      const vy = hy - 3;
      const k = 4.2;
      ctx.beginPath();
      ctx.moveTo(vx - k, vy - 1.5); ctx.quadraticCurveTo(vx - 1.5, vy - 1.5, vx - 1.5, vy - k);
      ctx.moveTo(vx + k, vy - 1.5); ctx.quadraticCurveTo(vx + 1.5, vy - 1.5, vx + 1.5, vy - k);
      ctx.moveTo(vx - k, vy + 1.5); ctx.quadraticCurveTo(vx - 1.5, vy + 1.5, vx - 1.5, vy + k);
      ctx.moveTo(vx + k, vy + 1.5); ctx.quadraticCurveTo(vx + 1.5, vy + 1.5, vx + 1.5, vy + k);
      ctx.stroke();
    } else {
      ctx.beginPath();
      const fx = hx + facing * 2;
      ctx.arc(fx, hy - 3, 3.2, -Math.PI * 0.65, Math.PI * 0.55);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(fx, hy + 3, 3.2, -Math.PI * 0.55, Math.PI * 0.65);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayerTag(ctx, f, env, headX, tagY) {
    if (env.storyActive) return;
    ctx.save();
    ctx.font = 'bold 12px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = f.id === 0 ? '#c94a38' : '#2e6b8a';
    const label = f.id === 0 ? '1P' : (env.gameMode === '2p' ? '2P' : '电脑');
    ctx.fillText(label, headX, tagY);
    ctx.restore();
  }

  function drawClassicStickman(ctx, f, env) {
    const s = S.boilSeed(500 + f.id * 97, env.time);
    const dir = f.facing;
    const tNow = env.time;

    // Ground shadow
    const hAbove = Math.max(0, env.groundY - f.y);
    const shScale = Math.max(0.35, 1 - hAbove / 380);
    ctx.save();
    ctx.fillStyle = 'rgba(30,28,26,0.12)';
    ctx.beginPath();
    ctx.ellipse(f.x, env.groundY + 3, 24 * shScale, 5.5 * shScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(f.x, f.y);

    if (f.state === 'ko') {
      for (let i = 0; i < 3; i++) {
        S.sketchLine(ctx, -dir * (38 + i * 11), -22 - i * 4, -dir * (18 + i * 11), -8 - i * 4, 2.2, '#1e1c1a', s + 80 + i, 0.7);
      }
      const headX = dir * 24;
      const hipX = -dir * 18;
      S.sketchLine(ctx, hipX, -9, headX - dir * 13, -12, 3.2, '#1e1c1a', s + 1, 0.9);
      S.sketchLine(ctx, hipX, -9, hipX - dir * 20, -3, 3.0, '#1e1c1a', s + 2, 0.9);
      S.sketchLine(ctx, hipX, -9, hipX - dir * 14, -19, 3.0, '#1e1c1a', s + 3, 0.9);
      S.sketchLine(ctx, headX - dir * 16, -12, headX - dir * 5, -2, 2.8, '#1e1c1a', s + 4, 0.9);
      S.sketchCircle(ctx, headX, -14, 14, 3.0, '#1e1c1a', '#f6f2e8', s + 5, 0.9);
      drawClassicFace(ctx, f.role, 'ko', headX, -14, dir, s + 10);
      ctx.restore();
      return;
    }

    if (f.state === 'slip') {
      ctx.translate(0, -48);
      ctx.rotate(f.slipRot);
      ctx.translate(0, 48);
    }

    const bob = f.state === 'idle' ? Math.sin(tNow * 5 + f.id * 2) * 2.5
      : f.state === 'fly' ? Math.sin(tNow * 7 + f.id) * 5.5
      : f.state === 'run' ? Math.abs(Math.sin(f.walkPhase)) * -4 : 0;

    const crouch = f.state === 'shield' ? 11 : 0;
    const hipX = 0;
    const hipY = -34 + bob + crouch;
    const neckX = f.state === 'run' ? dir * 6 : f.state === 'slash' ? dir * 8 : 0;
    const neckY = -68 + bob + crouch;
    const headX = neckX;
    const headY = neckY - 16;

    let lFootX = -13, lFootY = 0, rFootX = 13, rFootY = 0;
    if (f.state === 'run' || f.state === 'walkoff') {
      const sw = Math.sin(f.walkPhase);
      lFootX = sw * 19;
      lFootY = Math.min(0, -Math.cos(f.walkPhase) * 9);
      rFootX = -sw * 19;
      rFootY = Math.min(0, Math.cos(f.walkPhase) * 9);
    } else if (!f.onGround) {
      lFootX = -11 - dir * 4; lFootY = -6 + bob * 0.5;
      rFootX = 11 - dir * 2; rFootY = -12 + bob * 0.5;
    } else if (f.state === 'shield') {
      lFootX = -18; rFootX = 18;
    } else if (f.state === 'slash') {
      lFootX = -16 * dir; rFootX = 20 * dir;
    }

    let backHandX = neckX - dir * 24, backHandY = neckY + 14;
    let frontHandX = neckX + dir * 24, frontHandY = neckY + 12;
    let swordAngle = dir * 0.25;
    let swordOnFront = true;

    if (f.state === 'idle') {
      frontHandX = neckX + dir * 22; frontHandY = neckY + 14;
      backHandX = neckX - dir * 22; backHandY = neckY + 16;
      swordAngle = dir * 0.18 + Math.sin(tNow * 4) * 0.06;
    } else if (f.state === 'run') {
      const sw = Math.sin(f.walkPhase);
      frontHandX = neckX + dir * 22; frontHandY = neckY + 10 + sw * 6;
      backHandX = neckX - dir * 20; backHandY = neckY + 14 - sw * 6;
      swordAngle = dir * 0.55;
    } else if (f.state === 'fly') {
      frontHandX = neckX + dir * 22; frontHandY = neckY + 10;
      backHandX = neckX - dir * 24; backHandY = neckY + 6;
      swordAngle = dir * -0.22;
    } else if (f.state === 'slash') {
      const t = 1 - f.stateTimer / 0.28;
      if (t < 0.28) {
        frontHandX = neckX - dir * 10; frontHandY = neckY - 14;
        swordAngle = -dir * 1.1;
      } else {
        const st = Math.min(1, (t - 0.28) / 0.45);
        frontHandX = neckX + dir * (28 + Math.sin(st * Math.PI) * 14);
        frontHandY = neckY + 8 + st * 12;
        swordAngle = dir * (-1.1 + st * 2.75);
      }
      backHandX = neckX - dir * 24; backHandY = neckY + 16;
    } else if (f.state === 'orb') {
      swordOnFront = false;
      backHandX = neckX - dir * 22; backHandY = neckY + 4; swordAngle = -dir * 0.12;
      frontHandX = neckX + dir * 32; frontHandY = neckY + 2;
    } else if (f.state === 'throw') {
      swordOnFront = false;
      backHandX = neckX - dir * 18; backHandY = neckY + 14; swordAngle = -dir * 0.15;
      frontHandX = neckX + dir * 28; frontHandY = neckY - 4;
    } else if (f.state === 'shield') {
      frontHandX = neckX + dir * 18; frontHandY = neckY + 14;
      backHandX = neckX - dir * 14; backHandY = neckY + 12;
      swordAngle = dir * 0.15;
    } else if (f.state === 'slip') {
      frontHandX = neckX + dir * 26; frontHandY = neckY - 14;
      backHandX = neckX - dir * 26; backHandY = neckY - 10;
      swordAngle = dir * 1.4;
    } else if (f.state === 'walkoff') {
      frontHandX = neckX + dir * 20; frontHandY = neckY + 18;
      backHandX = neckX - dir * 16; backHandY = neckY + 20;
      swordAngle = dir * 0.72;
    }

    if (f.state === 'shield') {
      ctx.save();
      ctx.strokeStyle = '#1e1c1a';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(neckX + dir * 4, neckY + 16, 46, -Math.PI * 0.75, Math.PI * 0.75);
      ctx.stroke();
      S.sketchCircle(ctx, neckX + dir * 2, neckY + 16, 42, 2.4, 'rgba(30,28,26,0.72)', 'rgba(235, 245, 232, 0.35)', s + 60, 2.2);
      ctx.restore();
    }

    if (f.state === 'slip') {
      S.sketchLine(ctx, -24, -10, -34, -42, 2.0, '#1e1c1a', s + 70, 1.0);
      S.sketchLine(ctx, -14, -8, -22, -38, 2.0, '#1e1c1a', s + 71, 1.0);
    }

    if (f.state === 'slash' && f.stateTimer < 0.21 && f.stateTimer > 0.04) {
      ctx.save();
      ctx.strokeStyle = '#1e1c1a';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      if (dir > 0) ctx.arc(neckX + 10, neckY + 6, 62, -1.15, 0.85);
      else ctx.arc(neckX - 10, neckY + 6, 62, Math.PI - 0.85, Math.PI + 1.15);
      ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      if (dir > 0) ctx.arc(neckX + 10, neckY + 6, 70, -0.95, 0.65);
      else ctx.arc(neckX - 10, neckY + 6, 70, Math.PI - 0.65, Math.PI + 0.95);
      ctx.stroke();
      ctx.restore();
    }

    const strokeCol = (f.state === 'hurt' && Math.floor(tNow * 24) % 2 === 0) ? '#b83c2c' : '#1e1c1a';
    const armWidth = (f.role === 'ren' && f.state === 'idle') ? 3.8 : 3.2;

    S.sketchLine(ctx, hipX, hipY, lFootX, lFootY, 3.2, strokeCol, s + 1, 1.0);
    S.sketchLine(ctx, hipX, hipY, rFootX, rFootY, 3.2, strokeCol, s + 2, 1.0);
    S.sketchLine(ctx, hipX, hipY, neckX, neckY, 3.4, strokeCol, s + 3, 1.0);
    S.sketchLine(ctx, neckX, neckY + 6, backHandX, backHandY, armWidth, strokeCol, s + 4, 1.0);
    S.sketchLine(ctx, neckX, neckY + 6, frontHandX, frontHandY, armWidth, strokeCol, s + 5, 1.0);

    const swordX = swordOnFront ? frontHandX : backHandX;
    const swordY = swordOnFront ? frontHandY : backHandY;
    S.drawBroadSword(ctx, swordX, swordY, swordAngle, 1.0, f.role === 'ren', s + 20);

    S.sketchCircle(ctx, headX, headY, 15.5, 3.1, strokeCol, '#f6f2e8', s + 10, 1.0);
    drawClassicFace(ctx, f.role, f.state, headX, headY, dir, s + 15);

    if (f.role === 'ren') {
      ctx.save();
      ctx.font = 'bold 20px "Kaiti SC", "STKaiti", "PingFang SC", cursive';
      ctx.fillStyle = '#1e1c1a';
      ctx.textAlign = 'center';
      ctx.fillText('人', headX, headY - 22);
      ctx.restore();
    }

    if (f.state === 'fly') {
      S.sketchLine(ctx, -14, 10, 14, 10, 1.8, 'rgba(30,28,26,0.55)', s + 44, 1.2);
      S.sketchLine(ctx, -9, 17, 9, 17, 1.5, 'rgba(30,28,26,0.40)', s + 45, 1.2);
    }

    drawPlayerTag(ctx, f, env, headX, f.role === 'ren' ? headY - 46 : headY - 28);
    ctx.restore();
  }

  // =========================================================
  // 新角色动画资产：三眼银剑王（体积约普通小人的 2.35 倍）
  // =========================================================
  function drawPointedCuff(ctx, x, y, angle, strokeCol, seed) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#f6f2e8';
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-7, -20);
    ctx.lineTo(0, -30);
    ctx.lineTo(7, -20);
    ctx.lineTo(7, 10);
    ctx.lineTo(0, 20);
    ctx.lineTo(-7, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Cuff straps from drawing
    S.sketchLine(ctx, -6, -9, 6, -5, 2.0, strokeCol, seed + 1, 0.4);
    S.sketchLine(ctx, -6, 3, 6, 7, 2.0, strokeCol, seed + 2, 0.4);
    ctx.restore();
  }

  function drawTriEyeKing(ctx, f, env) {
    const s = S.boilSeed(800 + f.id * 113, env.time);
    const dir = f.facing;
    const tNow = env.time;
    const strokeCol = (f.state === 'hurt' && Math.floor(tNow * 24) % 2 === 0) ? '#b83c2c' : '#1e1c1a';

    // Wide ground shadow beneath floating disc
    const hAbove = Math.max(0, env.groundY - f.y);
    const shScale = Math.max(0.4, 1 - hAbove / 420);
    ctx.save();
    ctx.fillStyle = 'rgba(30,28,26,0.13)';
    ctx.beginPath();
    ctx.ellipse(f.x, env.groundY + 4, 62 * shScale, 9 * shScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(f.x, f.y);

    // KO pose: tilted hover disc & giant armored body collapsed on ground
    if (f.state === 'ko') {
      for (let i = 0; i < 3; i++) {
        S.sketchLine(ctx, -dir * (75 + i * 16), -34 - i * 6, -dir * (44 + i * 16), -12 - i * 6, 2.6, '#1e1c1a', s + 80 + i, 0.9);
      }
      S.sketchEllipse(ctx, -dir * 48, -14, 44, 12, 2.8, '#1e1c1a', '#f6f2e8', s + 1, 1.2);
      ctx.save();
      ctx.translate(dir * 12, -24);
      ctx.rotate(dir * 1.48);
      // Collapsed torso & head
      ctx.fillStyle = '#f6f2e8';
      ctx.strokeStyle = '#1e1c1a';
      ctx.lineWidth = 3;
      ctx.strokeRect(-19, -76, 38, 44);
      ctx.fillRect(-19, -76, 38, 44);
      ctx.strokeRect(-19, -76, 38, 44);
      // Three X eyes
      [-9, 0, 9].forEach((ex, i) => {
        S.sketchLine(ctx, ex - 3, -58, ex + 3, -50, 2.0, '#1e1c1a', s + 10 + i, 0.3);
        S.sketchLine(ctx, ex + 3, -58, ex - 3, -50, 2.0, '#1e1c1a', s + 15 + i, 0.3);
      });
      S.drawSerratedSilverSword(ctx, dir * 20, -14, dir * 0.55, 0.85, s + 30, '#2b2d30');
      ctx.restore();
      ctx.restore();
      return;
    }

    // Slip tumble rotation around center of mass
    if (f.state === 'slip') {
      ctx.translate(0, -112);
      ctx.rotate(f.slipRot);
      ctx.translate(0, 112);
    }

    const hoverBob = f.state === 'fly'
      ? Math.sin(tNow * 6.5 + f.id) * 8
      : Math.sin(tNow * 3.8 + f.id * 2) * 4;
    const crouch = f.state === 'shield' ? 16 : 0;
    const tilt = Math.max(-0.14, Math.min(0.14, f.vx * 0.00042));

    // ---- 1. Concentric Floating Oval Hover Disc (底座三层同心圆盘) ----
    ctx.save();
    ctx.translate(0, -18 + hoverBob * 0.55 + crouch * 0.3);
    ctx.rotate(tilt);
    S.sketchEllipse(ctx, 0, 0, 62, 18, 3.2, strokeCol, '#f6f2e8', s + 1, 1.3);
    S.sketchEllipse(ctx, 0, -1, 44, 12.5, 2.8, strokeCol, '#f6f2e8', s + 2, 1.1);
    // Inner rounded pebble/pad
    ctx.fillStyle = '#f6f2e8';
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.roundRect(-14, -6, 28, 12, 5);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // ---- 2. Vertical Rising Aura Lines (原画两侧竖向气场线) ----
    const auraShift = (tNow * 24) % 18;
    ctx.save();
    ctx.globalAlpha = 0.65;
    S.sketchLine(ctx, -46, -42 - auraShift * 0.4, -42, -162 - auraShift * 0.4, 2.0, strokeCol, s + 6, 1.0);
    S.sketchLine(ctx, 48, -46 - auraShift * 0.4, 44, -166 - auraShift * 0.4, 2.0, strokeCol, s + 7, 1.0);
    S.sketchLine(ctx, -28, -54, -26, -96, 1.8, strokeCol, s + 8, 0.8);
    S.sketchLine(ctx, 28, -54, 26, -96, 1.8, strokeCol, s + 9, 0.8);
    ctx.restore();

    // ---- 3. Stick Legs & Stick Waist (A字火柴人下身) ----
    const bodyY = hoverBob + crouch;
    const hipY = -66 + bodyY;
    const waistTopY = -98 + bodyY;
    const shoulderY = -148 + bodyY;
    const headBottomY = -152 + bodyY;
    const headTopY = -196 + bodyY;
    const footSpread = f.state === 'run' ? Math.sin(f.walkPhase) * 4 : 0;

    S.sketchLine(ctx, 0, hipY, -28 + footSpread, -22 + hoverBob * 0.55, 3.2, strokeCol, s + 10, 0.9);
    S.sketchLine(ctx, 0, hipY, 28 - footSpread, -22 + hoverBob * 0.55, 3.2, strokeCol, s + 11, 0.9);
    S.sketchLine(ctx, 0, hipY, 0, waistTopY, 3.3, strokeCol, s + 12, 0.8);

    // ---- 4. Spiky Open-Front Armor Jacket & Wide Sleeves ----
    const leanX = f.state === 'run' ? dir * 7 : f.state === 'slash' ? dir * 10 : 0;
    ctx.save();
    ctx.translate(leanX, 0);

    // Jacket silhouette (T-shape with wide flaring sleeves)
    ctx.fillStyle = '#f6f2e8';
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 3.0;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    // Top shoulder edge -> right sleeve -> right waist -> hem -> open front -> left waist -> left sleeve
    ctx.moveTo(-48, shoulderY + 12);
    ctx.lineTo(-14, shoulderY);
    ctx.lineTo(14, shoulderY);
    ctx.lineTo(48, shoulderY + 10);
    ctx.lineTo(42, shoulderY + 34);
    ctx.lineTo(20, shoulderY + 26);
    ctx.lineTo(18, waistTopY + 4);
    ctx.lineTo(-18, waistTopY + 4);
    ctx.lineTo(-20, shoulderY + 26);
    ctx.lineTo(-42, shoulderY + 36);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Open-front sawtooth zigzag lapel spikes (胸口对襟双侧锯齿)
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 2.4;
    // Left lapel zigzag
    ctx.beginPath();
    ctx.moveTo(-16, waistTopY + 4);
    ctx.lineTo(-16, shoulderY + 24);
    ctx.moveTo(-6, waistTopY + 4);
    ctx.lineTo(-6, shoulderY + 24);
    for (let i = 0; i < 4; i++) {
      const y0 = shoulderY + 26 + i * 7;
      ctx.moveTo(-16, y0);
      ctx.lineTo(-6, y0 + 3.5);
      ctx.lineTo(-16, y0 + 7);
    }
    ctx.stroke();
    // Right lapel zigzag
    ctx.beginPath();
    ctx.moveTo(16, waistTopY + 4);
    ctx.lineTo(16, shoulderY + 24);
    ctx.moveTo(6, waistTopY + 4);
    ctx.lineTo(6, shoulderY + 24);
    for (let i = 0; i < 4; i++) {
      const y0 = shoulderY + 26 + i * 7;
      ctx.moveTo(16, y0);
      ctx.lineTo(6, y0 + 3.5);
      ctx.lineTo(16, y0 + 7);
    }
    ctx.stroke();

    // Rows of sharp spikes along BOTH shoulders (双肩排刺)
    ctx.fillStyle = '#f6f2e8';
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 2.4;
    // Left shoulder spikes
    ctx.beginPath();
    ctx.moveTo(-45, shoulderY + 11);
    for (let i = 0; i < 5; i++) {
      const bx = -44 + i * 7.2;
      const by = shoulderY + 10 - i * 2.2;
      ctx.lineTo(bx + 2.2, by - 11 + S.jitter(s + 20 + i, 1.0));
      ctx.lineTo(bx + 7.0, by - 1.5);
    }
    ctx.stroke();
    // Right shoulder spikes
    ctx.beginPath();
    ctx.moveTo(14, shoulderY + 1);
    for (let i = 0; i < 5; i++) {
      const bx = 14 + i * 6.8;
      const by = shoulderY + 1 + i * 2.0;
      ctx.lineTo(bx + 3.6, by - 10 + S.jitter(s + 26 + i, 1.0));
      ctx.lineTo(bx + 6.8, by + 2.0);
    }
    ctx.stroke();

    // Pointed cuffs on both sleeves (双袖尖刺护腕)
    drawPointedCuff(ctx, -48, shoulderY + 26, -0.35, strokeCol, s + 32);
    drawPointedCuff(ctx, 48, shoulderY + 24, 0.35, strokeCol, s + 36);

    // ---- 5. Head, Three Vertical Eyes & Spiked Metallic Crown ----
    // Side head spikes (头部左右锯齿刺)
    ctx.fillStyle = '#f6f2e8';
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-19, headTopY + 3);
    for (let i = 0; i < 6; i++) {
      const py = headTopY + 4 + i * 7;
      ctx.lineTo(-30 + S.jitter(s + 40 + i, 1.1), py + 3);
      ctx.lineTo(-19, py + 7);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(19, headTopY + 3);
    for (let i = 0; i < 6; i++) {
      const py = headTopY + 4 + i * 7;
      ctx.lineTo(30 + S.jitter(s + 47 + i, 1.1), py + 3);
      ctx.lineTo(19, py + 7);
    }
    ctx.stroke();

    // Metallic silver pointed crown/helmet with radiating spikes & central horn (金属银尖刺王冠)
    const crownGrad = ctx.createLinearGradient(-22, headTopY - 46, 22, headTopY);
    crownGrad.addColorStop(0, '#f5f7fa');
    crownGrad.addColorStop(0.5, '#d6dce4');
    crownGrad.addColorStop(1, '#bcc4cf');

    ctx.fillStyle = crownGrad;
    ctx.strokeStyle = '#3a3d42';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    // Left crown spikes climbing up to tall center horn, then right crown spikes down
    ctx.moveTo(-20, headTopY + 1);
    ctx.lineTo(-31, headTopY - 7);
    ctx.lineTo(-17, headTopY - 12);
    ctx.lineTo(-26, headTopY - 22);
    ctx.lineTo(-11, headTopY - 22);
    ctx.lineTo(-15, headTopY - 35);
    ctx.lineTo(-4, headTopY - 30);
    // Tall central horn spike!
    ctx.lineTo(0, headTopY - 52 + S.jitter(s + 55, 1.0));
    ctx.lineTo(5, headTopY - 30);
    ctx.lineTo(16, headTopY - 36);
    ctx.lineTo(13, headTopY - 22);
    ctx.lineTo(27, headTopY - 21);
    ctx.lineTo(19, headTopY - 11);
    ctx.lineTo(31, headTopY - 6);
    ctx.lineTo(20, headTopY + 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner triangular helmet visor line
    ctx.fillStyle = '#f6f2e8';
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 2.7;
    ctx.beginPath();
    ctx.moveTo(-19, headTopY + 1);
    ctx.lineTo(0, headTopY - 25);
    ctx.lineTo(19, headTopY + 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Rounded-rectangular visor head
    ctx.fillStyle = '#f6f2e8';
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.roundRect(-19, headTopY, 38, 44, 7);
    ctx.fill();
    ctx.stroke();

    // Three vertical oval eyes (三只竖眼 0 0 0)
    const eyeShiftX = dir * 2;
    const eyeRy = (f.state === 'slip' || f.state === 'hurt') ? 8 : 6.2;
    const eyeRx = (f.state === 'slip' || f.state === 'hurt') ? 4.2 : 3.2;
    [-9.5, 0, 9.5].forEach((ex, i) => {
      S.sketchEllipse(ctx, ex + eyeShiftX, headTopY + 17, eyeRx, eyeRy, 2.4, strokeCol, '#fffdf8', s + 60 + i, 0.35);
    });

    // ---- 6. Stick Arms & Giant Serrated Metallic Sword ----
    let frontHandX = dir * 82;
    let frontHandY = shoulderY + 34;
    let backHandX = -dir * 66;
    let backHandY = shoulderY + 42;
    let swordAngle = dir * 0.42 + Math.sin(tNow * 3.5) * 0.05;

    if (f.state === 'run' || f.state === 'walkoff') {
      frontHandX = dir * 80;
      frontHandY = shoulderY + 36 + Math.sin(f.walkPhase) * 5;
      swordAngle = dir * 0.62;
    } else if (f.state === 'fly') {
      frontHandX = dir * 84;
      frontHandY = shoulderY + 26;
      swordAngle = dir * 0.28;
    } else if (f.state === 'slash') {
      // Sweeping downward-forward giant sword slash so it hits both tall & small foes cleanly!
      const t = 1 - f.stateTimer / 0.28;
      if (t < 0.28) {
        frontHandX = dir * 56;
        frontHandY = shoulderY - 12;
        swordAngle = -dir * 0.75;
      } else {
        const st = Math.min(1, (t - 0.28) / 0.45);
        frontHandX = dir * (78 + Math.sin(st * Math.PI) * 24);
        frontHandY = shoulderY + 18 + st * 48;
        swordAngle = dir * (-0.75 + st * 2.55);
      }
    } else if (f.state === 'orb') {
      frontHandX = dir * 88;
      frontHandY = shoulderY + 56;
      swordAngle = dir * 0.12;
    } else if (f.state === 'throw') {
      frontHandX = dir * 84;
      frontHandY = shoulderY + 46;
      swordAngle = dir * 0.22;
    } else if (f.state === 'shield') {
      frontHandX = dir * 64;
      frontHandY = shoulderY + 40;
      swordAngle = dir * 0.16;
    } else if (f.state === 'slip') {
      frontHandX = dir * 74;
      frontHandY = shoulderY - 6;
      swordAngle = dir * 1.3;
    }

    // Back thin stick extension
    S.sketchLine(ctx, -dir * 48, shoulderY + 26, backHandX, backHandY, 2.8, strokeCol, s + 70, 0.8);
    // Front thin stick arm reaching to sword hilt
    S.sketchLine(ctx, dir * 48, shoulderY + 24, frontHandX, frontHandY, 2.8, strokeCol, s + 71, 0.8);

    // Giant slash arc trail
    if (f.state === 'slash' && f.stateTimer < 0.21 && f.stateTimer > 0.04) {
      ctx.save();
      ctx.strokeStyle = '#1e1c1a';
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      if (dir > 0) ctx.arc(28, shoulderY + 46, 128, -1.05, 0.85);
      else ctx.arc(-28, shoulderY + 46, 128, Math.PI - 0.85, Math.PI + 1.05);
      ctx.stroke();
      ctx.strokeStyle = '#8b939e';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      if (dir > 0) ctx.arc(28, shoulderY + 46, 140, -0.9, 0.72);
      else ctx.arc(-28, shoulderY + 46, 140, Math.PI - 0.72, Math.PI + 0.9);
      ctx.stroke();
      ctx.restore();
    }

    // Giant Serrated Silver Sword!
    S.drawSerratedSilverSword(ctx, frontHandX, frontHandY, swordAngle, 1.0, s + 75, strokeCol);

    // ---- 7. Three Floating Four-Pointed Stars / Diamonds (三颗悬浮四角星芒) ----
    const starBob1 = Math.sin(tNow * 3.2) * 5;
    const starBob2 = Math.sin(tNow * 3.8 + 1.7) * 4;
    const starBob3 = Math.sin(tNow * 3.5 + 3.4) * 4;
    // Top big metallic silver star
    S.drawFourPointStar(ctx, dir * 48, headTopY - 8 + starBob1, 15, 22, '#69717c', '#f2f5f9', 2.4, s + 81);
    // Lower front star near sword pommel
    S.drawFourPointStar(ctx, dir * 64, waistTopY + 14 + starBob2, 10, 14, strokeCol, '#f6f2e8', 2.4, s + 82);
    // Lower back star near back cuff
    S.drawFourPointStar(ctx, -dir * 66, waistTopY + 20 + starBob3, 12, 16, strokeCol, '#f6f2e8', 2.4, s + 83);

    // Giant scaled hand-drawn round shield (Panel 4 style scaled to boss!)
    if (f.state === 'shield') {
      ctx.save();
      ctx.strokeStyle = '#1e1c1a';
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.arc(dir * 8, -118 + bodyY, 102, -Math.PI * 0.72, Math.PI * 0.72);
      ctx.stroke();
      S.sketchCircle(ctx, dir * 4, -118 + bodyY, 96, 2.6, 'rgba(30,28,26,0.7)', 'rgba(235, 245, 232, 0.28)', s + 90, 2.8);
      ctx.restore();
    }

    ctx.restore(); // end leanX

    if (f.state === 'fly') {
      S.sketchLine(ctx, -38, 12, 38, 12, 2.2, 'rgba(30,28,26,0.55)', s + 95, 1.4);
      S.sketchLine(ctx, -24, 21, 24, 21, 1.8, 'rgba(30,28,26,0.38)', s + 96, 1.4);
    }

    drawPlayerTag(ctx, f, env, leanX, headTopY - 60);
    ctx.restore();
  }

  // =========================================================
  // 注册默认角色池
  // =========================================================
  register({
    id: 'angry',
    name: '怒气大剑客',
    scale: 1.0,
    metrics: {
      height: 100,
      halfW: 24,
      slashReach: 54,
      slashRangeX: 58,
      slashRangeY: 62,
      orbOffsetX: 42,
      orbOffsetY: 52,
      bananaOffsetX: 26,
      bananaOffsetY: 54,
      calloutOffsetY: 118
    },
    draw: drawClassicStickman
  });

  register({
    id: 'ren',
    name: '「人」字剑客',
    scale: 1.0,
    metrics: {
      height: 100,
      halfW: 24,
      slashReach: 54,
      slashRangeX: 58,
      slashRangeY: 62,
      orbOffsetX: 42,
      orbOffsetY: 52,
      bananaOffsetX: 26,
      bananaOffsetY: 54,
      calloutOffsetY: 132
    },
    draw: drawClassicStickman
  });

  register({
    id: 'trieye',
    name: '三眼银剑王',
    scale: 2.35,
    metrics: {
      height: 238,
      halfW: 54,
      slashReach: 116,
      slashRangeX: 106,
      slashRangeY: 138,
      orbOffsetX: 84,
      orbOffsetY: 74,
      bananaOffsetX: 66,
      bananaOffsetY: 84,
      calloutOffsetY: 262
    },
    draw: drawTriEyeKing
  });

  PaperArena.CharacterAssets = { register, get, list };
})(window);
