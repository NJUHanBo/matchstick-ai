/**
 * engine/game.js — 分层状态 + 广播驱动的纸上对战引擎
 *
 * 架构严格对应 memory/wiki/game-architecture-reference.md：
 * 1. 数据分层：
 *    - systemState（系统属性，跨局保留）：模式、AI 难度、日夜模式、音效开关、选角、手柄数
 *    - arenaState（地图/单局属性，重开时重建）：fighters、香蕉皮、星光波、粒子、气泡、震屏、胜负
 *    - fighter（自身属性，挂载于角色实体）：坐标、速度、状态、血量、气力、冷却、asset 引用
 * 2. 广播解耦（EventBus）：
 *    - CombatSystem 只发事件（combat:hit, combat:block, combat:slip, match:ko ...）
 *    - AudioSystem / HapticsSystem / VfxSystem / UISystem 各自订阅响应
 * 3. UI 不存真值：
 *    - 下拉框与按钮只读取 systemState 并触发命令，真值始终在 systemState / arenaState
 */
(function (global) {
  'use strict';

  const PaperArena = (global.PaperArena = global.PaperArena || {});
  const S = PaperArena.Sketch;
  const Assets = PaperArena.CharacterAssets;

  const W = 960;
  const H = 540;
  const GROUND_Y = 448;
  const CEILING_Y = 66;
  const STAGE_LEFT = 46;
  const STAGE_RIGHT = W - 46;

  // =========================================================
  // 1. 广播总线与分层数据
  // =========================================================
  const bus = PaperArena.createEventBus();

  // 第 4 层：系统属性（切局/重开保留）
  const systemState = {
    gameMode: '1p',           // '1p' | '2p'
    aiDifficulty: 1,          // 0 轻松 | 1 普通 | 2 高手
    timeMode: 'auto',         // 'auto' | 'day' | 'night'
    soundEnabled: true,
    selectedRoles: ['angry', 'ren'],
    gamepadCount: 0
  };

  // 第 3 层：地图/单局属性（每局重开时重建）
  let arenaState = createFreshArenaState();

  function createFreshArenaState() {
    return {
      time: 0,
      skyNightFactor: 0,
      matchState: 'fighting', // 'fighting' | 'ko'
      winnerId: null,
      koTimer: 0,
      hitstop: 0,
      shakeTime: 0,
      shakeAmp: 0,
      fighters: [],
      bananaPeels: [],
      energyOrbs: [],
      particles: [],
      callouts: [],
      story: {
        active: false,
        t: 0,
        panel: 1,
        triggered: {}
      }
    };
  }

  // 第 2 层：角色实体工厂（自身属性 + 动画资产）
  function createFighter(id, roleId, startX, facing) {
    const asset = Assets.get(roleId);
    return {
      id,
      role: asset.id,
      asset,
      metrics: asset.metrics,
      name: asset.name,
      height: asset.metrics.height,
      halfW: asset.metrics.halfW,
      x: startX,
      y: GROUND_Y,
      vx: 0,
      vy: 0,
      facing,
      hp: 100,
      maxHp: 100,
      flyEnergy: 100,
      maxFlyEnergy: 100,
      onGround: true,
      flying: false,
      state: 'idle',
      stateTimer: 0,
      slashHitDone: false,
      shieldTime: 0,
      invuln: 0,
      cooldowns: { slash: 0, banana: 0, orb: 0 },
      walkPhase: 0,
      slipRot: 0,
      aiTimer: 0.35,
      aiIntent: 'approach'
    };
  }

  // =========================================================
  // 2. AudioSystem（订阅广播，独立管理合成音效）
  // =========================================================
  const AudioSystem = (() => {
    let audioCtx = null;

    function ensure() {
      if (!systemState.soundEnabled) return null;
      if (!audioCtx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (AC) audioCtx = new AC();
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      return audioCtx;
    }

    const play = {
      sword() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);
        gain.gain.setValueAtTime(0.11, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        osc.connect(gain).connect(ac.destination);
        osc.start(now); osc.stop(now + 0.14);
      },
      hit() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.13);
        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain).connect(ac.destination);
        osc.start(now); osc.stop(now + 0.15);
      },
      block() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.exponentialRampToValueAtTime(980, now + 0.08);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain).connect(ac.destination);
        osc.start(now); osc.stop(now + 0.13);
      },
      banana() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(640, now + 0.11);
        gain.gain.setValueAtTime(0.10, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain).connect(ac.destination);
        osc.start(now); osc.stop(now + 0.13);
      },
      slip() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(1250, now + 0.16);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.34);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
        osc.connect(gain).connect(ac.destination);
        osc.start(now); osc.stop(now + 0.37);
      },
      orb() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        [680, 960, 1280].forEach((f, idx) => {
          const osc = ac.createOscillator(), gain = ac.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, now + idx * 0.03);
          osc.frequency.exponentialRampToValueAtTime(f * 1.25, now + idx * 0.03 + 0.12);
          gain.gain.setValueAtTime(0.06, now + idx * 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.03 + 0.14);
          osc.connect(gain).connect(ac.destination);
          osc.start(now + idx * 0.03); osc.stop(now + idx * 0.03 + 0.15);
        });
      },
      jump() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(480, now + 0.09);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
        osc.connect(gain).connect(ac.destination);
        osc.start(now); osc.stop(now + 0.11);
      },
      ko() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          const osc = ac.createOscillator(), gain = ac.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, now + i * 0.09);
          gain.gain.setValueAtTime(0.11, now + i * 0.09);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.28);
          osc.connect(gain).connect(ac.destination);
          osc.start(now + i * 0.09); osc.stop(now + i * 0.09 + 0.3);
        });
      }
    };

    bus.on('combat:slash', play.sword);
    bus.on('combat:hit', play.hit);
    bus.on('combat:block', play.block);
    bus.on('combat:parry', play.block);
    bus.on('combat:orbClash', play.block);
    bus.on('combat:bananaThrow', play.banana);
    bus.on('combat:slip', play.slip);
    bus.on('combat:orbCast', play.orb);
    bus.on('combat:jump', play.jump);
    bus.on('match:ko', play.ko);

    return { ensure };
  })();

  // =========================================================
  // 3. InputSystem + Gamepad API（键盘 / 触控 / 1P+2P 手柄）
  // =========================================================
  const InputSystem = (() => {
    const keys = new Set();
    const justPressed = new Set();
    const touchState = {
      left: false, right: false, up: false, down: false,
      sword: false, banana: false, orb: false
    };
    const touchJustPressed = new Set();

    const gpPrev = [
      { up: false, sword: false, banana: false, orb: false, start: false },
      { up: false, sword: false, banana: false, orb: false, start: false }
    ];
    const activeGamepads = [null, null];

    function btnPressed(gp, idx) {
      const b = gp && gp.buttons && gp.buttons[idx];
      return !!(b && (b.pressed || b.value > 0.45));
    }

    function rumble(playerIdx, duration = 100, strong = 0.4, weak = 0.2) {
      const gp = activeGamepads[playerIdx];
      if (!gp) return;
      try {
        const act = gp.vibrationActuator;
        if (act && typeof act.playEffect === 'function') {
          act.playEffect('dual-rumble', {
            startDelay: 0,
            duration,
            strongMagnitude: strong,
            weakMagnitude: weak
          }).catch(() => {});
        }
      } catch (_) {}
    }

    function pollGamepads() {
      if (!navigator.getGamepads) return;
      const raw = navigator.getGamepads();
      const list = [];
      for (let i = 0; i < raw.length; i++) {
        if (raw[i] && raw[i].connected) list.push(raw[i]);
      }
      activeGamepads[0] = list[0] || null;
      activeGamepads[1] = list[1] || null;

      if (list.length !== systemState.gamepadCount) {
        systemState.gamepadCount = list.length;
        bus.emit('system:gamepadChanged', { count: list.length });
        if (list.length >= 2 && systemState.gameMode !== '2p') {
          Commands.setGameMode('2p');
        }
      }
    }

    function readGamepadSlot(slotIdx) {
      const gp = activeGamepads[slotIdx];
      const prev = gpPrev[slotIdx];
      if (!gp) {
        prev.up = prev.sword = prev.banana = prev.orb = prev.start = false;
        return {
          left: false, right: false, up: false, upPressed: false,
          down: false, sword: false, banana: false, orb: false, startPressed: false
        };
      }

      const ax = gp.axes && gp.axes.length > 0 ? gp.axes[0] : 0;
      const ay = gp.axes && gp.axes.length > 1 ? gp.axes[1] : 0;

      const left = ax < -0.28 || btnPressed(gp, 14);
      const right = ax > 0.28 || btnPressed(gp, 15);
      const up = btnPressed(gp, 0) || btnPressed(gp, 12) || ay < -0.45;
      const down = btnPressed(gp, 4) || btnPressed(gp, 6) || btnPressed(gp, 13) || ay > 0.45;
      const swordNow = btnPressed(gp, 2) || btnPressed(gp, 5);
      const bananaNow = btnPressed(gp, 1);
      const orbNow = btnPressed(gp, 3) || btnPressed(gp, 7);
      const startNow = btnPressed(gp, 9);

      const res = {
        left, right, up,
        upPressed: up && !prev.up,
        down,
        sword: swordNow && !prev.sword,
        banana: bananaNow && !prev.banana,
        orb: orbNow && !prev.orb,
        startPressed: startNow && !prev.start
      };
      prev.up = up;
      prev.sword = swordNow;
      prev.banana = bananaNow;
      prev.orb = orbNow;
      prev.start = startNow;

      if (res.upPressed || res.sword || res.banana || res.orb || res.startPressed) {
        AudioSystem.ensure();
      }
      return res;
    }

    function readPlayer(playerIdx) {
      const gp = readGamepadSlot(playerIdx);
      if (gp.startPressed && !arenaState.story.active) {
        Commands.resetMatch();
      }

      if (playerIdx === 0) {
        const singlePArrows = systemState.gameMode === '1p';
        return {
          left: keys.has('KeyA') || touchState.left || (singlePArrows && keys.has('ArrowLeft')) || gp.left,
          right: keys.has('KeyD') || touchState.right || (singlePArrows && keys.has('ArrowRight')) || gp.right,
          up: keys.has('KeyW') || keys.has('Space') || touchState.up || (singlePArrows && keys.has('ArrowUp')) || gp.up,
          upPressed: justPressed.has('KeyW') || justPressed.has('Space') || touchJustPressed.has('up') || (singlePArrows && justPressed.has('ArrowUp')) || gp.upPressed,
          down: keys.has('KeyS') || touchState.down || (singlePArrows && keys.has('ArrowDown')) || gp.down,
          sword: justPressed.has('KeyJ') || touchJustPressed.has('sword') || gp.sword,
          banana: justPressed.has('KeyK') || touchJustPressed.has('banana') || gp.banana,
          orb: justPressed.has('KeyL') || touchJustPressed.has('orb') || gp.orb
        };
      }
      return {
        left: keys.has('ArrowLeft') || gp.left,
        right: keys.has('ArrowRight') || gp.right,
        up: keys.has('ArrowUp') || gp.up,
        upPressed: justPressed.has('ArrowUp') || gp.upPressed,
        down: keys.has('ArrowDown') || gp.down,
        sword: justPressed.has('Digit1') || justPressed.has('Numpad1') || justPressed.has('KeyN') || gp.sword,
        banana: justPressed.has('Digit2') || justPressed.has('Numpad2') || justPressed.has('KeyM') || gp.banana,
        orb: justPressed.has('Digit3') || justPressed.has('Numpad3') || justPressed.has('Comma') || gp.orb
      };
    }

    function clearFrameEdges() {
      justPressed.clear();
      touchJustPressed.clear();
    }

    function bindEvents() {
      global.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
          e.preventDefault();
        }
        if (!keys.has(e.code)) justPressed.add(e.code);
        keys.add(e.code);
        if (e.code === 'KeyR' && !arenaState.story.active) Commands.resetMatch();
      });
      global.addEventListener('keyup', (e) => keys.delete(e.code));
      global.addEventListener('blur', () => {
        keys.clear();
        Object.keys(touchState).forEach((k) => { touchState[k] = false; });
      });
      global.addEventListener('gamepadconnected', () => { pollGamepads(); AudioSystem.ensure(); });
      global.addEventListener('gamepaddisconnected', pollGamepads);

      document.querySelectorAll('.pad-btn').forEach((btn) => {
        const act = btn.dataset.action;
        const press = (e) => {
          e.preventDefault();
          AudioSystem.ensure();
          if (!touchState[act]) touchJustPressed.add(act);
          touchState[act] = true;
          btn.classList.add('pressed');
        };
        const release = (e) => {
          e.preventDefault();
          touchState[act] = false;
          btn.classList.remove('pressed');
        };
        btn.addEventListener('pointerdown', press);
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointerleave', release);
        btn.addEventListener('pointercancel', release);
      });
    }

    // Haptics 订阅战斗广播
    bus.on('combat:block', ({ defender }) => rumble(defender.id, 70, 0.25, 0.15));
    bus.on('combat:parry', ({ defender }) => rumble(defender.id, 90, 0.35, 0.25));
    bus.on('combat:hit', ({ attacker, defender }) => {
      rumble(defender.id, 120, 0.55, 0.35);
      if (attacker) rumble(attacker.id, 70, 0.2, 0.15);
    });
    bus.on('combat:slip', ({ victim }) => rumble(victim.id, 180, 0.45, 0.6));
    bus.on('match:ko', ({ winner, loser }) => {
      if (loser) rumble(loser.id, 280, 0.8, 0.6);
      if (winner) rumble(winner.id, 160, 0.35, 0.35);
    });

    return { bindEvents, pollGamepads, readPlayer, clearFrameEdges };
  })();

  // =========================================================
  // 4. VfxSystem（订阅广播，管理粒子 / 气泡 / 震屏 / 顿帧）
  // =========================================================
  const VfxSystem = (() => {
    function spawnSparkles(x, y, count = 8, style = 'diamond') {
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 70 + Math.random() * 190;
        arenaState.particles.push({
          x, y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 30,
          life: 0.25 + Math.random() * 0.28,
          maxLife: 0.53,
          size: 4 + Math.random() * 6,
          style,
          rot: Math.random() * Math.PI
        });
      }
    }

    function spawnCallout(text, x, y, targetX, targetY, duration = 0.95) {
      const cx = Math.max(96, Math.min(W - 96, x));
      const cy = Math.max(82, y);
      arenaState.callouts.push({ text, x: cx, y: cy, targetX, targetY, life: duration, maxLife: duration });
    }

    function shake(amp, dur) {
      arenaState.shakeAmp = Math.max(arenaState.shakeAmp, amp);
      arenaState.shakeTime = Math.max(arenaState.shakeTime, dur);
    }

    bus.on('combat:orbCast', ({ x, y }) => spawnSparkles(x, y, 7, 'diamond'));
    bus.on('combat:orbClash', ({ x, y }) => spawnSparkles(x, y, 14, 'diamond'));
    bus.on('combat:block', ({ defender }) => {
      spawnSparkles(defender.x + defender.facing * defender.halfW * 0.9, defender.y - defender.height * 0.5, 8, 'dot');
      spawnCallout('挡!', defender.x, defender.y - defender.metrics.calloutOffsetY, defender.x, defender.y - defender.height * 0.78, 0.55);
      arenaState.hitstop = Math.max(arenaState.hitstop, 0.04);
      shake(3, 0.10);
    });
    bus.on('combat:parry', ({ defender, x, y }) => {
      spawnSparkles(x, y, 10, 'diamond');
      spawnCallout('反弹!', defender.x, defender.y - defender.metrics.calloutOffsetY, defender.x, defender.y - defender.height * 0.82, 0.7);
      arenaState.hitstop = Math.max(arenaState.hitstop, 0.05);
    });
    bus.on('combat:hit', ({ defender }) => {
      spawnSparkles(defender.x, defender.y - defender.height * 0.5, 10, 'diamond');
      arenaState.hitstop = Math.max(arenaState.hitstop, 0.055);
      shake(6.5, 0.16);
    });
    bus.on('combat:slip', ({ victim, peelX }) => {
      spawnSparkles(peelX, GROUND_Y - 10, 7, 'dot');
      spawnCallout('滑倒!', victim.x + 28, victim.y - victim.metrics.calloutOffsetY, victim.x, victim.y - victim.height * 0.65, 0.8);
      shake(5, 0.14);
    });
    bus.on('combat:fly', ({ fighter, word }) => {
      spawnCallout(word, fighter.x - fighter.facing * 36, fighter.y - fighter.metrics.calloutOffsetY, fighter.x, fighter.y - fighter.height * 0.85, 0.75);
    });
    bus.on('match:ko', ({ winner }) => {
      if (winner) {
        spawnCallout('走了', winner.x - winner.facing * 32, winner.y - (winner.metrics.calloutOffsetY + 24), winner.x, winner.y - winner.height * 0.92, 5.0);
      }
      arenaState.hitstop = 0.14;
      shake(10, 0.28);
    });

    function update(dt) {
      for (let i = arenaState.particles.length - 1; i >= 0; i--) {
        const p = arenaState.particles[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += dt * 4;
        if (p.life <= 0) arenaState.particles.splice(i, 1);
      }
      for (let i = arenaState.callouts.length - 1; i >= 0; i--) {
        const c = arenaState.callouts[i];
        c.life -= dt;
        c.y -= 10 * dt;
        if (c.life <= 0) arenaState.callouts.splice(i, 1);
      }
    }

    return { spawnSparkles, spawnCallout, update };
  })();

  // =========================================================
  // 5. CombatSystem（战斗实体与投射物逻辑，只发广播）
  // =========================================================
  const CombatSystem = (() => {
    function startSlash(f) {
      if (f.cooldowns.slash > 0) return;
      if (['slip', 'hurt', 'ko', 'walkoff'].includes(f.state)) return;
      f.state = 'slash';
      f.stateTimer = 0.28;
      f.slashHitDone = false;
      f.cooldowns.slash = 0.38;
      f.vx += f.facing * 95;
      bus.emit('combat:slash', { fighter: f });
    }

    function startBanana(f) {
      if (f.cooldowns.banana > 0) return;
      if (['slip', 'hurt', 'ko', 'walkoff'].includes(f.state)) return;
      const mine = arenaState.bananaPeels.filter((b) => b.owner === f.id);
      if (mine.length >= 2) {
        const idx = arenaState.bananaPeels.indexOf(mine[0]);
        if (idx >= 0) arenaState.bananaPeels.splice(idx, 1);
      }
      f.state = 'throw';
      f.stateTimer = 0.22;
      f.cooldowns.banana = 1.65;
      arenaState.bananaPeels.push({
        owner: f.id,
        x: f.x + f.facing * f.metrics.bananaOffsetX,
        y: f.y - f.metrics.bananaOffsetY,
        vx: f.facing * 290,
        vy: -240,
        landed: false,
        life: 11,
        rot: 0,
        armDelay: 0.16
      });
      bus.emit('combat:bananaThrow', { fighter: f });
    }

    function startOrb(f) {
      if (f.cooldowns.orb > 0) return;
      if (['slip', 'hurt', 'ko', 'walkoff'].includes(f.state)) return;
      f.state = 'orb';
      f.stateTimer = 0.30;
      f.cooldowns.orb = 1.25;
      const ox = f.x + f.facing * f.metrics.orbOffsetX;
      const oy = f.y - f.metrics.orbOffsetY;
      arenaState.energyOrbs.push({
        owner: f.id,
        x: ox,
        y: oy,
        vx: f.facing * 430,
        vy: 0,
        r: 17,
        life: 2.2,
        rot: 0
      });
      bus.emit('combat:orbCast', { fighter: f, x: ox - f.facing * 6, y: oy });
    }

    function triggerKO(winner, loser) {
      arenaState.matchState = 'ko';
      arenaState.winnerId = winner ? winner.id : null;
      arenaState.koTimer = 0;
      loser.state = 'ko';
      loser.hp = 0;
      loser.vx = (loser.x >= (winner ? winner.x : W * 0.5) ? 1 : -1) * 260;
      loser.vy = -220;
      loser.onGround = false;

      if (winner) {
        winner.state = 'walkoff';
        winner.stateTimer = 99;
        winner.flying = false;
        winner.facing = winner.x >= loser.x ? 1 : -1;
      }
      bus.emit('match:ko', { winner, loser });
    }

    function damageFighter(attacker, defender, amount, knockX, knockY) {
      if (defender.state === 'ko' || arenaState.matchState === 'ko') return false;

      if (defender.state === 'shield') {
        const reduced = Math.max(1, Math.round(amount * 0.15));
        defender.hp = Math.max(1, defender.hp - reduced);
        defender.vx += Math.sign(knockX) * 110;
        bus.emit('combat:block', { attacker, defender });
        return 'blocked';
      }

      defender.hp = Math.max(0, defender.hp - amount);
      defender.vx = knockX;
      defender.vy = knockY;
      defender.onGround = false;
      defender.flying = false;
      bus.emit('combat:hit', { attacker, defender, amount });

      if (defender.hp <= 0) {
        triggerKO(attacker, defender);
      } else {
        defender.state = 'hurt';
        defender.stateTimer = 0.24;
      }
      return 'hit';
    }

    function triggerSlip(victim, peel) {
      if (victim.state === 'ko' || arenaState.matchState === 'ko') return;
      victim.state = 'slip';
      victim.stateTimer = 0.85;
      victim.slipRot = 0;
      victim.onGround = false;
      victim.flying = false;
      victim.vy = -440;
      victim.vx = (victim.x >= peel.x ? 1 : -1) * 165;
      victim.hp = Math.max(1, victim.hp - 7);
      bus.emit('combat:slip', { victim, peelX: peel.x });
    }

    function updateFighter(f, enemy, inp, dt) {
      f.cooldowns.slash = Math.max(0, f.cooldowns.slash - dt);
      f.cooldowns.banana = Math.max(0, f.cooldowns.banana - dt);
      f.cooldowns.orb = Math.max(0, f.cooldowns.orb - dt);
      f.invuln = Math.max(0, f.invuln - dt);

      if (f.state === 'ko') {
        f.vy += 1250 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (f.y >= GROUND_Y) {
          f.y = GROUND_Y;
          f.vy = 0;
          f.vx *= Math.pow(0.06, dt);
          f.onGround = true;
        }
        f.x = Math.max(STAGE_LEFT + 18, Math.min(STAGE_RIGHT - 18, f.x));
        return;
      }

      if (f.state === 'walkoff') {
        f.vy += 1250 * dt;
        f.y = Math.min(GROUND_Y, f.y + f.vy * dt);
        if (f.y >= GROUND_Y) {
          f.onGround = true;
          f.vy = 0;
          if (arenaState.koTimer > 0.65 && f.x > STAGE_LEFT + 70 && f.x < STAGE_RIGHT - 70) {
            f.x += f.facing * 75 * dt;
            f.walkPhase += dt * 7;
          }
        }
        return;
      }

      if (['slash', 'throw', 'orb', 'hurt', 'slip'].includes(f.state)) {
        f.stateTimer -= dt;
        if (f.state === 'slip') {
          f.slipRot += dt * 11 * (f.vx >= 0 ? 1 : -1);
        }
        if (f.state === 'slash' && !f.slashHitDone && f.stateTimer < 0.21 && f.stateTimer > 0.08) {
          const reachX = f.x + f.facing * f.metrics.slashReach;
          const hitW = f.metrics.slashRangeX + enemy.halfW * 0.6;
          const slashBottom = f.y + 8;
          const slashTop = f.y - f.metrics.slashRangeY * 1.45;
          const overlapY = enemy.y >= slashTop && (enemy.y - enemy.height) <= slashBottom;
          if (Math.abs(enemy.x - reachX) < hitW && overlapY) {
            f.slashHitDone = true;
            damageFighter(f, enemy, 14, f.facing * 240, -175);
          }
        }
        if (f.stateTimer <= 0) {
          f.state = f.onGround ? 'idle' : 'jump';
          f.slipRot = 0;
        }
      }

      const locked = ['slash', 'throw', 'orb', 'hurt', 'slip'].includes(f.state);
      if (!locked) {
        if (inp.sword) {
          startSlash(f);
        } else if (inp.banana) {
          startBanana(f);
        } else if (inp.orb) {
          startOrb(f);
        } else if (inp.down) {
          f.state = 'shield';
          f.shieldTime += dt;
          f.vx *= Math.pow(0.01, dt);
          f.flying = false;
        } else {
          f.shieldTime = 0;
          const moveSpeed = f.flying ? 275 : 255;
          let moveDir = 0;
          if (inp.left) moveDir -= 1;
          if (inp.right) moveDir += 1;
          if (moveDir !== 0) {
            f.facing = moveDir;
            f.vx = moveDir * moveSpeed;
            if (f.onGround) {
              f.state = 'run';
              f.walkPhase += dt * 12;
            }
          } else {
            f.vx *= Math.pow(0.001, dt);
            if (Math.abs(f.vx) < 8) f.vx = 0;
            if (f.onGround) f.state = 'idle';
          }

          if (inp.upPressed && f.onGround) {
            f.vy = -510;
            f.onGround = false;
            f.state = 'jump';
            bus.emit('combat:jump', { fighter: f });
          } else if (inp.up && !f.onGround && f.flyEnergy > 2) {
            if (!f.flying && f.vy > -120) {
              f.flying = true;
              bus.emit('combat:fly', { fighter: f, word: Math.random() < 0.5 ? '飞' : '飘' });
            }
            if (f.flying) {
              f.state = 'fly';
              f.flyEnergy = Math.max(0, f.flyEnergy - 32 * dt);
              f.vy += (-140 - f.vy) * Math.min(1, dt * 8);
              const minFlyY = Math.max(CEILING_Y + 60, f.height + 42);
              if (f.y < minFlyY) f.vy = Math.max(0, f.vy);
            }
          } else {
            f.flying = false;
            if (!f.onGround) f.state = 'jump';
          }
        }
      }

      const grav = f.flying ? 120 : 1280;
      f.vy += grav * dt;
      if (locked) f.vx *= Math.pow(0.25, dt);

      f.x += f.vx * dt;
      f.y += f.vy * dt;

      if (f.y >= GROUND_Y) {
        f.y = GROUND_Y;
        f.vy = 0;
        f.onGround = true;
        f.flying = false;
        f.flyEnergy = Math.min(f.maxFlyEnergy, f.flyEnergy + 46 * dt);
      } else {
        f.onGround = false;
      }

      const minY = Math.max(CEILING_Y + 45, f.height + 28);
      if (f.y < minY) {
        f.y = minY;
        if (f.vy < 0) f.vy = 0;
      }
      const leftBound = STAGE_LEFT + Math.max(0, f.halfW - 24);
      const rightBound = STAGE_RIGHT - Math.max(0, f.halfW - 24);
      if (f.x < leftBound) { f.x = leftBound; f.vx = 0; }
      if (f.x > rightBound) { f.x = rightBound; f.vx = 0; }
    }

    function updateProjectiles(dt) {
      const peels = arenaState.bananaPeels;
      for (let i = peels.length - 1; i >= 0; i--) {
        const b = peels[i];
        b.life -= dt;
        b.armDelay = Math.max(0, b.armDelay - dt);
        if (!b.landed) {
          b.vy += 980 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.rot += dt * 9;
          if (b.y >= GROUND_Y - 5) {
            b.y = GROUND_Y - 5;
            b.vx = 0; b.vy = 0; b.rot = 0;
            b.landed = true;
          }
        }
        if (b.x < STAGE_LEFT || b.x > STAGE_RIGHT || b.life <= 0) {
          peels.splice(i, 1);
          continue;
        }
        if (b.armDelay <= 0 && arenaState.matchState === 'fighting') {
          const target = arenaState.fighters[1 - b.owner];
          if (target && target.state !== 'slip' && target.state !== 'ko') {
            if (Math.abs(target.x - b.x) < Math.max(28, target.halfW * 0.72) && Math.abs(target.y - b.y) < 28) {
              triggerSlip(target, b);
              peels.splice(i, 1);
              continue;
            }
          }
        }
      }

      const orbs = arenaState.energyOrbs;
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i];
        o.life -= dt;
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        o.rot += dt * 7;

        if (Math.random() < 0.45) {
          arenaState.particles.push({
            x: o.x - Math.sign(o.vx) * 14 + (Math.random() - 0.5) * 12,
            y: o.y + (Math.random() - 0.5) * 16,
            vx: -o.vx * 0.12 + (Math.random() - 0.5) * 30,
            vy: (Math.random() - 0.5) * 30,
            life: 0.22,
            maxLife: 0.22,
            size: Math.random() < 0.45 ? 5 : 2.2,
            style: Math.random() < 0.45 ? 'diamond' : 'dot',
            rot: 0
          });
        }

        if (o.life <= 0 || o.x < 10 || o.x > W - 10) {
          orbs.splice(i, 1);
          continue;
        }

        let clashed = false;
        for (let j = i - 1; j >= 0; j--) {
          const o2 = orbs[j];
          if (o2.owner !== o.owner && Math.hypot(o.x - o2.x, o.y - o2.y) < o.r + o2.r + 4) {
            bus.emit('combat:orbClash', { x: (o.x + o2.x) * 0.5, y: (o.y + o2.y) * 0.5 });
            orbs.splice(i, 1);
            orbs.splice(j, 1);
            i--;
            clashed = true;
            break;
          }
        }
        if (clashed) continue;

        const target = arenaState.fighters[1 - o.owner];
        const attacker = arenaState.fighters[o.owner];
        const hitHalfX = target ? Math.max(30, target.halfW * 0.88) : 30;
        const inBodyY = target && o.y >= target.y - target.height - 6 && o.y <= target.y + 6;
        if (target && Math.abs(target.x - o.x) < hitHalfX && inBodyY) {
          if (target.state === 'shield' && target.shieldTime < 0.24) {
            o.owner = target.id;
            o.vx = -o.vx * 1.15;
            o.life = 2.0;
            bus.emit('combat:parry', { defender: target, x: o.x, y: o.y });
          } else {
            damageFighter(attacker, target, 12, Math.sign(o.vx) * 200, -135);
            orbs.splice(i, 1);
          }
        }
      }
    }

    function separateFighters() {
      if (arenaState.matchState !== 'fighting' || arenaState.fighters.length < 2) return;
      const f0 = arenaState.fighters[0];
      const f1 = arenaState.fighters[1];
      const minSep = Math.max(34, (f0.halfW + f1.halfW) * 0.72);
      const dx = f1.x - f0.x;
      const overlapY = f0.y >= f1.y - f1.height && f1.y >= f0.y - f0.height;
      if (Math.abs(dx) < minSep && overlapY) {
        const push = (minSep - Math.abs(dx)) * 0.5;
        const dir = dx >= 0 ? 1 : -1;
        f0.x = Math.max(STAGE_LEFT + Math.max(0, f0.halfW - 24), f0.x - dir * push);
        f1.x = Math.min(STAGE_RIGHT - Math.max(0, f1.halfW - 24), f1.x + dir * push);
      }
    }

    return { startSlash, startBanana, startOrb, triggerSlip, updateFighter, updateProjectiles, separateFighters };
  })();

  // =========================================================
  // 6. AISystem（自适应角色体积与攻击距离）
  // =========================================================
  const AISystem = (() => {
    function compute(f, enemy, dt) {
      const inp = { left: false, right: false, up: false, upPressed: false, down: false, sword: false, banana: false, orb: false };
      if (arenaState.matchState !== 'fighting') return inp;

      const dx = enemy.x - f.x;
      const dist = Math.abs(dx);
      const dir = dx >= 0 ? 1 : -1;
      const meleeDist = f.metrics.slashReach + enemy.halfW + 18;

      const incomingOrb = arenaState.energyOrbs.find(
        (o) => o.owner !== f.id && Math.abs(o.x - f.x) < 160 && Math.sign(o.vx) === Math.sign(f.x - o.x)
      );
      const reactChance = [0.35, 0.68, 0.92][systemState.aiDifficulty];
      if (incomingOrb && incomingOrb.y >= f.y - f.height && incomingOrb.y <= f.y) {
        if (Math.random() < reactChance) {
          if (Math.random() < 0.65) inp.down = true;
          else { inp.up = true; inp.upPressed = true; }
          return inp;
        }
      }

      const nearbyPeel = arenaState.bananaPeels.find(
        (p) => p.landed && p.owner !== f.id && Math.abs(p.x - f.x) < Math.max(62, f.halfW + 30)
      );
      if (nearbyPeel && f.onGround && Math.random() < reactChance) {
        inp.up = true;
        inp.upPressed = true;
      }

      f.aiTimer -= dt;
      const thinkRate = [0.42, 0.24, 0.13][systemState.aiDifficulty];
      if (f.aiTimer <= 0) {
        f.aiTimer = thinkRate + Math.random() * 0.18;
        const r = Math.random();
        if (dist < meleeDist + 16) {
          if (enemy.state === 'slash' && r < 0.48) f.aiIntent = 'shield';
          else if (r < 0.65) f.aiIntent = 'slash';
          else if (r < 0.85) f.aiIntent = 'retreat';
          else f.aiIntent = 'fly_attack';
        } else if (dist < 290) {
          if (r < 0.36) f.aiIntent = 'approach';
          else if (r < 0.62) f.aiIntent = 'banana';
          else if (r < 0.85) f.aiIntent = 'orb';
          else f.aiIntent = 'fly_attack';
        } else {
          if (r < 0.45) f.aiIntent = 'approach';
          else if (r < 0.78) f.aiIntent = 'orb';
          else f.aiIntent = 'fly_attack';
        }
      }

      switch (f.aiIntent) {
        case 'approach':
          if (dir < 0) inp.left = true; else inp.right = true;
          if (dist < meleeDist && Math.random() < 0.15) inp.sword = true;
          break;
        case 'retreat':
          if (dir < 0) inp.right = true; else inp.left = true;
          if (f.cooldowns.banana <= 0 && Math.random() < 0.12) inp.banana = true;
          break;
        case 'slash':
          if (dir < 0) inp.left = true; else inp.right = true;
          if (dist < meleeDist) inp.sword = true;
          break;
        case 'banana':
          f.facing = dir;
          if (f.cooldowns.banana <= 0) { inp.banana = true; f.aiIntent = 'retreat'; }
          else if (dir < 0) inp.left = true; else inp.right = true;
          break;
        case 'orb':
          f.facing = dir;
          if (f.cooldowns.orb <= 0) { inp.orb = true; f.aiIntent = 'approach'; }
          else if (dir < 0) inp.left = true; else inp.right = true;
          break;
        case 'shield':
          inp.down = true;
          break;
        case 'fly_attack':
          if (f.flyEnergy > 25) {
            inp.up = true;
            if (f.onGround) inp.upPressed = true;
          }
          if (dir < 0) inp.left = true; else inp.right = true;
          if (dist < meleeDist + 18 && Math.random() < 0.14) inp.sword = true;
          else if (dist > 160 && f.cooldowns.orb <= 0 && Math.random() < 0.08) inp.orb = true;
          break;
      }
      return inp;
    }

    return { compute };
  })();

  // =========================================================
  // 7. StorySystem（原画六格动画演绎）
  // =========================================================
  const STORY_CAPTIONS = {
    1: '第 1 格：大太阳下，「人」字小人偷偷丢出一块香蕉皮……',
    2: '第 2 格：啊呀！对面小人踩中香蕉皮，四脚朝天滑飞了！',
    3: '第 3 格：怒气大剑客暴怒（💢），放出菱形星光能量波！',
    4: '第 4 格：举剑撑起手绘大圆盾，严阵以待！',
    5: '第 5 格：夜幕弯月升起！怒气剑客在「天」上飞、飘，俯视「地」上的人！',
    6: '第 6 格：胜负已分，对手倒地，剑客潇洒「走了」！'
  };

  const StorySystem = (() => {
    function start() {
      const prevTime = arenaState.time;
      arenaState = createFreshArenaState();
      arenaState.time = prevTime;
      arenaState.story.active = true;
      arenaState.fighters = [
        createFighter(0, 'ren', 260, 1),
        createFighter(1, 'angry', 590, -1)
      ];
      bus.emit('story:start', { caption: STORY_CAPTIONS[1] });
    }

    function stop() {
      arenaState.story.active = false;
      bus.emit('story:stop');
      Commands.resetMatch();
    }

    function update(dt) {
      const st = arenaState.story;
      st.t += dt;
      const t = st.t;
      const ren = arenaState.fighters[0];
      const angry = arenaState.fighters[1];
      const prevPanel = st.panel;

      const once = (key, fn) => {
        if (!st.triggered[key]) { st.triggered[key] = true; fn(); }
      };

      if (t < 2.1) {
        st.panel = 1;
        once('p1', () => {
          ren.x = 260; ren.y = GROUND_Y; ren.facing = 1;
          angry.x = 610; angry.y = GROUND_Y; angry.facing = -1;
          angry.role = 'ren';
        });
        if (t > 0.65) once('p1_banana', () => { ren.cooldowns.banana = 0; CombatSystem.startBanana(ren); });
        if (t > 1.25) { angry.x -= 130 * dt; angry.state = 'run'; angry.walkPhase += dt * 10; }
      } else if (t < 4.3) {
        st.panel = 2;
        once('p2_slip', () => { angry.role = 'ren'; CombatSystem.triggerSlip(angry, { x: angry.x - 10 }); });
      } else if (t < 6.8) {
        st.panel = 3;
        once('p3_orb', () => {
          arenaState.bananaPeels.length = 0;
          angry.role = 'angry';
          angry.state = 'idle';
          angry.x = 380; angry.y = GROUND_Y; angry.vx = 0; angry.vy = 0; angry.facing = 1;
          ren.x = 740; ren.y = GROUND_Y; ren.facing = -1;
          angry.cooldowns.orb = 0;
          CombatSystem.startOrb(angry);
        });
      } else if (t < 8.8) {
        st.panel = 4;
        angry.state = 'shield';
        angry.facing = -1;
        angry.x = 460;
        angry.y = GROUND_Y;
      } else if (t < 11.8) {
        st.panel = 5;
        once('p5_fly', () => {
          ren.x = 300; ren.y = GROUND_Y; ren.facing = 1; ren.state = 'idle';
          angry.x = 560; angry.y = 310; angry.facing = -1; angry.state = 'fly';
          VfxSystem.spawnCallout('飞', 490, 178, 545, 225, 2.8);
          VfxSystem.spawnCallout('飘', 640, 228, 580, 232, 2.8);
        });
        angry.y = 305 + Math.sin(t * 4) * 14;
        angry.x = 560 + Math.cos(t * 2) * 26;
        angry.state = 'fly';
      } else if (t < 14.8) {
        st.panel = 6;
        once('p6_ko', () => {
          ren.x = 340; ren.y = GROUND_Y; ren.facing = -1; ren.state = 'ko';
          angry.x = 540; angry.y = GROUND_Y; angry.facing = 1; angry.state = 'walkoff';
          VfxSystem.spawnCallout('走了', 510, 305, 540, 345, 2.9);
          bus.emit('match:ko', { winner: null, loser: null });
        });
        angry.x += 70 * dt;
        angry.walkPhase += dt * 7;
      } else {
        stop();
        return;
      }

      if (st.panel !== prevPanel) {
        bus.emit('story:panelChanged', { panel: st.panel, caption: STORY_CAPTIONS[st.panel] });
      }

      if (angry.state === 'slip') {
        angry.vy += 1200 * dt;
        angry.x += angry.vx * dt;
        angry.y = Math.min(GROUND_Y, angry.y + angry.vy * dt);
        angry.slipRot += dt * 11;
      }
      CombatSystem.updateProjectiles(dt);
      VfxSystem.update(dt);
    }

    return { start, stop, update };
  })();

  // =========================================================
  // 8. System Commands（统一入口，维护真值并广播）
  // =========================================================
  const Commands = {
    resetMatch() {
      const prevTime = arenaState.time;
      arenaState = createFreshArenaState();
      arenaState.time = prevTime;
      arenaState.fighters = [
        createFighter(0, systemState.selectedRoles[0], 250, 1),
        createFighter(1, systemState.selectedRoles[1], W - 250, -1)
      ];
      bus.emit('match:reset', { fighters: arenaState.fighters });
    },
    setGameMode(mode) {
      if (arenaState.story.active) StorySystem.stop();
      systemState.gameMode = mode;
      bus.emit('system:modeChanged', { mode });
      Commands.resetMatch();
    },
    cycleDifficulty() {
      systemState.aiDifficulty = (systemState.aiDifficulty + 1) % 3;
      bus.emit('system:difficultyChanged', { aiDifficulty: systemState.aiDifficulty });
    },
    setRole(slotIdx, roleId) {
      if (arenaState.story.active) StorySystem.stop();
      systemState.selectedRoles[slotIdx] = Assets.get(roleId).id;
      bus.emit('system:rosterChanged', { selectedRoles: systemState.selectedRoles.slice() });
      Commands.resetMatch();
    },
    cycleTimeMode() {
      const modes = ['auto', 'day', 'night'];
      const next = modes[(modes.indexOf(systemState.timeMode) + 1) % modes.length];
      systemState.timeMode = next;
      bus.emit('system:timeModeChanged', { timeMode: next });
    },
    toggleSound() {
      systemState.soundEnabled = !systemState.soundEnabled;
      if (systemState.soundEnabled) AudioSystem.ensure();
      bus.emit('system:soundChanged', { soundEnabled: systemState.soundEnabled });
    },
    toggleStory() {
      if (arenaState.story.active) StorySystem.stop();
      else StorySystem.start();
    }
  };

  // =========================================================
  // 9. Canvas Renderer（只读状态，不改状态）
  // =========================================================
  const Renderer = (() => {
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const paperTex = S.createPaperTexture(W, H);

    function resize() {
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    global.addEventListener('resize', resize);

    function drawSun(x, y, alpha) {
      if (alpha <= 0.01) return;
      const s = S.boilSeed(101, arenaState.time);
      ctx.save();
      ctx.globalAlpha = alpha;
      S.sketchCircle(ctx, x, y, 25, 2.8, '#1e1c1a', '#f6f2e8', s, 1.2);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + arenaState.time * 0.12;
        const r1 = 33 + S.jitter(s + i * 5, 2.5);
        const r2 = 51 + S.jitter(s + i * 7, 5);
        S.sketchLine(ctx, x + Math.cos(a) * r1, y + Math.sin(a) * r1, x + Math.cos(a) * r2, y + Math.sin(a) * r2, 2.5, '#1e1c1a', s + i * 11, 1.0);
      }
      ctx.restore();
    }

    function drawMoon(x, y, alpha) {
      if (alpha <= 0.01) return;
      const s = S.boilSeed(202, arenaState.time);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.strokeStyle = '#1e1c1a';
      ctx.fillStyle = '#fff9de';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-12 + S.jitter(s, 1), -34 + S.jitter(s + 1, 1));
      ctx.bezierCurveTo(28, -32, 34, 24, -10 + S.jitter(s + 2, 1), 36 + S.jitter(s + 3, 1));
      ctx.bezierCurveTo(10, 14, 10, -14, -12 + S.jitter(s, 1), -34 + S.jitter(s + 1, 1));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    function drawStage() {
      ctx.drawImage(paperTex, 0, 0);
      if (arenaState.skyNightFactor > 0.01) {
        ctx.fillStyle = `rgba(38, 48, 72, ${arenaState.skyNightFactor * 0.10})`;
        ctx.fillRect(0, 0, W, GROUND_Y);
      }
      const s = S.boilSeed(303, arenaState.time);
      S.sketchLine(ctx, 10, 10, W - 10, 10, 2.2, 'rgba(30,28,26,0.35)', s + 1, 1.2);
      S.sketchLine(ctx, W - 10, 10, W - 10, H - 10, 2.2, 'rgba(30,28,26,0.35)', s + 2, 1.2);
      S.sketchLine(ctx, W - 10, H - 10, 10, H - 10, 2.2, 'rgba(30,28,26,0.35)', s + 3, 1.2);
      S.sketchLine(ctx, 10, H - 10, 10, 10, 2.2, 'rgba(30,28,26,0.35)', s + 4, 1.2);

      drawSun(W - 108, 140, 1 - arenaState.skyNightFactor);
      drawMoon(W - 104, 142, arenaState.skyNightFactor);

      ctx.fillStyle = 'rgba(30,28,26,0.035)';
      ctx.fillRect(10, GROUND_Y, W - 20, H - GROUND_Y - 10);
      S.sketchLine(ctx, 10, GROUND_Y, W - 10, GROUND_Y, 3.6, '#1e1c1a', s + 10, 1.8);
      S.sketchLine(ctx, 10, GROUND_Y + 42, W - 10, GROUND_Y + 42, 2.2, 'rgba(30,28,26,0.55)', s + 12, 1.5);

      ctx.save();
      ctx.fillStyle = 'rgba(30,28,26,0.72)';
      ctx.font = 'bold 20px "Kaiti SC", "STKaiti", "PingFang SC", cursive';
      ctx.fillText('这', 28, 224);
      ctx.fillText('是', 28, 248);
      ctx.fillText('天', 28, 272);
      S.sketchLine(ctx, 37, 434, 37, 290, 2.2, 'rgba(30,28,26,0.68)', s + 20, 1.0);
      S.sketchLine(ctx, 37, 290, 30, 304, 2.2, 'rgba(30,28,26,0.68)', s + 21, 0.7);
      S.sketchLine(ctx, 37, 290, 44, 304, 2.2, 'rgba(30,28,26,0.68)', s + 22, 0.7);
      ctx.fillText('这是地', W - 110, GROUND_Y + 32);
      S.drawCurvedPointer(ctx, W - 156, GROUND_Y + 34, W - 116, GROUND_Y + 24, s + 30);
      ctx.restore();
    }

    function drawBananaPeel(b, idx) {
      const s = S.boilSeed(900 + idx * 17, arenaState.time);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.strokeStyle = '#1e1c1a';
      ctx.fillStyle = '#fae8a2';
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.quadraticCurveTo(-8, -4, -18, 4);
      ctx.quadraticCurveTo(-8, 6, -3, -2);
      ctx.quadraticCurveTo(0, 8, 2, 7);
      ctx.quadraticCurveTo(5, -1, 18, 4);
      ctx.quadraticCurveTo(10, -5, 2, -14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      S.sketchLine(ctx, 0, -14, 1, -20, 2.6, '#1e1c1a', s, 0.5);
      ctx.restore();
    }

    function drawEnergyOrb(o, idx) {
      const s = S.boilSeed(1100 + idx * 23, arenaState.time);
      ctx.save();
      ctx.translate(o.x, o.y);
      S.sketchCircle(ctx, 0, 0, o.r, 2.8, '#1e1c1a', '#fffef7', s, 1.3);
      ctx.save();
      ctx.rotate(o.rot);
      ctx.strokeStyle = '#1e1c1a';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, o.r * 0.55, 0.2, Math.PI * 1.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, o.r * 0.25, Math.PI, Math.PI * 2.2);
      ctx.stroke();
      ctx.restore();
      for (let k = 0; k < 3; k++) {
        const a = o.rot * 1.3 + (k * Math.PI * 2) / 3;
        S.drawDiamond(ctx, Math.cos(a) * (o.r + 12), Math.sin(a) * (o.r + 10), 5.5);
      }
      ctx.restore();
    }

    function drawHUD() {
      if (arenaState.story.active) return;
      const barW = 290, barH = 18, topY = 40;

      arenaState.fighters.forEach((f, idx) => {
        const isLeft = idx === 0;
        const bx = isLeft ? 42 : W - 42 - barW;
        const s = S.boilSeed(1400 + idx * 31, arenaState.time);

        ctx.save();
        ctx.fillStyle = '#1e1c1a';
        ctx.font = 'bold 16px "PingFang SC", sans-serif';
        ctx.textAlign = isLeft ? 'left' : 'right';
        const who = isLeft ? `1P · ${f.name}` : `${systemState.gameMode === '2p' ? '2P' : '电脑'} · ${f.name}`;
        ctx.fillText(who, isLeft ? bx : bx + barW, topY - 6);

        ctx.fillStyle = '#fffdf8';
        ctx.fillRect(bx, topY, barW, barH);
        const hpRatio = Math.max(0, f.hp / f.maxHp);
        const fillW = barW * hpRatio;
        ctx.fillStyle = hpRatio > 0.45 ? (isLeft ? '#c94a38' : '#2e6b8a') : '#d98a2b';
        if (isLeft) ctx.fillRect(bx, topY, fillW, barH);
        else ctx.fillRect(bx + (barW - fillW), topY, fillW, barH);

        S.sketchLine(ctx, bx, topY, bx + barW, topY, 2.4, '#1e1c1a', s + 1, 0.8);
        S.sketchLine(ctx, bx + barW, topY, bx + barW, topY + barH, 2.4, '#1e1c1a', s + 2, 0.8);
        S.sketchLine(ctx, bx + barW, topY + barH, bx, topY + barH, 2.4, '#1e1c1a', s + 3, 0.8);
        S.sketchLine(ctx, bx, topY + barH, bx, topY, 2.4, '#1e1c1a', s + 4, 0.8);

        const fy = topY + barH + 7, fw = 155, fh = 7;
        const fx = isLeft ? bx : bx + barW - fw;
        ctx.fillStyle = 'rgba(30,28,26,0.12)';
        ctx.fillRect(fx, fy, fw, fh);
        ctx.fillStyle = '#5c4b8a';
        const flyW = fw * (f.flyEnergy / f.maxFlyEnergy);
        if (isLeft) ctx.fillRect(fx, fy, flyW, fh);
        else ctx.fillRect(fx + (fw - flyW), fy, flyW, fh);
        ctx.strokeStyle = '#1e1c1a';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(fx, fy, fw, fh);

        ctx.font = 'bold 11px "PingFang SC", sans-serif';
        ctx.fillStyle = '#4e4942';
        ctx.textAlign = isLeft ? 'left' : 'right';
        ctx.fillText('飞/飘气力', isLeft ? fx + fw + 6 : fx - 6, fy + 7);
        ctx.restore();
      });

      ctx.save();
      ctx.font = '900 22px "Kaiti SC", "PingFang SC", serif';
      ctx.fillStyle = '#1e1c1a';
      ctx.textAlign = 'center';
      ctx.fillText('VS', W * 0.5, topY + 15);
      ctx.restore();

      if (arenaState.matchState === 'ko' && arenaState.koTimer > 0.6) {
        ctx.save();
        const boxW = 436, boxH = 104;
        const rx = (W - boxW) * 0.5, ry = 128;
        ctx.fillStyle = 'rgba(246, 242, 232, 0.95)';
        ctx.fillRect(rx, ry, boxW, boxH);
        S.sketchLine(ctx, rx, ry, rx + boxW, ry, 3, '#1e1c1a', 81, 1.3);
        S.sketchLine(ctx, rx + boxW, ry, rx + boxW, ry + boxH, 3, '#1e1c1a', 82, 1.3);
        S.sketchLine(ctx, rx + boxW, ry + boxH, rx, ry + boxH, 3, '#1e1c1a', 83, 1.3);
        S.sketchLine(ctx, rx, ry + boxH, rx, ry, 3, '#1e1c1a', 84, 1.3);

        const winner = arenaState.fighters[arenaState.winnerId];
        const winLabel = arenaState.winnerId === 0 ? '1P 胜出！' : (systemState.gameMode === '2p' ? '2P 胜出！' : '电脑胜出！');
        ctx.fillStyle = '#1e1c1a';
        ctx.font = '900 24px "Kaiti SC", "PingFang SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${winLabel}（${winner.name}）`, W * 0.5, ry + 48);

        ctx.font = 'bold 14px "PingFang SC", sans-serif';
        ctx.fillStyle = '#4e4942';
        ctx.fillText('按 R / Start 键或点击「重来」再打一局', W * 0.5, ry + 80);
        ctx.restore();
      }
    }

    function render() {
      ctx.save();
      if (arenaState.shakeTime > 0) {
        ctx.translate((Math.random() - 0.5) * 2 * arenaState.shakeAmp, (Math.random() - 0.5) * 2 * arenaState.shakeAmp);
      }

      drawStage();
      arenaState.bananaPeels.forEach(drawBananaPeel);

      const env = {
        time: arenaState.time,
        groundY: GROUND_Y,
        gameMode: systemState.gameMode,
        storyActive: arenaState.story.active
      };
      // Draw taller characters behind smaller ones when close so small stickman stays clearly readable
      const drawOrder = arenaState.fighters.slice().sort((a, b) => b.height - a.height);
      drawOrder.forEach((f) => f.asset.draw(ctx, f, env));

      arenaState.energyOrbs.forEach(drawEnergyOrb);

      arenaState.particles.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        if (p.style === 'diamond') S.drawDiamond(ctx, p.x, p.y, p.size);
        else {
          ctx.fillStyle = '#1e1c1a';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      arenaState.callouts.forEach((c) => {
        ctx.save();
        ctx.globalAlpha = Math.min(1, c.life / 0.35);
        ctx.fillStyle = '#1e1c1a';
        ctx.font = 'bold 28px "Kaiti SC", "STKaiti", "PingFang SC", cursive';
        ctx.textAlign = 'center';
        ctx.fillText(c.text, c.x, c.y);
        S.drawCurvedPointer(ctx, c.x, c.y + 8, c.targetX, c.targetY, Math.floor(c.x));
        ctx.restore();
      });

      drawHUD();

      if (arenaState.story.active) {
        ctx.save();
        ctx.font = 'bold 34px "Kaiti SC", "Comic Sans MS", cursive';
        ctx.fillStyle = '#1e1c1a';
        ctx.fillText(String(arenaState.story.panel), 36, 56);
        ctx.restore();
      }
      ctx.restore();
    }

    return { render };
  })();

  // =========================================================
  // 10. UISystem（只做展示和入口，订阅广播同步界面）
  // =========================================================
  const UISystem = (() => {
    const btnMode1P = document.getElementById('btnMode1P');
    const btnMode2P = document.getElementById('btnMode2P');
    const btnDiff = document.getElementById('btnDiff');
    const selP1 = document.getElementById('selP1');
    const selP2 = document.getElementById('selP2');
    const lblP2 = document.getElementById('lblP2');
    const btnTime = document.getElementById('btnTime');
    const btnStory = document.getElementById('btnStory');
    const btnSound = document.getElementById('btnSound');
    const btnRestart = document.getElementById('btnRestart');
    const p2Guide = document.getElementById('p2Guide');
    const gamepadPill = document.getElementById('gamepadPill');
    const storyCaption = document.getElementById('storyCaption');

    const diffLabels = ['电脑：轻松', '电脑：普通', '电脑：高手'];
    const timeLabels = { auto: '☀ 自动日夜', day: '☀ 太阳', night: '🌙 月亮' };

    function populateRosterSelects() {
      const chars = Assets.list();
      [selP1, selP2].forEach((sel, idx) => {
        sel.innerHTML = '';
        chars.forEach((c) => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = c.name;
          sel.appendChild(opt);
        });
        sel.value = systemState.selectedRoles[idx];
      });
    }

    function syncAll() {
      const is2P = systemState.gameMode === '2p';
      btnMode1P.classList.toggle('active', !is2P);
      btnMode2P.classList.toggle('active', is2P);
      btnDiff.style.display = is2P ? 'none' : '';
      p2Guide.style.display = is2P ? '' : 'none';
      lblP2.textContent = is2P ? '2P' : '电脑';
      btnDiff.textContent = diffLabels[systemState.aiDifficulty];
      btnTime.textContent = timeLabels[systemState.timeMode];
      btnSound.textContent = systemState.soundEnabled ? '🔊 音效开' : '🔇 音效关';
      selP1.value = systemState.selectedRoles[0];
      selP2.value = systemState.selectedRoles[1];
    }

    bus.on('system:modeChanged', syncAll);
    bus.on('system:difficultyChanged', syncAll);
    bus.on('system:rosterChanged', syncAll);
    bus.on('system:timeModeChanged', syncAll);
    bus.on('system:soundChanged', syncAll);

    bus.on('system:gamepadChanged', ({ count }) => {
      if (count === 0) {
        gamepadPill.textContent = '🎮 手柄未连接';
        gamepadPill.classList.remove('connected');
      } else if (count === 1) {
        gamepadPill.textContent = '🎮 已连 1P 手柄';
        gamepadPill.classList.add('connected');
      } else {
        gamepadPill.textContent = '🎮 已连 1P + 2P 手柄';
        gamepadPill.classList.add('connected');
      }
    });

    bus.on('story:start', ({ caption }) => {
      storyCaption.textContent = caption;
      storyCaption.classList.add('visible');
      btnStory.classList.add('active');
      btnStory.textContent = '⏹ 结束演示';
    });
    bus.on('story:panelChanged', ({ caption }) => {
      storyCaption.textContent = caption;
    });
    bus.on('story:stop', () => {
      storyCaption.classList.remove('visible');
      btnStory.classList.remove('active');
      btnStory.textContent = '▶ 播原画六格';
    });

    function init() {
      populateRosterSelects();
      syncAll();

      btnMode1P.addEventListener('click', () => { AudioSystem.ensure(); Commands.setGameMode('1p'); });
      btnMode2P.addEventListener('click', () => { AudioSystem.ensure(); Commands.setGameMode('2p'); });
      btnDiff.addEventListener('click', () => { AudioSystem.ensure(); Commands.cycleDifficulty(); });
      selP1.addEventListener('change', () => { AudioSystem.ensure(); Commands.setRole(0, selP1.value); });
      selP2.addEventListener('change', () => { AudioSystem.ensure(); Commands.setRole(1, selP2.value); });
      btnTime.addEventListener('click', () => { AudioSystem.ensure(); Commands.cycleTimeMode(); });
      btnStory.addEventListener('click', () => { AudioSystem.ensure(); Commands.toggleStory(); });
      btnSound.addEventListener('click', () => Commands.toggleSound());
      btnRestart.addEventListener('click', () => {
        AudioSystem.ensure();
        if (arenaState.story.active) StorySystem.stop();
        else Commands.resetMatch();
      });
    }

    return { init };
  })();

  // =========================================================
  // 11. Main Game Loop
  // =========================================================
  function isCurrentlyNight() {
    if (systemState.timeMode === 'day') return false;
    if (systemState.timeMode === 'night') return true;
    if (arenaState.story.active) return arenaState.story.panel >= 5;
    return arenaState.fighters.some((f) => f.hp <= f.maxHp * 0.5);
  }

  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    arenaState.time += dt;

    InputSystem.pollGamepads();

    const targetNight = isCurrentlyNight() ? 1 : 0;
    arenaState.skyNightFactor += (targetNight - arenaState.skyNightFactor) * Math.min(1, dt * 3.5);
    if (arenaState.shakeTime > 0) arenaState.shakeTime = Math.max(0, arenaState.shakeTime - dt);

    if (arenaState.hitstop > 0) {
      arenaState.hitstop = Math.max(0, arenaState.hitstop - dt);
    } else if (arenaState.story.active) {
      StorySystem.update(dt);
    } else {
      if (arenaState.matchState === 'ko') arenaState.koTimer += dt;
      const inp0 = InputSystem.readPlayer(0);
      const inp1 = systemState.gameMode === '2p'
        ? InputSystem.readPlayer(1)
        : AISystem.compute(arenaState.fighters[1], arenaState.fighters[0], dt);

      CombatSystem.updateFighter(arenaState.fighters[0], arenaState.fighters[1], inp0, dt);
      CombatSystem.updateFighter(arenaState.fighters[1], arenaState.fighters[0], inp1, dt);
      CombatSystem.separateFighters();
      CombatSystem.updateProjectiles(dt);
      VfxSystem.update(dt);
    }

    InputSystem.clearFrameEdges();
    Renderer.render();
    requestAnimationFrame(frame);
  }

  // Boot
  InputSystem.bindEvents();
  UISystem.init();
  Commands.resetMatch();
  requestAnimationFrame(frame);

  // 对外暴露调试与扩展入口
  PaperArena.bus = bus;
  PaperArena.systemState = systemState;
  PaperArena.getArenaState = () => arenaState;
  PaperArena.Commands = Commands;
})(window);
