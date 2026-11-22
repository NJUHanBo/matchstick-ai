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
    const bodyScale = f.bodyScale || 1.0;
    const isBoosted = f.speedBoostTimer > 0;
    const strokeCol = (f.state === 'hurt' && Math.floor(tNow * 24) % 2 === 0) ? '#b83c2c' : '#1e1c1a';

    // Wide ground shadow beneath floating disc (scales with shrink!)
    const hAbove = Math.max(0, env.groundY - f.y);
    const shScale = Math.max(0.4, 1 - hAbove / 420) * bodyScale;
    ctx.save();
    ctx.fillStyle = 'rgba(30,28,26,0.13)';
    ctx.beginPath();
    ctx.ellipse(f.x, env.groundY + 4, 62 * shScale, 9 * shScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(bodyScale, bodyScale);

    // KO pose: tilted hover disc & giant armored body collapsed on ground
    if (f.state === 'ko') {
      for (let i = 0; i < 3; i++) {
        S.sketchLine(ctx, -dir * (75 + i * 16), -34 - i * 6, -dir * (44 + i * 16), -12 - i * 6, 2.6, '#1e1c1a', s + 80 + i, 0.9);
      }
      S.sketchEllipse(ctx, -dir * 48, -14, 44, 12, 2.8, '#1e1c1a', '#f6f2e8', s + 1, 1.2);
      ctx.save();
      ctx.translate(dir * 12, -24);
      ctx.rotate(dir * 1.48);
      ctx.fillStyle = '#f6f2e8';
      ctx.strokeStyle = '#1e1c1a';
      ctx.lineWidth = 3;
      ctx.fillRect(-19, -76, 38, 44);
      ctx.strokeRect(-19, -76, 38, 44);
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
      : Math.sin(tNow * (isBoosted ? 9 : 3.8) + f.id * 2) * (isBoosted ? 5.5 : 4);
    const crouch = f.state === 'shield' ? 16 : 0;
    const tilt = Math.max(-0.18, Math.min(0.18, f.vx * 0.00045));

    // ---- 0. Speed-Boost Ultimate Visuals (草图底部双喷射器 UU + 速度线 ===) ----
    if (isBoosted) {
      const flicker = Math.sin(tNow * 38) * 4;
      // Trailing horizontal speed lines behind the hover disc
      ctx.save();
      ctx.strokeStyle = 'rgba(30,28,26,0.72)';
      ctx.lineWidth = 2.6;
      S.sketchLine(ctx, -dir * 68, -26, -dir * (128 + flicker), -24, 2.8, '#1e1c1a', s + 120, 1.0);
      S.sketchLine(ctx, -dir * 62, -12, -dir * (114 - flicker), -10, 2.4, '#c94a38', s + 121, 1.0);
      S.sketchLine(ctx, -dir * 52, -40, -dir * (98 + flicker), -42, 2.0, '#1e1c1a', s + 122, 1.0);
      ctx.restore();
    }

    // ---- 1. Concentric Floating Oval Hover Disc (底座三层同心圆盘) ----
    ctx.save();
    ctx.translate(0, -18 + hoverBob * 0.55 + crouch * 0.3);
    ctx.rotate(tilt);

    // Twin U-shaped thruster pods under disc (草图双喷口 UU，加速大招时喷出火焰!)
    [-22, 22].forEach((tx, idx) => {
      ctx.save();
      ctx.translate(tx, 14);
      ctx.fillStyle = isBoosted ? '#fff1c2' : '#f6f2e8';
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-12, -2);
      ctx.lineTo(-10, 14 + (isBoosted ? 5 + Math.sin(tNow * 40 + idx) * 4 : 0));
      ctx.quadraticCurveTo(0, 22 + (isBoosted ? 8 : 0), 10, 14 + (isBoosted ? 5 + Math.cos(tNow * 40 + idx) * 4 : 0));
      ctx.lineTo(12, -2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Inner U thruster core
      ctx.strokeStyle = isBoosted ? '#c94a38' : strokeCol;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(-5, 9 + (isBoosted ? 4 : 0));
      ctx.quadraticCurveTo(0, 14 + (isBoosted ? 6 : 0), 5, 9 + (isBoosted ? 4 : 0));
      ctx.lineTo(6, 0);
      ctx.stroke();
      ctx.restore();
    });

    S.sketchEllipse(ctx, 0, 0, 62, 18, 3.2, strokeCol, '#f6f2e8', s + 1, 1.3);
    S.sketchEllipse(ctx, 0, -1, 44, 12.5, 2.8, strokeCol, '#f6f2e8', s + 2, 1.1);
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

    // Giant slash arc trail (grows massively when K-skill extends the blade!)
    const bladeMult = f.swordScale || 1.0;
    if (f.state === 'slash' && f.stateTimer < 0.21 && f.stateTimer > 0.04) {
      const arcR = 128 * (0.35 + 0.65 * bladeMult);
      ctx.save();
      ctx.strokeStyle = bladeMult > 1.1 ? '#b8861d' : '#1e1c1a';
      ctx.lineWidth = bladeMult > 1.1 ? 5.0 : 4.2;
      ctx.beginPath();
      if (dir > 0) ctx.arc(28, shoulderY + 46, arcR, -1.05, 0.85);
      else ctx.arc(-28, shoulderY + 46, arcR, Math.PI - 0.85, Math.PI + 1.05);
      ctx.stroke();
      ctx.strokeStyle = '#8b939e';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      if (dir > 0) ctx.arc(28, shoulderY + 46, arcR + 14, -0.9, 0.72);
      else ctx.arc(-28, shoulderY + 46, arcR + 14, Math.PI - 0.72, Math.PI + 0.9);
      ctx.stroke();
      ctx.restore();
    }

    // Giant Serrated Silver Sword (scales dynamically with K skill!)
    S.drawSerratedSilverSword(ctx, frontHandX, frontHandY, swordAngle, 1.0, s + 75, strokeCol, bladeMult);

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
  // 新角色动画资产：影子（紫色长围巾、藏进阴影、三段瞬身、围巾暗影空间）
  // =========================================================
  function drawShadowStickman(ctx, f, env) {
    const s = S.boilSeed(1100 + f.id * 97, env.time);
    const dir = f.facing;
    const tNow = env.time;

    // 隐身状态处理（草图 1 格左图：贴地紫色阴影圆斑）
    if (f.stealthTimer > 0 && f.state !== 'ko') {
      const isLocalHuman1P = (env.gameMode !== '2p' && f.id === 0);
      if (isLocalHuman1P) {
        // 单人打电脑时，1P 自己可见半透明贴地紫影圆斑，方便走位绕背
        S.drawShadowPuddle(ctx, f.x, env.groundY, 0.72, s);
        ctx.save();
        ctx.font = 'bold 12px "PingFang SC", sans-serif';
        ctx.fillStyle = '#6b3e99';
        ctx.textAlign = 'center';
        ctx.fillText(`阴影中 ${f.stealthTimer.toFixed(1)}s`, f.x, env.groundY - 22);
        ctx.restore();
      } else if (f.stealthEnterFlash > 0) {
        // 2P 同屏或电脑操作：仅在钻入阴影的瞬间闪一下紫影斑，随后彻底不可见
        S.drawShadowPuddle(ctx, f.x, env.groundY, Math.min(0.65, f.stealthEnterFlash * 2.4), s);
      }
      return;
    }

    // Ground shadow (略带紫色暗影感)
    const hAbove = Math.max(0, env.groundY - f.y);
    const shScale = Math.max(0.35, 1 - hAbove / 380);
    ctx.save();
    ctx.fillStyle = 'rgba(78, 42, 115, 0.22)';
    ctx.beginPath();
    ctx.ellipse(f.x, env.groundY + 3, 25 * shScale, 5.8 * shScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(f.x, f.y);

    if (f.state === 'ko') {
      for (let i = 0; i < 3; i++) {
        S.sketchLine(ctx, -dir * (38 + i * 11), -22 - i * 4, -dir * (18 + i * 11), -8 - i * 4, 2.2, '#4e2a73', s + 80 + i, 0.7);
      }
      const headX = dir * 24;
      const hipX = -dir * 18;
      S.sketchLine(ctx, hipX, -9, headX - dir * 13, -12, 3.2, '#1e1c1a', s + 1, 0.9);
      S.sketchLine(ctx, hipX, -9, hipX - dir * 20, -3, 3.0, '#1e1c1a', s + 2, 0.9);
      S.sketchLine(ctx, hipX, -9, hipX - dir * 14, -19, 3.0, '#1e1c1a', s + 3, 0.9);
      S.drawShadowScarf(ctx, headX - dir * 11, -13, dir, 0, tNow, s + 25, 0);
      S.sketchCircle(ctx, headX, -14, 14, 3.0, '#1e1c1a', '#f6f2e8', s + 5, 0.9);
      S.sketchLine(ctx, headX - 4, -16, headX + 4, -12, 2, '#1e1c1a', s + 11, 0.3);
      S.sketchLine(ctx, headX + 4, -16, headX - 4, -12, 2, '#1e1c1a', s + 12, 0.3);
      ctx.restore();
      return;
    }

    if (f.state === 'slip') {
      ctx.translate(0, -48);
      ctx.rotate(f.slipRot);
      ctx.translate(0, 48);
    }

    const isInvulnBlink = f.state === 'blinkDash' || f.invuln > 0;
    if (isInvulnBlink) {
      ctx.globalAlpha = 0.85;
    }

    const bob = f.state === 'idle' ? Math.sin(tNow * 5.5 + f.id * 2) * 2.4
      : f.state === 'fly' ? Math.sin(tNow * 7 + f.id) * 5.5
      : f.state === 'run' ? Math.abs(Math.sin(f.walkPhase)) * -4 : 0;
    const crouch = f.state === 'shield' ? 11 : f.state === 'blinkDash' ? 8 : 0;
    const hipX = 0;
    const hipY = -34 + bob + crouch;
    const neckX = f.state === 'run' ? dir * 8
      : f.state === 'blinkDash' ? dir * 15
      : f.state === 'slash' ? dir * 10
      : f.state === 'scarfGrab' ? dir * 9 : 0;
    const neckY = -68 + bob + crouch;
    const headX = neckX;
    const headY = neckY - 16;

    let lFootX = -12, lFootY = 0, rFootX = 12, rFootY = 0;
    if (f.state === 'run' || f.state === 'walkoff') {
      const sw = Math.sin(f.walkPhase);
      lFootX = sw * 20; lFootY = Math.min(0, -Math.cos(f.walkPhase) * 9);
      rFootX = -sw * 20; rFootY = Math.min(0, Math.cos(f.walkPhase) * 9);
    } else if (f.state === 'blinkDash') {
      lFootX = -22 * dir; rFootX = 18 * dir; lFootY = -5;
    } else if (!f.onGround) {
      lFootX = -10 - dir * 4; lFootY = -6 + bob * 0.5;
      rFootX = 10 - dir * 2; rFootY = -12 + bob * 0.5;
    } else if (f.state === 'shield') {
      lFootX = -18; rFootX = 18;
    } else if (f.state === 'slash') {
      lFootX = -16 * dir; rFootX = 20 * dir;
    }

    let backHandX = neckX - dir * 18, backHandY = neckY + 20;
    let frontHandX = neckX + dir * 20, frontHandY = neckY + 18;
    if (f.state === 'run') {
      const sw = Math.sin(f.walkPhase);
      frontHandX = neckX + dir * 20; frontHandY = neckY + 12 + sw * 6;
      backHandX = neckX - dir * 22; backHandY = neckY + 16 - sw * 6;
    } else if (f.state === 'slash' || f.state === 'blinkDash') {
      frontHandX = neckX + dir * 32; frontHandY = neckY + 6;
      backHandX = neckX - dir * 24; backHandY = neckY + 12;
    } else if (f.state === 'scarfGrab') {
      frontHandX = neckX + dir * 28; frontHandY = neckY + 2;
      backHandX = neckX - dir * 16; backHandY = neckY + 18;
    } else if (f.state === 'shield') {
      frontHandX = neckX + dir * 18; frontHandY = neckY + 14;
      backHandX = neckX - dir * 14; backHandY = neckY + 12;
    }

    // Shield dome
    if (f.state === 'shield') {
      ctx.save();
      ctx.strokeStyle = '#4e2a73';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(neckX + dir * 4, neckY + 16, 46, -Math.PI * 0.75, Math.PI * 0.75);
      ctx.stroke();
      S.sketchCircle(ctx, neckX + dir * 2, neckY + 16, 42, 2.4, 'rgba(78,42,115,0.72)', 'rgba(218, 200, 245, 0.30)', s + 60, 2.2);
      ctx.restore();
    }

    // Purple crescent slash trail (还原草图 1 格右边的紫色弧斩！)
    if (f.state === 'slash' && f.stateTimer < 0.22 && f.stateTimer > 0.03) {
      const big = f.lastBackstabGlow > 0;
      const rad = big ? 76 : 62;
      ctx.save();
      ctx.strokeStyle = '#6f3fa6';
      ctx.lineWidth = big ? 6.0 : 4.2;
      ctx.beginPath();
      if (dir > 0) ctx.arc(neckX + 12, neckY + 8, rad, -1.15, 0.9);
      else ctx.arc(neckX - 12, neckY + 8, rad, Math.PI - 0.9, Math.PI + 1.15);
      ctx.stroke();
      ctx.strokeStyle = '#b48ce6';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      if (dir > 0) ctx.arc(neckX + 12, neckY + 8, rad + 8, -0.95, 0.7);
      else ctx.arc(neckX - 12, neckY + 8, rad + 8, Math.PI - 0.7, Math.PI + 0.95);
      ctx.stroke();
      ctx.restore();
    }

    // Blink cross-hatch purple slash burst (还原草图 2 格右边的紫色交叉乱斩！)
    if (f.state === 'blinkDash') {
      ctx.save();
      const bx = neckX + dir * 30;
      const by = neckY + 10;
      for (let i = 0; i < 6; i++) {
        const yOff = -22 + i * 9;
        S.sketchLine(ctx, bx - 24, by + yOff, bx + 26, by + yOff - 5, 2.8, i % 2 === 0 ? '#6f3fa6' : '#9c6ed4', s + 100 + i, 1.8);
      }
      for (let i = 0; i < 4; i++) {
        const xOff = -14 + i * 10;
        S.sketchLine(ctx, bx + xOff, by - 26, bx + xOff + 4, by + 26, 2.4, '#4e2a73', s + 110 + i, 1.5);
      }
      // Invulnerability ring aura
      S.sketchEllipse(ctx, neckX, neckY + 14, 34, 48, 2.0, 'rgba(130, 82, 188, 0.65)', null, s + 120, 1.8);
      ctx.restore();
    }

    // Scarf Grab portal + extending purple scarf (还原草图大招左图：紫围巾伸出 + 紫色空间门!)
    let grabExt = 0;
    if (f.state === 'scarfGrab') {
      const p = 1 - f.stateTimer / 0.34;
      const reach = p < 0.55 ? (p / 0.55) : Math.max(0, 1 - (p - 0.55) / 0.45);
      grabExt = reach * (f.stats.domainRange || 200);
      // Tall purple portal rift behind shadow/target
      S.sketchEllipse(ctx, -dir * 24, -52, 14, 46, 2.8, '#5b308a', 'rgba(116, 68, 168, 0.48)', s + 130, 1.8);
    }

    const strokeCol = (f.state === 'hurt' && Math.floor(tNow * 24) % 2 === 0) ? '#b83c2c' : '#1e1c1a';

    // Flowing purple scarf drawn behind neck (or extending forward during ult!)
    if (grabExt <= 4) {
      S.drawShadowScarf(ctx, neckX, neckY, dir, f.vx, tNow, s + 30, 0);
    }

    // Stickman body
    S.sketchLine(ctx, hipX, hipY, lFootX, lFootY, 3.1, strokeCol, s + 1, 0.9);
    S.sketchLine(ctx, hipX, hipY, rFootX, rFootY, 3.1, strokeCol, s + 2, 0.9);
    S.sketchLine(ctx, hipX, hipY, neckX, neckY, 3.3, strokeCol, s + 3, 0.9);
    S.sketchLine(ctx, neckX, neckY + 6, backHandX, backHandY, 3.0, strokeCol, s + 4, 0.9);
    S.sketchLine(ctx, neckX, neckY + 6, frontHandX, frontHandY, 3.0, strokeCol, s + 5, 0.9);

    // Subtle shadow blade in front hand during slash
    if (f.state === 'slash' || f.state === 'blinkDash') {
      S.sketchLine(ctx, frontHandX, frontHandY, frontHandX + dir * 30, frontHandY - 10, 4.0, '#6b3e99', s + 18, 0.9);
    }

    // Extending grab scarf drawn on top of arm
    if (grabExt > 4) {
      S.drawShadowScarf(ctx, neckX, neckY, dir, f.vx, tNow, s + 30, grabExt);
    }

    // Minimalist cool stickman head (对照草图左上：简洁空白圆头配紫围巾)
    S.sketchCircle(ctx, headX, headY, 15, 3.0, strokeCol, '#f6f2e8', s + 10, 0.9);
    if (f.state === 'hurt' || f.state === 'slip') {
      S.sketchCircle(ctx, headX + dir * 3, headY + 2, 4, 2.0, strokeCol, null, s + 14, 0.4);
    }

    if (f.state === 'fly') {
      S.sketchLine(ctx, -14, 10, 14, 10, 1.8, 'rgba(92,48,140,0.55)', s + 44, 1.2);
      S.sketchLine(ctx, -9, 17, 9, 17, 1.5, 'rgba(92,48,140,0.40)', s + 45, 1.2);
    }

    drawPlayerTag(ctx, f, env, headX, headY - 26);
    ctx.restore();
  }

  // =========================================================
  // 新角色动画资产：藤蔓（背后四条绿藤、地底缠绕吸血、跺脚破盾、茧/巨藤双大招）
  // =========================================================
  function drawVineStickman(ctx, f, env) {
    const s = S.boilSeed(1400 + f.id * 103, env.time);
    const dir = f.facing;
    const tNow = env.time;
    const bodyScale = f.bodyScale || 1.0;
    const isGiant = f.giantTimer > 0;
    const isCocoon = f.cocoonTimer > 0;
    const isPact = f.cocoonPactTimer > 0;

    // Ground shadow
    const hAbove = Math.max(0, env.groundY - f.y);
    const shScale = Math.max(0.35, 1 - hAbove / 380) * bodyScale;
    ctx.save();
    ctx.fillStyle = isGiant ? 'rgba(40, 102, 38, 0.22)' : 'rgba(30,28,26,0.12)';
    ctx.beginPath();
    ctx.ellipse(f.x, env.groundY + 3, 25 * shScale, 6 * shScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 大招一：裹成螺旋绿色藤蔓茧（还原草图左下 1大）
    if (isCocoon && f.state !== 'ko') {
      S.drawVineCocoon(ctx, f.x, f.y, f.height, f.cocoonTimer, tNow, s + 20);
      ctx.save();
      ctx.translate(f.x, f.y);
      drawPlayerTag(ctx, f, env, 0, -f.height - 40);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(f.x, f.y);

    // KO pose
    if (f.state === 'ko') {
      for (let i = 0; i < 3; i++) {
        S.sketchLine(ctx, -dir * (38 + i * 11), -22 - i * 4, -dir * (18 + i * 11), -8 - i * 4, 2.2, '#2f7d32', s + 80 + i, 0.7);
      }
      const headX = dir * 24;
      const hipX = -dir * 18;
      S.sketchLine(ctx, hipX, -9, headX - dir * 13, -12, 3.2, '#1e1c1a', s + 1, 0.9);
      S.sketchLine(ctx, hipX, -9, hipX - dir * 20, -3, 3.0, '#1e1c1a', s + 2, 0.9);
      S.sketchLine(ctx, hipX, -9, hipX - dir * 14, -19, 3.0, '#1e1c1a', s + 3, 0.9);
      S.sketchCircle(ctx, headX, -14, 14, 3.0, '#1e1c1a', '#f6f2e8', s + 5, 0.9);
      S.sketchLine(ctx, headX - 4, -16, headX + 4, -12, 2, '#1e1c1a', s + 11, 0.3);
      S.sketchLine(ctx, headX + 4, -16, headX - 4, -12, 2, '#1e1c1a', s + 12, 0.3);
      ctx.restore();
      return;
    }

    // 大招二：巨藤狂化（还原草图右下 2大 — 全身浓密绿色螺旋藤蔓卷曲而成的巨人！）
    if (isGiant) {
      ctx.scale(bodyScale, bodyScale);
      if (f.state === 'slip') {
        ctx.translate(0, -48);
        ctx.rotate(f.slipRot);
        ctx.translate(0, 48);
      }
      const bob = f.state === 'run' ? Math.abs(Math.sin(f.walkPhase)) * -3.5 : Math.sin(tNow * 2.8) * 2.2;
      const crouch = f.state === 'shield' ? 9 : 0;
      const hipY = -36 + bob + crouch;
      const neckY = -72 + bob + crouch;
      const headY = neckY - 17;
      const sw = f.state === 'run' ? Math.sin(f.walkPhase) * 14 : 0;

      // Heavy coiled vine legs, torso, arms, head (草图绿卷巨人！)
      S.drawCoiledVineLimb(ctx, -6, hipY, -14 + sw, -4, 9.5, s + 1);
      S.drawCoiledVineLimb(ctx, 6, hipY, 14 - sw, -4, 9.5, s + 20);
      S.drawCoiledVineLimb(ctx, 0, hipY - 2, 0, neckY + 4, 13.5, s + 40);

      let frontHandX = dir * 30, frontHandY = neckY + 18;
      let backHandX = -dir * 26, backHandY = neckY + 20;
      if (f.state === 'slash') {
        const t = 1 - f.stateTimer / (f.slashAnimDur || 0.45);
        if (t < 0.35) {
          frontHandX = dir * 10; frontHandY = neckY - 22;
        } else {
          const st = Math.min(1, (t - 0.35) / 0.45);
          frontHandX = dir * (36 + Math.sin(st * Math.PI) * 18);
          frontHandY = neckY + 4 + st * 32;
        }
      }
      S.drawCoiledVineLimb(ctx, -dir * 10, neckY + 8, backHandX, backHandY, 8.5, s + 60);
      S.drawCoiledVineLimb(ctx, dir * 10, neckY + 8, frontHandX, frontHandY, 9.5, s + 80);

      // Coiled leafy vine head
      S.sketchCircle(ctx, 0, headY, 16, 3.2, '#246627', 'rgba(92, 166, 52, 0.48)', s + 100, 1.8);
      S.sketchCircle(ctx, 0, headY, 11, 2.4, '#8bc23c', null, s + 105, 1.5);
      // Fierce glowing eyes
      S.sketchCircle(ctx, dir * 5 - 3, headY - 1, 2.3, 1.8, '#1b3d1d', '#fff8c4', s + 110, 0.3);
      S.sketchCircle(ctx, dir * 5 + 4, headY - 1, 2.3, 1.8, '#1b3d1d', '#fff8c4', s + 111, 0.3);

      // Heavy giant vine slam arc
      if (f.state === 'slash' && f.stateTimer < (f.slashAnimDur || 0.45) * 0.65 && f.stateTimer > 0.05) {
        ctx.save();
        ctx.strokeStyle = '#2f7d32';
        ctx.lineWidth = 6.0;
        ctx.beginPath();
        if (dir > 0) ctx.arc(12, neckY + 18, 64, -1.1, 0.85);
        else ctx.arc(-12, neckY + 18, 64, Math.PI - 0.85, Math.PI + 1.1);
        ctx.stroke();
        ctx.restore();
      }

      if (f.state === 'shield') {
        S.sketchCircle(ctx, dir * 4, neckY + 18, 48, 3.0, '#246627', 'rgba(130, 198, 68, 0.28)', s + 120, 2.4);
      }

      drawPlayerTag(ctx, f, env, 0, headY - 26);
      ctx.restore();
      return;
    }

    // 常规藤蔓形态（含蹲地插手引导、跺脚破盾、二段赌命光环）
    ctx.scale(bodyScale, bodyScale);
    if (f.state === 'slip') {
      ctx.translate(0, -48);
      ctx.rotate(f.slipRot);
      ctx.translate(0, 48);
    }

    // 二段赌命契约危险光环（不打中就会被藤蔓吸干致死！）
    if (isPact) {
      ctx.save();
      const pulse = 36 + Math.sin(tNow * 22) * 5;
      S.sketchEllipse(ctx, 0, -52, pulse, 54, 2.8, '#b83c2c', 'rgba(184, 60, 44, 0.12)', s + 140, 2.2);
      S.sketchEllipse(ctx, 0, -52, pulse - 6, 48, 2.0, '#3a8c32', null, s + 141, 1.8);
      ctx.font = 'bold 13px "PingFang SC", sans-serif';
      ctx.fillStyle = '#b83c2c';
      ctx.textAlign = 'center';
      ctx.fillText(`赌命反噬 ${f.cocoonPactTimer.toFixed(1)}s!`, 0, -118);
      ctx.restore();
    }

    const bob = f.state === 'idle' ? Math.sin(tNow * 4.8 + f.id * 2) * 2.4
      : f.state === 'fly' ? Math.sin(tNow * 7 + f.id) * 5.5
      : f.state === 'run' ? Math.abs(Math.sin(f.walkPhase)) * -4 : 0;
    const isChannel = f.state === 'vineChannel';
    const isStomp = f.state === 'vineStomp';
    const crouch = f.state === 'shield' ? 11 : isChannel ? 24 : 0;
    const hipX = 0;
    const hipY = -34 + bob + crouch;
    const neckX = f.state === 'run' ? dir * 6
      : isChannel ? dir * 12
      : f.state === 'slash' ? dir * 8 : 0;
    const neckY = -68 + bob + crouch;
    const headX = neckX;
    const headY = neckY - 16;

    let lFootX = -12, lFootY = 0, rFootX = 12, rFootY = 0;
    if (f.state === 'run' || f.state === 'walkoff') {
      const sw = Math.sin(f.walkPhase);
      lFootX = sw * 19; lFootY = Math.min(0, -Math.cos(f.walkPhase) * 9);
      rFootX = -sw * 19; rFootY = Math.min(0, Math.cos(f.walkPhase) * 9);
    } else if (isChannel) {
      // 蹲地插手姿势（还原草图 1 格）
      lFootX = -14 * dir; rFootX = 10 * dir;
    } else if (isStomp) {
      // 抬脚重重跺地（还原草图 2 格）
      lFootX = -10 * dir;
      rFootX = 16 * dir;
      rFootY = f.stateTimer > 0.16 ? -16 : 2;
    } else if (!f.onGround) {
      lFootX = -11 - dir * 4; lFootY = -6 + bob * 0.5;
      rFootX = 11 - dir * 2; rFootY = -12 + bob * 0.5;
    } else if (f.state === 'shield') {
      lFootX = -18; rFootX = 18;
    }

    let backHandX = neckX - dir * 18, backHandY = neckY + 18;
    let frontHandX = neckX + dir * 20, frontHandY = neckY + 16;
    if (isChannel) {
      // 双手插进地面！
      frontHandX = neckX + dir * 14; frontHandY = 0;
      backHandX = neckX + dir * 4; backHandY = -2;
    } else if (f.state === 'slash') {
      frontHandX = neckX + dir * 28; frontHandY = neckY + 8;
    } else if (f.state === 'shield') {
      frontHandX = neckX + dir * 18; frontHandY = neckY + 14;
      backHandX = neckX - dir * 14; backHandY = neckY + 12;
    }

    // 背后四条绿色藤蔓（引导时钻进地下，平时在身后卷曲摆动！）
    if (!isChannel) {
      S.drawVineTendrils(ctx, neckX - dir * 3, neckY + 4, dir, tNow, s + 30, 1.0, f.state);
    } else {
      // 引导时四条藤蔓从背后向下扎入地面
      for (let i = 0; i < 4; i++) {
        S.sketchLine(ctx, neckX - dir * 2, neckY + 8 + i * 2, neckX + dir * (10 + i * 5), 2, 3.0, i % 2 === 0 ? '#2f7d32' : '#85bd38', s + 35 + i, 1.5);
      }
    }

    // 跺脚脚底钻出的绿藤团（还原草图 2 格左小人脚边绿藤）
    if (isStomp) {
      S.sketchCircle(ctx, rFootX, -6, 13, 2.6, '#2f7d32', 'rgba(104, 178, 52, 0.45)', s + 42, 1.8);
    }

    // 普攻抽击的绿色藤蔓鞭弧
    if (f.state === 'slash' && f.stateTimer < 0.22 && f.stateTimer > 0.04) {
      ctx.save();
      ctx.strokeStyle = '#2f7d32';
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      if (dir > 0) ctx.arc(neckX + 12, neckY + 8, 66, -1.05, 0.85);
      else ctx.arc(neckX - 12, neckY + 8, 66, Math.PI - 0.85, Math.PI + 1.05);
      ctx.stroke();
      ctx.strokeStyle = '#9ec938';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      if (dir > 0) ctx.arc(neckX + 12, neckY + 8, 72, -0.85, 0.65);
      else ctx.arc(neckX - 12, neckY + 8, 72, Math.PI - 0.65, Math.PI + 0.85);
      ctx.stroke();
      ctx.restore();
    }

    // Shield dome
    if (f.state === 'shield') {
      ctx.save();
      ctx.strokeStyle = '#2f7d32';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(neckX + dir * 4, neckY + 16, 46, -Math.PI * 0.75, Math.PI * 0.75);
      ctx.stroke();
      S.sketchCircle(ctx, neckX + dir * 2, neckY + 16, 42, 2.4, 'rgba(47,125,50,0.72)', 'rgba(218, 245, 210, 0.35)', s + 60, 2.2);
      ctx.restore();
    }

    const strokeCol = (f.state === 'hurt' && Math.floor(tNow * 24) % 2 === 0) ? '#b83c2c' : '#1e1c1a';

    // Stickman body
    S.sketchLine(ctx, hipX, hipY, lFootX, lFootY, 3.1, strokeCol, s + 1, 0.9);
    S.sketchLine(ctx, hipX, hipY, rFootX, rFootY, 3.1, strokeCol, s + 2, 0.9);
    S.sketchLine(ctx, hipX, hipY, neckX, neckY, 3.3, strokeCol, s + 3, 0.9);
    S.sketchLine(ctx, neckX, neckY + 6, backHandX, backHandY, 3.0, strokeCol, s + 4, 0.9);
    S.sketchLine(ctx, neckX, neckY + 6, frontHandX, frontHandY, 3.0, strokeCol, s + 5, 0.9);

    S.sketchCircle(ctx, headX, headY, 15, 3.0, strokeCol, '#f6f2e8', s + 10, 0.9);
    if (f.state === 'hurt' || f.state === 'slip') {
      S.sketchCircle(ctx, headX + dir * 3, headY + 2, 4, 2.0, strokeCol, null, s + 14, 0.4);
    }

    if (f.state === 'fly') {
      S.sketchLine(ctx, -14, 10, 14, 10, 1.8, 'rgba(47,125,50,0.55)', s + 44, 1.2);
      S.sketchLine(ctx, -9, 17, 9, 17, 1.5, 'rgba(47,125,50,0.40)', s + 45, 1.2);
    }

    drawPlayerTag(ctx, f, env, headX, headY - 26);
    ctx.restore();
  }

  // =========================================================
  // 注册默认角色池（含各角色基础属性、J / K / L / ; 技能与可调参数清单）
  // =========================================================
  const CLASSIC_SKILLS = {
    j: { id: 'slash', label: '挥剑', icon: '⚔' },
    k: { id: 'banana', label: '香蕉皮', icon: '🍌' },
    l: { id: 'orb', label: '星光波', icon: '✦' },
    ult: null
  };

  const CLASSIC_BASE_STATS = {
    maxHp: 100,
    moveSpeed: 255,
    slashCooldown: 0.38,
    slashDamage: 14,
    kCooldown: 1.65,
    slipDuration: 0.85,
    lCooldown: 1.25,
    orbDamage: 12
  };

  const CLASSIC_TUNABLES = [
    { key: 'maxHp', label: '最大血量', min: 50, max: 300, step: 10, unit: '' },
    { key: 'moveSpeed', label: '移动速度', min: 100, max: 450, step: 5, unit: '' },
    { key: 'slashCooldown', label: '普攻冷却（越小越快）', min: 0.15, max: 1.5, step: 0.05, unit: '秒' },
    { key: 'slashDamage', label: '普攻伤害', min: 4, max: 40, step: 1, unit: '' },
    { key: 'kCooldown', label: '香蕉皮冷却 (K)', min: 0.5, max: 6.0, step: 0.1, unit: '秒' },
    { key: 'slipDuration', label: '滑倒硬直时长', min: 0.3, max: 2.5, step: 0.05, unit: '秒' },
    { key: 'lCooldown', label: '星光波冷却 (L)', min: 0.4, max: 5.0, step: 0.1, unit: '秒' },
    { key: 'orbDamage', label: '星光波伤害', min: 4, max: 35, step: 1, unit: '' }
  ];

  register({
    id: 'angry',
    name: '怒气大剑客',
    scale: 1.0,
    skills: CLASSIC_SKILLS,
    baseStats: Object.assign({}, CLASSIC_BASE_STATS),
    tunables: CLASSIC_TUNABLES,
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
    skills: CLASSIC_SKILLS,
    baseStats: Object.assign({}, CLASSIC_BASE_STATS),
    tunables: CLASSIC_TUNABLES,
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
    name: '无敌剑',
    scale: 2.35,
    skills: {
      j: { id: 'slash', label: '普通攻击', icon: '⚔' },
      k: { id: 'shrink', label: '身体变小', icon: '🔽' },
      l: { id: 'freezeLight', label: '定身光', icon: '✨' },
      ult: { id: 'speedBoost', label: '速度加快', icon: '🚀' }
    },
    baseStats: {
      maxHp: 140,             // 比普通小人高 40%
      moveSpeed: 165,         // 原始速度慢
      slashCooldown: 0.72,    // 原始攻速慢
      slashDamage: 18,
      kCooldown: 7.0,
      shrinkScale: 0.48,      // K 变小倍率（从大到小）
      shrinkDuration: 4.5,    // 变小持续时间
      lCooldown: 3.2,
      freezeDuration: 1.5,    // L 硬控 1.5 秒
      freezeDamage: 6,
      ultCooldown: 9.0,       // ; 大招冷却
      ultDuration: 5.0,       // ; 加速大招持续时间
      ultSpeedMult: 2.15,     // 移速加快倍率
      ultAtkSpeedMult: 1.65   // 攻速加快倍率
    },
    tunables: [
      { key: 'maxHp', label: '最大血量', min: 80, max: 350, step: 10, unit: '' },
      { key: 'moveSpeed', label: '原始移动速度', min: 80, max: 360, step: 5, unit: '' },
      { key: 'slashCooldown', label: '原始普攻冷却（越小越快）', min: 0.2, max: 1.6, step: 0.04, unit: '秒' },
      { key: 'slashDamage', label: '普攻伤害 (J)', min: 6, max: 45, step: 1, unit: '' },
      { key: 'shrinkScale', label: '变小体型倍率 (K)', min: 0.3, max: 0.85, step: 0.02, unit: '倍' },
      { key: 'shrinkDuration', label: '变小持续时间 (K)', min: 1.5, max: 12.0, step: 0.5, unit: '秒' },
      { key: 'kCooldown', label: '变小技能冷却 (K)', min: 1.5, max: 15.0, step: 0.5, unit: '秒' },
      { key: 'freezeDuration', label: '定身光硬控时长 (L)', min: 0.5, max: 4.0, step: 0.1, unit: '秒' },
      { key: 'lCooldown', label: '定身光冷却 (L)', min: 1.0, max: 10.0, step: 0.2, unit: '秒' },
      { key: 'ultSpeedMult', label: '大招移速倍率 (;)', min: 1.2, max: 3.5, step: 0.05, unit: '倍' },
      { key: 'ultAtkSpeedMult', label: '大招攻速倍率 (;)', min: 1.1, max: 3.0, step: 0.05, unit: '倍' },
      { key: 'ultDuration', label: '大招持续时间 (;)', min: 2.0, max: 12.0, step: 0.5, unit: '秒' },
      { key: 'ultCooldown', label: '大招冷却 (;)', min: 3.0, max: 20.0, step: 0.5, unit: '秒' }
    ],
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

  register({
    id: 'shadow',
    name: '影子',
    scale: 1.0,
    skills: {
      j: { id: 'slash', label: '影刃斩', icon: '🗡' },
      k: { id: 'shadowHide', label: '藏进阴影', icon: '🌑' },
      l: { id: 'shadowBlink', label: '三段瞬身', icon: '⚡' },
      ult: { id: 'shadowDomain', label: '暗影空间', icon: '🧣' },
      ult2: null
    },
    baseStats: {
      maxHp: 50,              // 常规血量的一半（极脆刺客）
      moveSpeed: 285,
      slashCooldown: 0.34,
      slashDamage: 12,
      kCooldown: 7.5,
      stealthDuration: 5.0,   // K 藏进阴影 5 秒
      backstabMult: 2.0,      // 背后现身攻击双倍伤害
      lCooldown: 6.5,
      blinkBaseDamage: 6,     // L 瞬身第一段伤害（默认依次 6 -> 12 -> 24）
      blinkScaleMult: 2.0,    // 每次瞬身相对上次递增倍率
      blinkWindow: 2.6,       // 连段窗口时长
      ultCooldown: 10.5,
      domainRange: 205,       // ; 围巾抓取距离（约 4 个身位）
      domainDamage: 36        // 拉入暗影空间万影穿刺总伤害
    },
    tunables: [
      { key: 'maxHp', label: '最大血量（默认常规一半）', min: 30, max: 180, step: 5, unit: '' },
      { key: 'moveSpeed', label: '移动速度', min: 150, max: 460, step: 5, unit: '' },
      { key: 'slashCooldown', label: '普攻冷却（越小越快）', min: 0.16, max: 1.2, step: 0.02, unit: '秒' },
      { key: 'slashDamage', label: '普攻基础伤害 (J)', min: 4, max: 35, step: 1, unit: '' },
      { key: 'stealthDuration', label: '藏进阴影时长 (K)', min: 2.0, max: 10.0, step: 0.5, unit: '秒' },
      { key: 'backstabMult', label: '背刺伤害倍率', min: 1.5, max: 4.0, step: 0.25, unit: '倍' },
      { key: 'kCooldown', label: '藏进阴影冷却 (K)', min: 2.0, max: 15.0, step: 0.5, unit: '秒' },
      { key: 'blinkBaseDamage', label: '瞬身一段基础伤害 (L)', min: 2, max: 20, step: 1, unit: '' },
      { key: 'blinkScaleMult', label: '瞬身逐段伤害倍率', min: 1.2, max: 3.0, step: 0.1, unit: '倍' },
      { key: 'lCooldown', label: '三段瞬身冷却 (L)', min: 2.0, max: 14.0, step: 0.5, unit: '秒' },
      { key: 'domainRange', label: '围巾抓取距离 (; 4身位≈205)', min: 120, max: 320, step: 5, unit: 'px' },
      { key: 'domainDamage', label: '暗影空间穿刺总伤害 (;)', min: 16, max: 80, step: 2, unit: '' },
      { key: 'ultCooldown', label: '暗影空间冷却 (;)', min: 4.0, max: 20.0, step: 0.5, unit: '秒' }
    ],
    metrics: {
      height: 100,
      halfW: 24,
      slashReach: 56,
      slashRangeX: 60,
      slashRangeY: 64,
      orbOffsetX: 42,
      orbOffsetY: 52,
      bananaOffsetX: 26,
      bananaOffsetY: 54,
      calloutOffsetY: 118
    },
    draw: drawShadowStickman
  });

  register({
    id: 'vine',
    name: '藤蔓',
    scale: 1.0,
    skills: {
      j: { id: 'slash', label: '藤蔓抽击', icon: '🌿' },
      k: { id: 'vineBind', label: '地底缠绕', icon: '🌱' },
      l: { id: 'vinePierce', label: '跺脚破盾', icon: '⚡' },
      ult: { id: 'vineCocoon', label: '藤蔓茧', icon: '🟢' },
      ult2: { id: 'vineGiant', label: '巨藤狂化', icon: '🌳' }
    },
    baseStats: {
      maxHp: 100,
      moveSpeed: 245,
      slashCooldown: 0.40,
      slashDamage: 13,
      kCooldown: 6.5,
      bindRange: 205,         // K 抓捕范围（约 4 身位）
      bindDuration: 4.0,      // 缠绕控制时长 4 秒
      drainPctPerSec: 3,      // 每秒吸取对手最大血量百分比（草图 3%，设定 2% 可自由调）
      lCooldown: 3.0,
      pierceRange: 155,       // L 跺脚破盾距离（约 3 身位）
      pierceDamage: 22,       // 仅对举盾敌人有效并造成破盾伤害
      ultCooldown: 10.0,      // ; 大招一「藤蔓茧」冷却
      cocoonDuration: 3.0,    // 裹茧时长 3 秒
      cocoonHeal: 8,          // 裹茧期间每次受击回血
      pactDuration: 3.5,      // 再按 ; 进入赌命反噬窗口，未命中直接吸干致死
      pactBonusDamage: 26,    // 赌命命中附加高额爆发伤害
      pactHeal: 20,           // 赌命命中回血
      ult2Cooldown: 15.0,     // ' 大招二「巨藤狂化」冷却
      giantDuration: 10.0,    // 巨藤形态持续 10 秒
      giantScale: 2.25,       // 巨藤体型倍率
      giantBonusHp: 100,      // 变身获得巨额临时厚血
      giantSlashDamage: 34,   // 巨藤极高攻击力
      giantSpeedMult: 0.45,   // 移动极慢
      giantAtkCdMult: 3.0     // 攻速极慢（对手砍3下自己砍1下）
    },
    tunables: [
      { key: 'maxHp', label: '基础最大血量', min: 60, max: 250, step: 10, unit: '' },
      { key: 'moveSpeed', label: '常规移动速度', min: 120, max: 380, step: 5, unit: '' },
      { key: 'slashDamage', label: '常规普攻伤害 (J)', min: 5, max: 35, step: 1, unit: '' },
      { key: 'bindRange', label: '地底抓捕距离 (K 4身位≈205)', min: 120, max: 320, step: 5, unit: 'px' },
      { key: 'bindDuration', label: '地底缠绕时长 (K)', min: 1.5, max: 7.0, step: 0.5, unit: '秒' },
      { key: 'drainPctPerSec', label: '每秒吸血比例 (K)', min: 1, max: 10, step: 0.5, unit: '%' },
      { key: 'pierceRange', label: '跺脚破盾距离 (L 3身位≈155)', min: 90, max: 260, step: 5, unit: 'px' },
      { key: 'pierceDamage', label: '破盾地刺伤害 (L)', min: 8, max: 50, step: 2, unit: '' },
      { key: 'cocoonDuration', label: '藤蔓茧时长 (;)', min: 1.5, max: 6.0, step: 0.5, unit: '秒' },
      { key: 'cocoonHeal', label: '茧内受击回血量 (;)', min: 2, max: 25, step: 1, unit: '' },
      { key: 'pactDuration', label: '二段赌命窗口时长', min: 1.5, max: 6.0, step: 0.5, unit: '秒' },
      { key: 'pactBonusDamage', label: '赌命命中额外伤害', min: 10, max: 60, step: 2, unit: '' },
      { key: 'giantDuration', label: '巨藤狂化时长 (\')', min: 4.0, max: 18.0, step: 1.0, unit: '秒' },
      { key: 'giantBonusHp', label: '巨藤额外厚血 (\')', min: 40, max: 240, step: 10, unit: '' },
      { key: 'giantSlashDamage', label: '巨藤重击伤害 (\')', min: 16, max: 70, step: 2, unit: '' },
      { key: 'giantAtkCdMult', label: '巨藤攻速变慢倍数', min: 1.5, max: 4.5, step: 0.25, unit: '倍' }
    ],
    metrics: {
      height: 100,
      halfW: 24,
      slashReach: 62,
      slashRangeX: 64,
      slashRangeY: 66,
      orbOffsetX: 42,
      orbOffsetY: 52,
      bananaOffsetX: 26,
      bananaOffsetY: 54,
      calloutOffsetY: 120
    },
    draw: drawVineStickman
  });

  PaperArena.CharacterAssets = { register, get, list };
})(window);
