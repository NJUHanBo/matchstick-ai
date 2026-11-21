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

  // 第 5 层：玩家变量（localStorage 持久化的角色/技能调参）
  const TUNING_STORAGE_KEY = 'paperArena_tuning_v1';
  function loadTuning() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(TUNING_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }
  function saveTuning(tuning) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(TUNING_STORAGE_KEY, JSON.stringify(tuning));
      }
    } catch (_) {}
  }

  // 第 4 层：系统属性（切局/重开保留）
  const systemState = {
    gameMode: '1p',           // '1p' | '2p'
    aiDifficulty: 1,          // 0 轻松 | 1 普通 | 2 高手
    timeMode: 'auto',         // 'auto' | 'day' | 'night'
    soundEnabled: true,
    selectedRoles: ['angry', 'ren'],
    gamepadCount: 0,
    settingsOpen: false,
    settingsTab: 'trieye',
    tuning: loadTuning()
  };

  function getEffectiveStats(roleId) {
    const asset = Assets.get(roleId);
    const overrides = (systemState.tuning && systemState.tuning[asset.id]) || {};
    return Object.assign({}, asset.baseStats, overrides);
  }

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
      afterimages: [],
      groundVines: [],
      domainOverlay: null,
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

  // 第 2 层：角色实体工厂（自身属性 + 动画资产 + 生效参数）
  function createFighter(id, roleId, startX, facing) {
    const asset = Assets.get(roleId);
    const stats = getEffectiveStats(asset.id);
    return {
      id,
      role: asset.id,
      asset,
      metrics: asset.metrics,
      stats,
      name: asset.name,
      height: asset.metrics.height,
      halfW: asset.metrics.halfW,
      x: startX,
      y: GROUND_Y,
      vx: 0,
      vy: 0,
      facing,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      flyEnergy: 100,
      maxFlyEnergy: 100,
      onGround: true,
      flying: false,
      state: 'idle',
      stateTimer: 0,
      slashAnimDur: 0.28,
      slashHitDone: false,
      pendingBackstab: false,
      lastBackstabGlow: 0,
      shieldTime: 0,
      invuln: 0,
      cooldowns: { slash: 0, banana: 0, orb: 0, ult: 0, ult2: 0 },
      // 无敌剑状态
      shrinkTimer: 0,
      bodyScale: 1.0,
      speedBoostTimer: 0,
      swordScale: 1.0,
      frozenTimer: 0,
      // 影子状态
      stealthTimer: 0,
      stealthEnterFlash: 0,
      blinkCharges: 0,
      blinkWindowTimer: 0,
      blinkStep: 0,
      blinkHitDone: false,
      scarfGrabHit: false,
      // 藤蔓状态
      vineChannelTimer: 0,
      vineBindTargetId: null,
      vineDrainAccum: 0,
      vineBoundTimer: 0,
      cocoonTimer: 0,
      cocoonPactTimer: 0,
      giantTimer: 0,
      giantBonusHp: 0,
      // 通用动作与 AI
      walkPhase: 0,
      slipRot: 0,
      aiTimer: 0.35,
      aiIntent: 'approach',
      aiLastKnownX: W - startX,
      aiWanderDir: 1
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
      },
      shrink() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(760, now);
        osc.frequency.exponentialRampToValueAtTime(240, now + 0.18);
        gain.gain.setValueAtTime(0.11, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain).connect(ac.destination);
        osc.start(now); osc.stop(now + 0.21);
      },
      speedBoost() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        [330, 495, 660, 990].forEach((f, idx) => {
          const osc = ac.createOscillator(), gain = ac.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f, now + idx * 0.04);
          osc.frequency.exponentialRampToValueAtTime(f * 1.4, now + idx * 0.04 + 0.14);
          gain.gain.setValueAtTime(0.07, now + idx * 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.16);
          osc.connect(gain).connect(ac.destination);
          osc.start(now + idx * 0.04); osc.stop(now + idx * 0.04 + 0.17);
        });
      },
      freezeLight() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        [980, 1480].forEach((f, idx) => {
          const osc = ac.createOscillator(), gain = ac.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, now + idx * 0.02);
          osc.frequency.exponentialRampToValueAtTime(f * 1.35, now + 0.16);
          gain.gain.setValueAtTime(0.08, now + idx * 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
          osc.connect(gain).connect(ac.destination);
          osc.start(now + idx * 0.02); osc.stop(now + 0.19);
        });
      },
      frozen() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        [1320, 1760, 2093].forEach((f, idx) => {
          const osc = ac.createOscillator(), gain = ac.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, now + idx * 0.04);
          gain.gain.setValueAtTime(0.09, now + idx * 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.28);
          osc.connect(gain).connect(ac.destination);
          osc.start(now + idx * 0.04); osc.stop(now + idx * 0.04 + 0.30);
        });
      },
      shadowHide() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(360, now);
        osc.frequency.exponentialRampToValueAtTime(95, now + 0.22);
        gain.gain.setValueAtTime(0.11, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.connect(gain).connect(ac.destination);
        osc.start(now); osc.stop(now + 0.25);
      },
      shadowBlink() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(860, now);
        osc.frequency.exponentialRampToValueAtTime(240, now + 0.11);
        gain.gain.setValueAtTime(0.10, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        osc.connect(gain).connect(ac.destination);
        osc.start(now); osc.stop(now + 0.14);
      },
      shadowBackstab() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        [720, 1080].forEach((f, idx) => {
          const osc = ac.createOscillator(), gain = ac.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f, now + idx * 0.03);
          osc.frequency.exponentialRampToValueAtTime(160, now + idx * 0.03 + 0.16);
          gain.gain.setValueAtTime(0.13, now + idx * 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.03 + 0.18);
          osc.connect(gain).connect(ac.destination);
          osc.start(now + idx * 0.03); osc.stop(now + idx * 0.03 + 0.19);
        });
      },
      shadowDomainGrab() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        [220, 165, 110].forEach((f, idx) => {
          const osc = ac.createOscillator(), gain = ac.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, now + idx * 0.05);
          osc.frequency.exponentialRampToValueAtTime(f * 0.65, now + idx * 0.05 + 0.25);
          gain.gain.setValueAtTime(0.14, now + idx * 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.28);
          osc.connect(gain).connect(ac.destination);
          osc.start(now + idx * 0.05); osc.stop(now + idx * 0.05 + 0.30);
        });
      },
      shadowDomainHit() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(920, now);
        osc.frequency.exponentialRampToValueAtTime(190, now + 0.10);
        gain.gain.setValueAtTime(0.13, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain).connect(ac.destination);
        osc.start(now); osc.stop(now + 0.13);
      },
      vineBind() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        [240, 320, 420].forEach((f, idx) => {
          const osc = ac.createOscillator(), gain = ac.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, now + idx * 0.04);
          osc.frequency.exponentialRampToValueAtTime(f * 1.15, now + idx * 0.04 + 0.12);
          gain.gain.setValueAtTime(0.09, now + idx * 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.14);
          osc.connect(gain).connect(ac.destination);
          osc.start(now + idx * 0.04); osc.stop(now + idx * 0.04 + 0.15);
        });
      },
      vineDrain() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(410, now);
        osc.frequency.exponentialRampToValueAtTime(620, now + 0.14);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(gain).connect(ac.destination);
        osc.start(now); osc.stop(now + 0.17);
      },
      vinePierce() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        [150, 540, 880].forEach((f, idx) => {
          const osc = ac.createOscillator(), gain = ac.createGain();
          osc.type = idx === 0 ? 'triangle' : 'sawtooth';
          osc.frequency.setValueAtTime(f, now + idx * 0.02);
          osc.frequency.exponentialRampToValueAtTime(f * 0.45, now + idx * 0.02 + 0.18);
          gain.gain.setValueAtTime(0.14, now + idx * 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.02 + 0.20);
          osc.connect(gain).connect(ac.destination);
          osc.start(now + idx * 0.02); osc.stop(now + idx * 0.02 + 0.21);
        });
      },
      vineHeal() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        [523, 659, 784].forEach((f, idx) => {
          const osc = ac.createOscillator(), gain = ac.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, now + idx * 0.035);
          gain.gain.setValueAtTime(0.08, now + idx * 0.035);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.035 + 0.18);
          osc.connect(gain).connect(ac.destination);
          osc.start(now + idx * 0.035); osc.stop(now + idx * 0.035 + 0.19);
        });
      },
      vineGiant() {
        const ac = ensure(); if (!ac) return;
        const now = ac.currentTime;
        [140, 105, 82].forEach((f, idx) => {
          const osc = ac.createOscillator(), gain = ac.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f, now + idx * 0.06);
          osc.frequency.exponentialRampToValueAtTime(f * 0.72, now + idx * 0.06 + 0.24);
          gain.gain.setValueAtTime(0.13, now + idx * 0.06);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.26);
          osc.connect(gain).connect(ac.destination);
          osc.start(now + idx * 0.06); osc.stop(now + idx * 0.06 + 0.28);
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
    bus.on('combat:shrink', play.shrink);
    bus.on('combat:speedBoost', play.speedBoost);
    bus.on('combat:freezeLight', play.freezeLight);
    bus.on('combat:frozen', play.frozen);
    bus.on('combat:shadowHide', play.shadowHide);
    bus.on('combat:shadowBlink', play.shadowBlink);
    bus.on('combat:shadowBackstab', play.shadowBackstab);
    bus.on('combat:shadowDomainGrab', play.shadowDomainGrab);
    bus.on('combat:shadowDomainHit', play.shadowDomainHit);
    bus.on('combat:vineBind', play.vineBind);
    bus.on('combat:vineDrainTick', play.vineDrain);
    bus.on('combat:vinePierceShield', play.vinePierce);
    bus.on('combat:vinePierceMiss', play.banana);
    bus.on('combat:vineCocoonStart', play.vineBind);
    bus.on('combat:vineCocoonHeal', play.vineHeal);
    bus.on('combat:vinePactStart', play.speedBoost);
    bus.on('combat:vinePactHit', play.vinePierce);
    bus.on('combat:vineDrainDeath', play.shadowDomainGrab);
    bus.on('combat:vineGiantStart', play.vineGiant);
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
      sword: false, banana: false, orb: false, ult: false, ult2: false
    };
    const touchJustPressed = new Set();

    const gpPrev = [
      { up: false, sword: false, banana: false, orb: false, ult: false, ult2: false, start: false },
      { up: false, sword: false, banana: false, orb: false, ult: false, ult2: false, start: false }
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
        prev.up = prev.sword = prev.banana = prev.orb = prev.ult = prev.ult2 = prev.start = false;
        return {
          left: false, right: false, up: false, upPressed: false,
          down: false, sword: false, banana: false, orb: false, ult: false, ult2: false, startPressed: false
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
      const ultNow = btnPressed(gp, 8) || btnPressed(gp, 10);
      const ult2Now = btnPressed(gp, 11);
      const startNow = btnPressed(gp, 9);

      const res = {
        left, right, up,
        upPressed: up && !prev.up,
        down,
        sword: swordNow && !prev.sword,
        banana: bananaNow && !prev.banana,
        orb: orbNow && !prev.orb,
        ult: ultNow && !prev.ult,
        ult2: ult2Now && !prev.ult2,
        startPressed: startNow && !prev.start
      };
      prev.up = up;
      prev.sword = swordNow;
      prev.banana = bananaNow;
      prev.orb = orbNow;
      prev.ult = ultNow;
      prev.ult2 = ult2Now;
      prev.start = startNow;

      if (res.upPressed || res.sword || res.banana || res.orb || res.ult || res.ult2 || res.startPressed) {
        AudioSystem.ensure();
      }
      return res;
    }

    function readPlayer(playerIdx) {
      const gp = readGamepadSlot(playerIdx);
      if (gp.startPressed && !arenaState.story.active && !systemState.settingsOpen) {
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
          orb: justPressed.has('KeyL') || touchJustPressed.has('orb') || gp.orb,
          ult: justPressed.has('Semicolon') || touchJustPressed.has('ult') || gp.ult,
          ult2: justPressed.has('Quote') || touchJustPressed.has('ult2') || gp.ult2
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
        orb: justPressed.has('Digit3') || justPressed.has('Numpad3') || justPressed.has('Comma') || gp.orb,
        ult: justPressed.has('Digit4') || justPressed.has('Numpad4') || justPressed.has('Slash') || gp.ult,
        ult2: justPressed.has('Digit5') || justPressed.has('Numpad5') || justPressed.has('Period') || gp.ult2
      };
    }

    function clearFrameEdges() {
      justPressed.clear();
      touchJustPressed.clear();
    }

    function bindEvents() {
      global.addEventListener('keydown', (e) => {
        if (systemState.settingsOpen) {
          if (e.code === 'Escape') Commands.closeSettings();
          return;
        }
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
    bus.on('combat:shrink', ({ fighter }) => rumble(fighter.id, 80, 0.2, 0.3));
    bus.on('combat:speedBoost', ({ fighter }) => rumble(fighter.id, 140, 0.5, 0.4));
    bus.on('combat:frozen', ({ victim }) => rumble(victim.id, 150, 0.3, 0.55));
    bus.on('combat:shadowBackstab', ({ defender }) => rumble(defender.id, 160, 0.7, 0.4));
    bus.on('combat:shadowDomainHit', ({ victim }) => rumble(victim.id, 90, 0.6, 0.5));
    bus.on('combat:vinePierceShield', ({ defender }) => rumble(defender.id, 170, 0.7, 0.45));
    bus.on('combat:vineGiantStart', ({ fighter }) => rumble(fighter.id, 200, 0.65, 0.4));
    bus.on('combat:vineDrainDeath', ({ fighter }) => rumble(fighter.id, 300, 0.85, 0.6));
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
    function spawnSparkles(x, y, count = 8, style = 'diamond', color = '#1e1c1a') {
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
          color,
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
    bus.on('combat:shrink', ({ fighter }) => {
      spawnSparkles(fighter.x, fighter.y - fighter.height * 0.5, 10, 'dot');
      spawnCallout('变小!', fighter.x - fighter.facing * 24, fighter.y - Math.max(120, fighter.height + 28), fighter.x, fighter.y - fighter.height * 0.6, 0.8);
    });
    bus.on('combat:speedBoost', ({ fighter }) => {
      spawnSparkles(fighter.x, fighter.y - 26, 14, 'diamond');
      spawnCallout('速度加快!', fighter.x - fighter.facing * 24, fighter.y - Math.max(130, fighter.height + 34), fighter.x, fighter.y - fighter.height * 0.78, 0.95);
      shake(4.5, 0.14);
    });
    bus.on('combat:freezeLight', ({ x, y }) => {
      spawnSparkles(x, y, 9, 'diamond');
    });
    bus.on('combat:frozen', ({ victim }) => {
      spawnSparkles(victim.x, victim.y - victim.height * 0.5, 12, 'diamond');
      spawnCallout('静止!', victim.x, victim.y - victim.metrics.calloutOffsetY, victim.x, victim.y - victim.height * 0.75, 0.95);
      arenaState.hitstop = Math.max(arenaState.hitstop, 0.045);
      shake(4, 0.12);
    });
    // 影子广播特效
    bus.on('combat:shadowHide', ({ fighter }) => {
      spawnSparkles(fighter.x, GROUND_Y - 12, 10, 'dot', '#6f3fa6');
      if (systemState.gameMode === '1p' && fighter.id === 0) {
        spawnCallout('藏进阴影!', fighter.x, GROUND_Y - 105, fighter.x, GROUND_Y - 22, 0.75);
      }
    });
    bus.on('combat:shadowBackstab', ({ defender, mult }) => {
      spawnSparkles(defender.x, defender.y - defender.height * 0.55, 16, 'diamond', '#7b4ca8');
      spawnCallout(`背刺 ×${mult}!`, defender.x, defender.y - defender.metrics.calloutOffsetY - 18, defender.x, defender.y - defender.height * 0.75, 0.95);
      arenaState.hitstop = Math.max(arenaState.hitstop, 0.08);
      shake(8.5, 0.20);
    });
    bus.on('combat:shadowBlink', ({ fighter, step, dmgHit }) => {
      spawnSparkles(fighter.x, fighter.y - 46, 9, 'diamond', '#7b4ca8');
      const label = dmgHit ? `瞬身${step}/3 · ${dmgHit}!` : `瞬身 ${step}/3`;
      spawnCallout(label, fighter.x - fighter.facing * 20, fighter.y - 124, fighter.x, fighter.y - 76, 0.65);
    });
    bus.on('combat:shadowDomainGrab', ({ attacker, victim }) => {
      spawnSparkles(victim.x, victim.y - 50, 18, 'diamond', '#9c6ed4');
      shake(7, 0.22);
    });
    bus.on('combat:shadowDomainHit', ({ victim }) => {
      spawnSparkles(W * 0.5, GROUND_Y - 120, 12, 'diamond', '#b48ce6');
      shake(6, 0.12);
    });
    // 藤蔓广播特效
    bus.on('combat:vineBind', ({ attacker, victim }) => {
      spawnSparkles(victim.x, GROUND_Y - 20, 12, 'dot', '#3c8c30');
      spawnCallout('地底缠绕!', victim.x, victim.y - victim.metrics.calloutOffsetY, victim.x, victim.y - 50, 0.85);
      shake(4, 0.12);
    });
    bus.on('combat:vineDrainTick', ({ attacker, victim, amount }) => {
      spawnSparkles(victim.x, victim.y - 52, 6, 'dot', '#7db838');
      spawnSparkles(attacker.x, attacker.y - 52, 6, 'diamond', '#52a33a');
      spawnCallout(`吸血 +${amount}`, attacker.x, attacker.y - 122, attacker.x, attacker.y - 78, 0.65);
    });
    bus.on('combat:vinePierceShield', ({ defender }) => {
      spawnSparkles(defender.x, defender.y - defender.height * 0.55, 16, 'diamond', '#52a33a');
      spawnCallout('破盾!!', defender.x, defender.y - defender.metrics.calloutOffsetY - 12, defender.x, defender.y - defender.height * 0.7, 0.95);
      arenaState.hitstop = Math.max(arenaState.hitstop, 0.085);
      shake(9, 0.22);
    });
    bus.on('combat:vinePierceMiss', ({ x }) => {
      spawnSparkles(x, GROUND_Y - 26, 7, 'dot', '#52a33a');
      spawnCallout('仅破盾!', x, GROUND_Y - 126, x, GROUND_Y - 56, 0.72);
    });
    bus.on('combat:vineCocoonStart', ({ fighter }) => {
      spawnSparkles(fighter.x, fighter.y - 50, 12, 'dot', '#52a33a');
      spawnCallout('藤蔓茧!', fighter.x, fighter.y - 126, fighter.x, fighter.y - 72, 0.8);
    });
    bus.on('combat:vineCocoonHeal', ({ fighter, heal }) => {
      spawnSparkles(fighter.x, fighter.y - 52, 10, 'diamond', '#7db838');
      spawnCallout(`茧愈 +${heal}`, fighter.x, fighter.y - 130, fighter.x, fighter.y - 76, 0.75);
    });
    bus.on('combat:vinePactStart', ({ fighter }) => {
      spawnSparkles(fighter.x, fighter.y - 52, 14, 'diamond', '#b83c2c');
      spawnCallout('赌命反噬!', fighter.x, fighter.y - 130, fighter.x, fighter.y - 80, 0.9);
      shake(5, 0.14);
    });
    bus.on('combat:vinePactHit', ({ attacker, defender }) => {
      spawnSparkles(defender.x, defender.y - 54, 18, 'diamond', '#52a33a');
      spawnCallout('反噬命中!!', defender.x, defender.y - defender.metrics.calloutOffsetY - 16, defender.x, defender.y - 68, 1.0);
      arenaState.hitstop = Math.max(arenaState.hitstop, 0.09);
      shake(9.5, 0.22);
    });
    bus.on('combat:vineDrainDeath', ({ fighter }) => {
      spawnSparkles(fighter.x, fighter.y - 50, 20, 'dot', '#2f7d32');
      spawnCallout('被藤蔓吸干!', fighter.x, fighter.y - 136, fighter.x, fighter.y - 70, 1.4);
      shake(10, 0.28);
    });
    bus.on('combat:vineGiantStart', ({ fighter }) => {
      spawnSparkles(fighter.x, fighter.y - 70, 20, 'diamond', '#3c8c30');
      spawnCallout('巨藤狂化!', fighter.x, fighter.y - 220, fighter.x, fighter.y - 120, 1.0);
      shake(8.5, 0.24);
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
      for (let i = arenaState.afterimages.length - 1; i >= 0; i--) {
        const a = arenaState.afterimages[i];
        a.life -= dt;
        if (a.life <= 0) arenaState.afterimages.splice(i, 1);
      }
    }

    return { spawnSparkles, spawnCallout, update };
  })();

  // =========================================================
  // 5. CombatSystem（战斗实体与投射物逻辑，只发广播）
  // =========================================================
  const CombatSystem = (() => {
    let groundVineSeq = 1;

    function releaseVineBind(caster) {
      if (caster.vineBindTargetId !== null) {
        const t = arenaState.fighters[caster.vineBindTargetId];
        if (t) t.vineBoundTimer = 0;
        caster.vineBindTargetId = null;
      }
      caster.vineChannelTimer = 0;
      caster.vineDrainAccum = 0;
      for (let i = arenaState.groundVines.length - 1; i >= 0; i--) {
        const gv = arenaState.groundVines[i];
        if (gv.kind === 'bind' && gv.owner === caster.id) arenaState.groundVines.splice(i, 1);
      }
    }

    function resolveVinePactBonus(attacker, defender) {
      if (!attacker || attacker.cocoonPactTimer <= 0) return;
      attacker.cocoonPactTimer = 0;
      const bonusDmg = attacker.stats.pactBonusDamage || 26;
      const heal = attacker.stats.pactHeal || 20;
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
      bus.emit('combat:vinePactHit', { attacker, defender, bonusDmg, heal });
      damageFighter(attacker, defender, bonusDmg, attacker.facing * 290, -230, { ignoreShield: true, fromPact: true });
    }

    function startSlash(f, enemy) {
      if (f.cooldowns.slash > 0) return;
      if (f.cocoonTimer > 0 || f.vineChannelTimer > 0) return;
      if (['slip', 'hurt', 'ko', 'walkoff', 'blinkDash', 'scarfGrab', 'vineChannel', 'vineStomp'].includes(f.state)) return;

      // 影子：若处于藏进阴影状态，发动攻击立刻显形并判定是否背刺
      f.pendingBackstab = false;
      if (f.stealthTimer > 0) {
        f.stealthTimer = 0;
        f.stealthEnterFlash = 0;
        if (enemy) {
          const isBehindEnemy = (f.x - enemy.x) * enemy.facing < 0;
          f.facing = enemy.x >= f.x ? 1 : -1;
          if (isBehindEnemy) {
            f.pendingBackstab = true;
            f.lastBackstabGlow = 0.34;
          }
        }
      }

      const isGiant = f.giantTimer > 0;
      const atkMult = f.speedBoostTimer > 0 ? (f.stats.ultAtkSpeedMult || 1.65) : 1.0;
      const giantCdMult = isGiant ? (f.stats.giantAtkCdMult || 3.0) : 1.0;
      const baseCd = f.stats.slashCooldown || 0.38;
      f.state = 'slash';
      f.slashAnimDur = isGiant ? 0.46 : Math.max(0.18, Math.min(0.32, 0.28 / Math.sqrt(atkMult)));
      f.stateTimer = f.slashAnimDur;
      f.slashHitDone = false;
      f.cooldowns.slash = (baseCd * giantCdMult) / atkMult;
      f.vx += f.facing * (isGiant ? 65 : (f.speedBoostTimer > 0 ? 135 : 95));
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
      f.cooldowns.banana = f.stats.kCooldown || 1.65;
      arenaState.bananaPeels.push({
        owner: f.id,
        slipDuration: f.stats.slipDuration || 0.85,
        x: f.x + f.facing * f.metrics.bananaOffsetX * f.bodyScale,
        y: f.y - f.metrics.bananaOffsetY * f.bodyScale,
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
      f.cooldowns.orb = f.stats.lCooldown || 1.25;
      const ox = f.x + f.facing * f.metrics.orbOffsetX * f.bodyScale;
      const oy = f.y - Math.max(46, f.metrics.orbOffsetY * f.bodyScale);
      arenaState.energyOrbs.push({
        kind: 'orb',
        owner: f.id,
        damage: f.stats.orbDamage || 12,
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

    // 无敌剑 K 技能：让身体变小（从大到小，体积与受击框同步缩小）
    function startShrink(f) {
      if (f.cooldowns.banana > 0) return;
      if (['slip', 'hurt', 'ko', 'walkoff'].includes(f.state)) return;
      f.shrinkTimer = f.stats.shrinkDuration || 4.5;
      f.cooldowns.banana = f.stats.kCooldown || 7.0;
      bus.emit('combat:shrink', { fighter: f });
    }

    // 无敌剑 L 技能：发射一道光，击中让敌人硬控静止（默认 1.5 秒）
    function startFreezeLight(f) {
      if (f.cooldowns.orb > 0) return;
      if (['slip', 'hurt', 'ko', 'walkoff'].includes(f.state)) return;
      f.state = 'orb';
      f.stateTimer = 0.28;
      f.cooldowns.orb = f.stats.lCooldown || 3.2;
      const ox = f.x + f.facing * f.metrics.orbOffsetX * f.bodyScale;
      const oy = f.y - Math.max(46, f.metrics.orbOffsetY * f.bodyScale);
      arenaState.energyOrbs.push({
        kind: 'freezeLight',
        owner: f.id,
        freezeDuration: f.stats.freezeDuration || 1.5,
        damage: f.stats.freezeDamage || 6,
        x: ox,
        y: oy,
        vx: f.facing * 560,
        vy: 0,
        r: 18,
        life: 1.9,
        rot: 0
      });
      bus.emit('combat:freezeLight', { fighter: f, x: ox, y: oy });
    }

    // 无敌剑大招（; 键）：速度加快（双喷射器点火，移速与攻速显著加快）
    function startSpeedBoost(f) {
      if (f.cooldowns.ult > 0) return;
      if (['slip', 'hurt', 'ko', 'walkoff'].includes(f.state)) return;
      f.speedBoostTimer = f.stats.ultDuration || 5.0;
      f.cooldowns.ult = f.stats.ultCooldown || 9.0;
      bus.emit('combat:speedBoost', { fighter: f });
    }

    // 影子 K 技能：藏进阴影（5 秒隐身、AI 失锁、背后现身双倍背刺）
    function startShadowHide(f) {
      if (f.cooldowns.banana > 0) return;
      if (['slip', 'hurt', 'ko', 'walkoff', 'blinkDash', 'scarfGrab'].includes(f.state)) return;
      f.stealthTimer = f.stats.stealthDuration || 5.0;
      f.stealthEnterFlash = 0.28;
      f.cooldowns.banana = f.stats.kCooldown || 7.5;
      bus.emit('combat:shadowHide', { fighter: f });
    }

    // 影子 L 技能：三段无敌瞬身（×3 别人打不死，每次伤害按上一次递增）
    function startShadowBlink(f) {
      if (['slip', 'hurt', 'ko', 'walkoff', 'scarfGrab'].includes(f.state)) return;
      if (f.state === 'blinkDash') return;

      if (f.blinkCharges <= 0) {
        if (f.cooldowns.orb > 0) return;
        f.blinkCharges = 3;
        f.blinkStep = 0;
      }

      // 显形并消耗 1 段瞬身
      f.stealthTimer = 0;
      f.stealthEnterFlash = 0;
      f.blinkCharges -= 1;
      f.blinkStep += 1;
      f.blinkWindowTimer = f.blinkCharges > 0 ? (f.stats.blinkWindow || 2.6) : 0;
      if (f.blinkCharges === 0) {
        f.cooldowns.orb = f.stats.lCooldown || 6.5;
      }

      // 生成横向灰紫涂抹残影轨迹（还原草图 2 格左图）
      for (let i = 0; i < 4; i++) {
        arenaState.afterimages.push({
          x: f.x + f.facing * (i * 22),
          y: f.y,
          facing: f.facing,
          life: 0.24 + i * 0.04,
          maxLife: 0.36
        });
      }

      f.state = 'blinkDash';
      f.stateTimer = 0.23;
      f.invuln = 0.30; // 全程无敌（别人打不死！）
      f.blinkHitDone = false;
      f.vx = f.facing * 640;
      f.vy = Math.min(f.vy, 0);
      bus.emit('combat:shadowBlink', { fighter: f, step: f.blinkStep, dmgHit: 0 });
    }

    // 影子大招（; 键）：围巾暗影空间（前方 4 身位紫围巾抓取，拉入暗影空间万影穿刺）
    function startShadowDomain(f) {
      if (f.cooldowns.ult > 0) return;
      if (['slip', 'hurt', 'ko', 'walkoff', 'blinkDash', 'scarfGrab'].includes(f.state)) return;
      f.stealthTimer = 0;
      f.stealthEnterFlash = 0;
      f.state = 'scarfGrab';
      f.stateTimer = 0.34;
      f.scarfGrabHit = false;
      f.vx = 0;
      f.cooldowns.ult = f.stats.ultCooldown || 10.5;
      bus.emit('combat:slash', { fighter: f });
    }

    // 藤蔓 K 技能：地底缠绕吸血（手插地面，4身位内抓捕控制4秒、每秒吸血且自身不可攻击）
    function startVineBind(f, enemy) {
      if (f.cooldowns.banana > 0) return;
      if (f.cocoonTimer > 0 || f.giantTimer > 0 || f.vineChannelTimer > 0) return;
      if (['slip', 'hurt', 'ko', 'walkoff', 'vineChannel', 'vineStomp'].includes(f.state)) return;

      f.cooldowns.banana = f.stats.kCooldown || 6.5;
      f.vx = 0;
      const range = f.stats.bindRange || 205;
      const dx = enemy ? (enemy.x - f.x) * f.facing : -1;
      const nearGround = enemy ? (GROUND_Y - enemy.y) < 72 : false;
      const validTarget = enemy && enemy.state !== 'ko' && enemy.invuln <= 0 && enemy.stealthTimer <= 0 && dx >= -16 && dx <= range + enemy.halfW && nearGround;

      if (validTarget) {
        const dur = f.stats.bindDuration || 4.0;
        f.state = 'vineChannel';
        f.vineChannelTimer = dur;
        f.vineBindTargetId = enemy.id;
        f.vineDrainAccum = 0;
        enemy.vineBoundTimer = dur;
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.flying = false;
        enemy.state = 'idle';
        arenaState.groundVines.push({
          id: groundVineSeq++,
          kind: 'bind',
          owner: f.id,
          targetId: enemy.id,
          startX: f.x,
          currentX: enemy.x,
          elapsed: 0,
          life: dur
        });
        bus.emit('combat:vineBind', { attacker: f, victim: enemy });
        if (f.cocoonPactTimer > 0) resolveVinePactBonus(f, enemy);
      } else {
        // 抓空：地底藤蔓向前探出后缩回
        f.state = 'vineChannel';
        f.vineChannelTimer = 0.36;
        f.vineBindTargetId = null;
        const probeX = Math.max(STAGE_LEFT + 12, Math.min(STAGE_RIGHT - 12, f.x + f.facing * range));
        arenaState.groundVines.push({
          id: groundVineSeq++,
          kind: 'bind',
          owner: f.id,
          targetId: null,
          startX: f.x,
          currentX: probeX,
          elapsed: 0,
          life: 0.36
        });
        bus.emit('combat:vineBind', { attacker: f, victim: { x: probeX, y: GROUND_Y, metrics: { calloutOffsetY: 110 } } });
      }
    }

    // 藤蔓 L 技能：跺脚破盾地刺（3身位内仅对举盾敌人有效并直接破盾，对未举盾完全无效）
    function startVinePierce(f, enemy) {
      if (f.cooldowns.orb > 0) return;
      if (f.cocoonTimer > 0 || f.vineChannelTimer > 0) return;
      if (['slip', 'hurt', 'ko', 'walkoff', 'vineChannel', 'vineStomp'].includes(f.state)) return;

      f.state = 'vineStomp';
      f.stateTimer = 0.34;
      f.vx = 0;
      f.cooldowns.orb = f.stats.lCooldown || 3.0;

      const range = f.stats.pierceRange || 155;
      const dx = enemy ? (enemy.x - f.x) * f.facing : -1;
      const inRange = enemy && enemy.state !== 'ko' && enemy.invuln <= 0 && dx >= -12 && dx <= range + enemy.halfW && (GROUND_Y - enemy.y) < 95;
      const tipX = inRange
        ? enemy.x
        : Math.max(STAGE_LEFT + 16, Math.min(STAGE_RIGHT - 16, f.x + f.facing * range));

      const brokeShield = !!(inRange && enemy.state === 'shield');
      arenaState.groundVines.push({
        id: groundVineSeq++,
        kind: 'pierce',
        owner: f.id,
        dir: f.facing,
        startX: f.x,
        tipX,
        brokeShield,
        elapsed: 0,
        life: 0.55
      });

      if (brokeShield) {
        enemy.shieldTime = 0;
        enemy.state = 'hurt';
        enemy.stateTimer = 0.55;
        const dmg = f.stats.pierceDamage || 22;
        bus.emit('combat:vinePierceShield', { attacker: f, defender: enemy, dmg });
        damageFighter(f, enemy, dmg, f.facing * 260, -240, { ignoreShield: true });
      } else {
        // 对未举盾敌人完全无效（严格遵守设定！）
        bus.emit('combat:vinePierceMiss', { fighter: f, x: tipX });
      }
    }

    // 藤蔓大招一（; 键）：藤蔓茧 · 赌命反噬
    function startVineCocoon(f) {
      if (['ko', 'walkoff'].includes(f.state)) return;
      // 若已在 3 秒裹茧中再次按 ; -> 解除茧，触发赌命反噬窗口！
      if (f.cocoonTimer > 0) {
        f.cocoonTimer = 0;
        f.cocoonPactTimer = f.stats.pactDuration || 3.5;
        f.cooldowns.ult = f.stats.ultCooldown || 10.0;
        bus.emit('combat:vinePactStart', { fighter: f });
        return;
      }
      if (f.cooldowns.ult > 0 || f.giantTimer > 0 || f.vineChannelTimer > 0) return;
      if (['slip', 'hurt', 'vineChannel', 'vineStomp'].includes(f.state)) return;

      f.cocoonTimer = f.stats.cocoonDuration || 3.0;
      f.vx = 0;
      f.flying = false;
      f.state = 'idle';
      bus.emit('combat:vineCocoonStart', { fighter: f });
    }

    // 藤蔓大招二（' 键）：巨藤狂化（10秒变大、血极厚、攻极高、移速与攻速极慢）
    function startVineGiant(f) {
      if (f.cooldowns.ult2 > 0) return;
      if (f.cocoonTimer > 0 || f.giantTimer > 0 || f.vineChannelTimer > 0) return;
      if (['slip', 'hurt', 'ko', 'walkoff', 'vineChannel', 'vineStomp'].includes(f.state)) return;

      const bonus = f.stats.giantBonusHp || 100;
      f.giantTimer = f.stats.giantDuration || 10.0;
      f.giantBonusHp = bonus;
      f.maxHp += bonus;
      f.hp += bonus;
      f.cooldowns.ult2 = f.stats.ult2Cooldown || 15.0;
      bus.emit('combat:vineGiantStart', { fighter: f, bonus });
    }

    function useSkillK(f, enemy) {
      const skillId = f.asset.skills && f.asset.skills.k ? f.asset.skills.k.id : 'banana';
      if (skillId === 'shrink') startShrink(f);
      else if (skillId === 'shadowHide') startShadowHide(f);
      else if (skillId === 'vineBind') startVineBind(f, enemy);
      else startBanana(f);
    }

    function useSkillL(f, enemy) {
      const skillId = f.asset.skills && f.asset.skills.l ? f.asset.skills.l.id : 'orb';
      if (skillId === 'freezeLight') startFreezeLight(f);
      else if (skillId === 'shadowBlink') startShadowBlink(f);
      else if (skillId === 'vinePierce') startVinePierce(f, enemy);
      else startOrb(f);
    }

    function useSkillUlt(f) {
      const ult = f.asset.skills && f.asset.skills.ult;
      if (!ult) return;
      if (ult.id === 'speedBoost') startSpeedBoost(f);
      else if (ult.id === 'shadowDomain') startShadowDomain(f);
      else if (ult.id === 'vineCocoon') startVineCocoon(f);
    }

    function useSkillUlt2(f) {
      const ult2 = f.asset.skills && f.asset.skills.ult2;
      if (!ult2) return;
      if (ult2.id === 'vineGiant') startVineGiant(f);
    }

    function triggerKO(winner, loser) {
      arenaState.matchState = 'ko';
      arenaState.winnerId = winner ? winner.id : null;
      arenaState.koTimer = 0;
      arenaState.domainOverlay = null;
      loser.state = 'ko';
      loser.hp = 0;
      loser.stealthTimer = 0;
      loser.cocoonTimer = 0;
      loser.cocoonPactTimer = 0;
      loser.vineBoundTimer = 0;
      releaseVineBind(loser);
      if (winner) {
        releaseVineBind(winner);
        winner.vineBoundTimer = 0;
      }
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

    function damageFighter(attacker, defender, amount, knockX, knockY, opts = {}) {
      if (defender.state === 'ko' || arenaState.matchState === 'ko') return false;
      if (defender.invuln > 0) return 'invuln';

      // 藤蔓大招一：3 秒裹茧受击反而回血！
      if (defender.cocoonTimer > 0) {
        const heal = defender.stats.cocoonHeal || 8;
        defender.hp = Math.min(defender.maxHp, defender.hp + heal);
        bus.emit('combat:vineCocoonHeal', { fighter: defender, heal });
        return 'cocoonHeal';
      }

      if (defender.state === 'shield' && !opts.ignoreShield) {
        const reduced = Math.max(1, Math.round(amount * 0.15));
        defender.hp = Math.max(1, defender.hp - reduced);
        defender.vx += Math.sign(knockX) * 110;
        bus.emit('combat:block', { attacker, defender });
        return 'blocked';
      }

      if (defender.vineChannelTimer > 0) {
        releaseVineBind(defender);
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
        defender.stateTimer = Math.max(defender.stateTimer, 0.24);
      }

      // 藤蔓大招一二段赌命契约：命中对手引爆反噬并回血！
      if (attacker && attacker.cocoonPactTimer > 0 && !opts.fromPact && defender.state !== 'ko') {
        resolveVinePactBonus(attacker, defender);
      }
      return 'hit';
    }

    function triggerSlip(victim, peel) {
      if (victim.state === 'ko' || arenaState.matchState === 'ko') return;
      if (victim.invuln > 0 || victim.cocoonTimer > 0 || victim.stealthTimer > 0) return;
      if (victim.vineChannelTimer > 0) releaseVineBind(victim);
      victim.state = 'slip';
      victim.stateTimer = peel.slipDuration || 0.85;
      victim.slipRot = 0;
      victim.onGround = false;
      victim.flying = false;
      victim.vy = -440;
      victim.vx = (victim.x >= peel.x ? 1 : -1) * 165;
      victim.hp = Math.max(1, victim.hp - 7);
      bus.emit('combat:slip', { victim, peelX: peel.x });
    }

    function triggerFrozen(attacker, victim, duration = 1.5, dmg = 6) {
      if (victim.state === 'ko' || arenaState.matchState === 'ko') return false;
      if (victim.invuln > 0) return 'invuln';
      if (victim.cocoonTimer > 0) {
        const heal = victim.stats.cocoonHeal || 8;
        victim.hp = Math.min(victim.maxHp, victim.hp + heal);
        bus.emit('combat:vineCocoonHeal', { fighter: victim, heal });
        return 'cocoonHeal';
      }
      if (victim.state === 'shield') {
        bus.emit('combat:block', { attacker, defender: victim });
        return 'blocked';
      }
      if (victim.vineChannelTimer > 0) releaseVineBind(victim);
      victim.hp = Math.max(1, victim.hp - dmg);
      victim.frozenTimer = duration;
      victim.vx = 0;
      victim.vy = 0;
      victim.flying = false;
      bus.emit('combat:frozen', { attacker, victim, duration });
      return 'frozen';
    }

    function updateDomainOverlay(dt) {
      const dom = arenaState.domainOverlay;
      if (!dom || !dom.active) return false;
      dom.elapsed += dt;
      const attacker = arenaState.fighters[dom.attackerId];
      const victim = arenaState.fighters[dom.victimId];

      // 4 次万影穿刺伤害结算跳点
      const tickTimes = [0.34, 0.62, 0.88, 1.14];
      while (dom.ticksDone < tickTimes.length && dom.elapsed >= tickTimes[dom.ticksDone]) {
        dom.ticksDone += 1;
        const perTick = Math.round(dom.totalDamage / tickTimes.length);
        if (victim) {
          victim.hp = Math.max(dom.ticksDone === tickTimes.length ? 0 : 1, victim.hp - perTick);
        }
        bus.emit('combat:shadowDomainHit', { attacker, victim, tick: dom.ticksDone });
      }

      if (dom.elapsed >= dom.duration) {
        arenaState.domainOverlay = null;
        if (victim) {
          if (victim.hp <= 0) {
            triggerKO(attacker, victim);
          } else {
            victim.state = 'hurt';
            victim.stateTimer = 0.42;
            victim.vx = (attacker ? attacker.facing : 1) * 280;
            victim.vy = -210;
            victim.onGround = false;
          }
        }
      }
      return true;
    }

    function updateGroundVines(dt) {
      for (let i = arenaState.groundVines.length - 1; i >= 0; i--) {
        const gv = arenaState.groundVines[i];
        gv.elapsed += dt;
        gv.life -= dt;
        if (gv.kind === 'bind' && gv.targetId !== null) {
          const caster = arenaState.fighters[gv.owner];
          const target = arenaState.fighters[gv.targetId];
          if (caster) gv.startX = caster.x;
          if (target) gv.currentX = target.x;
        }
        if (gv.life <= 0) arenaState.groundVines.splice(i, 1);
      }
    }

    function updateFighter(f, enemy, inp, dt) {
      f.cooldowns.slash = Math.max(0, f.cooldowns.slash - dt);
      f.cooldowns.banana = Math.max(0, f.cooldowns.banana - dt);
      f.cooldowns.orb = Math.max(0, f.cooldowns.orb - dt);
      f.cooldowns.ult = Math.max(0, f.cooldowns.ult - dt);
      f.cooldowns.ult2 = Math.max(0, f.cooldowns.ult2 - dt);
      f.invuln = Math.max(0, f.invuln - dt);
      if (f.lastBackstabGlow > 0) f.lastBackstabGlow = Math.max(0, f.lastBackstabGlow - dt);

      // 影子：隐身与三段瞬身连段窗口计时
      if (f.stealthTimer > 0) f.stealthTimer = Math.max(0, f.stealthTimer - dt);
      if (f.stealthEnterFlash > 0) f.stealthEnterFlash = Math.max(0, f.stealthEnterFlash - dt);
      if (f.blinkWindowTimer > 0) {
        f.blinkWindowTimer = Math.max(0, f.blinkWindowTimer - dt);
        if (f.blinkWindowTimer === 0 && f.blinkCharges > 0) {
          f.blinkCharges = 0;
          f.blinkStep = 0;
          f.cooldowns.orb = f.stats.lCooldown || 6.5;
        }
      }

      // 藤蔓：大招二「巨藤狂化」计时与厚血恢复
      if (f.giantTimer > 0) {
        f.giantTimer = Math.max(0, f.giantTimer - dt);
        if (f.giantTimer === 0) {
          f.maxHp = Math.max(1, f.maxHp - f.giantBonusHp);
          f.hp = Math.min(f.hp, f.maxHp);
          f.giantBonusHp = 0;
          bus.emit('combat:vineGiantEnd', { fighter: f });
        }
      }

      // 藤蔓：大招一二段「赌命反噬」倒计时（超时未命中 -> 被藤蔓吸干致死！）
      if (f.cocoonPactTimer > 0) {
        f.cocoonPactTimer = Math.max(0, f.cocoonPactTimer - dt);
        if (f.cocoonPactTimer === 0 && f.state !== 'ko' && arenaState.matchState === 'fighting') {
          bus.emit('combat:vineDrainDeath', { fighter: f });
          triggerKO(enemy, f);
          return;
        }
      }

      // 身体变小（无敌剑 K）、巨藤狂化（藤蔓 '）与加速大招计时及实时体积更新
      if (f.shrinkTimer > 0) f.shrinkTimer = Math.max(0, f.shrinkTimer - dt);
      if (f.speedBoostTimer > 0) f.speedBoostTimer = Math.max(0, f.speedBoostTimer - dt);

      const targetBodyScale = f.shrinkTimer > 0
        ? (f.stats.shrinkScale || 0.48)
        : f.giantTimer > 0
          ? (f.stats.giantScale || 2.25)
          : 1.0;
      f.bodyScale += (targetBodyScale - f.bodyScale) * Math.min(1, dt * 10);
      f.height = f.metrics.height * f.bodyScale;
      f.halfW = f.metrics.halfW * f.bodyScale;

      // 被定身光击中 或 被藤蔓地底缠绕捆住：原地静止
      if (f.frozenTimer > 0) {
        f.frozenTimer = Math.max(0, f.frozenTimer - dt);
        f.vx = 0;
        f.vy = 0;
        return;
      }
      if (f.vineBoundTimer > 0) {
        f.vineBoundTimer = Math.max(0, f.vineBoundTimer - dt);
        f.vx = 0;
        f.vy = 0;
        f.y = Math.min(GROUND_Y, f.y + 420 * dt);
        return;
      }

      // 藤蔓大招一：3 秒裹茧中（只接受再按 ; 触发二段赌命）
      if (f.cocoonTimer > 0) {
        f.cocoonTimer = Math.max(0, f.cocoonTimer - dt);
        f.vx = 0;
        if (inp.ult) {
          startVineCocoon(f);
          return;
        }
        if (f.cocoonTimer === 0) {
          f.cooldowns.ult = f.stats.ultCooldown || 10.0;
        }
        return;
      }

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

      // 藤蔓一技能引导中：自身锁定不可攻击，每秒吸取敌人百分比血量
      if (f.state === 'vineChannel') {
        f.vineChannelTimer -= dt;
        f.vx = 0;
        if (f.vineBindTargetId !== null && enemy && enemy.id === f.vineBindTargetId) {
          f.facing = enemy.x >= f.x ? 1 : -1;
          f.vineDrainAccum += dt;
          if (f.vineDrainAccum >= 1.0) {
            f.vineDrainAccum -= 1.0;
            const pct = (f.stats.drainPctPerSec || 3) / 100;
            const drain = Math.max(1, Math.round(enemy.maxHp * pct));
            enemy.hp = Math.max(0, enemy.hp - drain);
            f.hp = Math.min(f.maxHp, f.hp + drain);
            bus.emit('combat:vineDrainTick', { attacker: f, victim: enemy, amount: drain });
            if (enemy.hp <= 0) {
              triggerKO(f, enemy);
              return;
            }
          }
        }
        if (f.vineChannelTimer <= 0) {
          releaseVineBind(f);
          f.state = f.onGround ? 'idle' : 'jump';
        }
        return;
      }

      if (['slash', 'throw', 'orb', 'hurt', 'slip', 'blinkDash', 'scarfGrab', 'vineStomp'].includes(f.state)) {
        f.stateTimer -= dt;
        if (f.state === 'slip') {
          f.slipRot += dt * 11 * (f.vx >= 0 ? 1 : -1);
        }
        if (f.state === 'slash' && !f.slashHitDone && f.stateTimer < f.slashAnimDur * 0.76 && f.stateTimer > 0.05) {
          const reachX = f.x + f.facing * (f.metrics.slashReach * f.bodyScale);
          const hitW = f.metrics.slashRangeX * f.bodyScale + enemy.halfW * 0.6;
          const slashBottom = f.y + 8;
          const slashTop = f.y - f.metrics.slashRangeY * f.bodyScale * 1.45;
          const overlapY = enemy.y >= slashTop && (enemy.y - enemy.height) <= slashBottom;
          if (Math.abs(enemy.x - reachX) < hitW && overlapY) {
            f.slashHitDone = true;
            let dmg = f.giantTimer > 0 ? (f.stats.giantSlashDamage || 34) : (f.stats.slashDamage || 14);
            if (f.pendingBackstab) {
              const mult = f.stats.backstabMult || 2.0;
              dmg = Math.round(dmg * mult);
              f.pendingBackstab = false;
              bus.emit('combat:shadowBackstab', { attacker: f, defender: enemy, mult });
            }
            const kx = f.facing * (f.giantTimer > 0 ? 330 : 240);
            const ky = f.giantTimer > 0 ? -240 : -175;
            damageFighter(f, enemy, dmg, kx, ky);
          }
        }
        // 影子二技能：三段瞬身冲刺命中判定（每段伤害按上一次递增！）
        if (f.state === 'blinkDash' && !f.blinkHitDone) {
          const overlapX = Math.abs(enemy.x - f.x) < (f.halfW + enemy.halfW + 34);
          const overlapY = enemy.y >= f.y - f.height - 12 && (enemy.y - enemy.height) <= f.y + 12;
          if (overlapX && overlapY && enemy.state !== 'ko') {
            f.blinkHitDone = true;
            const base = f.stats.blinkBaseDamage || 6;
            const mult = f.stats.blinkScaleMult || 2.0;
            const dmg = Math.round(base * Math.pow(mult, Math.max(0, f.blinkStep - 1)));
            const res = damageFighter(f, enemy, dmg, f.facing * 200, -145);
            if (res === 'hit') {
              bus.emit('combat:shadowBlink', { fighter: f, step: f.blinkStep, dmgHit: dmg });
            }
          }
        }
        // 影子大招：围巾弹射 4 身位抓取判定
        if (f.state === 'scarfGrab' && !f.scarfGrabHit && f.stateTimer < 0.28 && f.stateTimer > 0.08) {
          const range = f.stats.domainRange || 205;
          const dx = (enemy.x - f.x) * f.facing;
          const overlapY = enemy.y >= f.y - f.height - 20 && (enemy.y - enemy.height) <= f.y + 14;
          if (dx >= -10 && dx <= range + enemy.halfW && overlapY && enemy.invuln <= 0 && enemy.state !== 'ko') {
            f.scarfGrabHit = true;
            if (enemy.vineChannelTimer > 0) releaseVineBind(enemy);
            enemy.cocoonTimer = 0;
            arenaState.domainOverlay = {
              active: true,
              attackerId: f.id,
              victimId: enemy.id,
              elapsed: 0,
              duration: 1.45,
              targetX: W * 0.5,
              targetY: GROUND_Y - 120,
              ticksDone: 0,
              totalDamage: f.stats.domainDamage || 36
            };
            bus.emit('combat:shadowDomainGrab', { attacker: f, victim: enemy });
            f.state = 'idle';
            f.stateTimer = 0;
            return;
          }
        }

        if (f.stateTimer <= 0) {
          f.state = f.onGround ? 'idle' : 'jump';
          f.slipRot = 0;
          f.pendingBackstab = false;
        }
      }

      const locked = ['slash', 'throw', 'orb', 'hurt', 'slip', 'blinkDash', 'scarfGrab', 'vineStomp'].includes(f.state);
      if (!locked) {
        if (inp.ult) {
          useSkillUlt(f);
        } else if (inp.ult2) {
          useSkillUlt2(f);
        }
        if (inp.sword) {
          startSlash(f, enemy);
        } else if (inp.banana) {
          useSkillK(f, enemy);
        } else if (inp.orb) {
          useSkillL(f, enemy);
        } else if (inp.down && f.stealthTimer <= 0) {
          f.state = 'shield';
          f.shieldTime += dt;
          f.vx *= Math.pow(0.01, dt);
          f.flying = false;
        } else {
          f.shieldTime = 0;
          const baseSpd = f.stats.moveSpeed || 255;
          const boostMult = f.speedBoostTimer > 0 ? (f.stats.ultSpeedMult || 2.15) : 1.0;
          const shrinkAgility = f.shrinkTimer > 0 ? 1.18 : 1.0;
          const giantSlow = f.giantTimer > 0 ? (f.stats.giantSpeedMult || 0.45) : 1.0;
          const stealthBonus = f.stealthTimer > 0 ? 1.12 : 1.0;
          const moveSpeed = baseSpd * boostMult * shrinkAgility * giantSlow * stealthBonus * (f.flying ? 1.08 : 1.0);
          let moveDir = 0;
          if (inp.left) moveDir -= 1;
          if (inp.right) moveDir += 1;
          if (moveDir !== 0) {
            f.facing = moveDir;
            f.vx = moveDir * moveSpeed;
            if (f.onGround) {
              f.state = 'run';
              f.walkPhase += dt * (12 * boostMult * giantSlow);
            }
          } else {
            f.vx *= Math.pow(0.001, dt);
            if (Math.abs(f.vx) < 8) f.vx = 0;
            if (f.onGround) f.state = 'idle';
          }

          if (inp.upPressed && f.onGround) {
            f.vy = f.giantTimer > 0 ? -420 : -510;
            f.onGround = false;
            f.state = 'jump';
            bus.emit('combat:jump', { fighter: f });
          } else if (inp.up && !f.onGround && f.flyEnergy > 2 && f.stealthTimer <= 0) {
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
      if (locked && f.state !== 'blinkDash') f.vx *= Math.pow(0.25, dt);

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
          if (target && target.state !== 'slip' && target.state !== 'ko' && target.invuln <= 0 && target.stealthTimer <= 0) {
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
            color: '#1e1c1a',
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
        if (target && target.invuln <= 0 && target.stealthTimer <= 0 && Math.abs(target.x - o.x) < hitHalfX && inBodyY) {
          if (target.state === 'shield' && target.shieldTime < 0.24) {
            o.owner = target.id;
            o.vx = -o.vx * 1.15;
            o.life = 2.0;
            bus.emit('combat:parry', { defender: target, x: o.x, y: o.y });
          } else if (o.kind === 'freezeLight') {
            triggerFrozen(attacker, target, o.freezeDuration || 1.5, o.damage || 6);
            orbs.splice(i, 1);
          } else {
            damageFighter(attacker, target, o.damage || 12, Math.sign(o.vx) * 200, -135);
            orbs.splice(i, 1);
          }
        }
      }
    }

    function separateFighters() {
      if (arenaState.matchState !== 'fighting' || arenaState.fighters.length < 2) return;
      const f0 = arenaState.fighters[0];
      const f1 = arenaState.fighters[1];
      // 影子隐身或三段瞬身时允许穿身绕背！
      if (f0.stealthTimer > 0 || f1.stealthTimer > 0 || f0.state === 'blinkDash' || f1.state === 'blinkDash') return;
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

    return {
      startSlash, startBanana, startOrb, triggerSlip,
      updateDomainOverlay, updateGroundVines, updateFighter, updateProjectiles, separateFighters
    };
  })();

  // =========================================================
  // 6. AISystem（自适应角色体积、隐身失锁与新角色招式策略）
  // =========================================================
  const AISystem = (() => {
    function compute(f, enemy, dt) {
      const inp = { left: false, right: false, up: false, upPressed: false, down: false, sword: false, banana: false, orb: false, ult: false, ult2: false };
      if (arenaState.matchState !== 'fighting') return inp;

      // 对手藏进阴影：人机彻底失去实时坐标追踪，只能按最后已知位置试探/戒备！
      if (enemy.stealthTimer > 0) {
        f.aiTimer -= dt;
        if (f.aiTimer <= 0) {
          f.aiTimer = 0.45 + Math.random() * 0.35;
          const r = Math.random();
          if (r < 0.35) f.aiIntent = 'search_wander';
          else if (r < 0.65) f.aiIntent = 'shield';
          else f.aiIntent = 'probe_swing';
          f.aiWanderDir = Math.random() < 0.5 ? -1 : 1;
        }
        if (f.aiIntent === 'shield') {
          inp.down = true;
        } else if (f.aiIntent === 'search_wander') {
          const toLast = f.aiLastKnownX - f.x;
          const dir = Math.abs(toLast) > 45 ? Math.sign(toLast) : f.aiWanderDir;
          if (dir < 0) inp.left = true; else inp.right = true;
        } else if (f.aiIntent === 'probe_swing') {
          if (Math.random() < 0.08) inp.sword = true;
        }
        return inp;
      }

      f.aiLastKnownX = enemy.x;
      const dx = enemy.x - f.x;
      const dist = Math.abs(dx);
      const dir = dx >= 0 ? 1 : -1;
      const meleeDist = f.metrics.slashReach * f.bodyScale + enemy.halfW + 18;

      // 影子 AI 专属策略：隐身绕背、三段瞬身连段、4 身位围巾大招
      if (f.role === 'shadow') {
        if (f.stealthTimer > 0) {
          // 隐身期间主动绕到敌人身后发动背刺！
          const behindX = enemy.x - enemy.facing * 42;
          const toBehind = behindX - f.x;
          if (Math.abs(toBehind) > 22) {
            if (toBehind < 0) inp.left = true; else inp.right = true;
          } else {
            f.facing = enemy.x >= f.x ? 1 : -1;
            inp.sword = true;
          }
          return inp;
        }
        if (f.blinkCharges > 0 && dist < 190 && Math.random() < 0.25) {
          f.facing = dir;
          inp.orb = true;
          return inp;
        }
        if (f.cooldowns.ult <= 0 && dist < (f.stats.domainRange || 205) - 10 && Math.random() < 0.09) {
          f.facing = dir;
          inp.ult = true;
          return inp;
        }
        if (f.cooldowns.banana <= 0 && dist > 110 && Math.random() < 0.03) {
          inp.banana = true;
          return inp;
        }
      }

      // 藤蔓 AI 专属策略：对面举盾立刻 L 破盾、4 身位抓捕吸血、残血开茧/狂化巨藤
      if (f.role === 'vine') {
        if (enemy.state === 'shield' && f.cooldowns.orb <= 0 && dist < (f.stats.pierceRange || 155) + 12) {
          f.facing = dir;
          inp.orb = true;
          return inp;
        }
        if (f.cocoonTimer > 0 && f.cocoonTimer < 1.2 && dist < 110 && Math.random() < 0.08) {
          inp.ult = true; // 近身时偶发二段赌命反噬
          return inp;
        }
        if (f.cooldowns.ult2 <= 0 && f.giantTimer <= 0 && f.hp < f.maxHp * 0.75 && Math.random() < 0.025) {
          inp.ult2 = true;
          return inp;
        }
        if (f.cooldowns.ult <= 0 && f.giantTimer <= 0 && f.hp < f.maxHp * 0.55 && dist < 140 && Math.random() < 0.03) {
          inp.ult = true;
          return inp;
        }
        if (f.cooldowns.banana <= 0 && f.giantTimer <= 0 && dist < (f.stats.bindRange || 205) && dist > 65 && Math.random() < 0.04) {
          f.facing = dir;
          inp.banana = true;
          return inp;
        }
      }

      // 无敌剑大招触发
      if (f.role === 'trieye' && f.cooldowns.ult <= 0 && dist > 110 && Math.random() < 0.04) {
        inp.ult = true;
      }

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
          if (enemy.state === 'slash' && r < 0.45) f.aiIntent = 'shield';
          else if (r < 0.68) f.aiIntent = 'slash';
          else if (r < 0.86) f.aiIntent = 'retreat';
          else f.aiIntent = 'fly_attack';
        } else if (dist < 290) {
          if (r < 0.40) f.aiIntent = 'approach';
          else if (r < 0.64 && f.role !== 'vine') f.aiIntent = 'banana';
          else if (r < 0.84 && f.role !== 'vine') f.aiIntent = 'orb';
          else f.aiIntent = 'approach';
        } else {
          if (r < 0.52) f.aiIntent = 'approach';
          else if (r < 0.78 && f.role !== 'vine' && f.role !== 'shadow') f.aiIntent = 'orb';
          else f.aiIntent = 'fly_attack';
        }
      }

      switch (f.aiIntent) {
        case 'approach':
          if (dir < 0) inp.left = true; else inp.right = true;
          if (dist < meleeDist && Math.random() < 0.18) inp.sword = true;
          break;
        case 'retreat':
          if (dir < 0) inp.right = true; else inp.left = true;
          if (f.cooldowns.banana <= 0 && f.role !== 'vine' && Math.random() < 0.10) inp.banana = true;
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
          if (f.flyEnergy > 25 && f.giantTimer <= 0) {
            inp.up = true;
            if (f.onGround) inp.upPressed = true;
          }
          if (dir < 0) inp.left = true; else inp.right = true;
          if (dist < meleeDist + 18 && Math.random() < 0.14) inp.sword = true;
          else if (dist > 160 && f.cooldowns.orb <= 0 && f.role !== 'vine' && Math.random() < 0.08) inp.orb = true;
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
    },
    openSettings(tabRoleId) {
      systemState.settingsOpen = true;
      if (tabRoleId) systemState.settingsTab = tabRoleId;
      else if (Assets.get(systemState.selectedRoles[0])) systemState.settingsTab = systemState.selectedRoles[0];
      bus.emit('system:settingsChanged', { open: true, tab: systemState.settingsTab });
    },
    closeSettings() {
      systemState.settingsOpen = false;
      bus.emit('system:settingsChanged', { open: false, tab: systemState.settingsTab });
    },
    setSettingsTab(roleId) {
      systemState.settingsTab = Assets.get(roleId).id;
      bus.emit('system:settingsChanged', { open: systemState.settingsOpen, tab: systemState.settingsTab });
    },
    setCharParam(roleId, key, val) {
      const id = Assets.get(roleId).id;
      if (!systemState.tuning[id]) systemState.tuning[id] = {};
      systemState.tuning[id][key] = val;
      saveTuning(systemState.tuning);
      // 同步刷新场上对应角色的实时参数（maxHp 同步等比或更新上限）
      arenaState.fighters.forEach((f) => {
        if (f.role === id) {
          const oldMax = f.maxHp;
          f.stats = getEffectiveStats(id);
          if (key === 'maxHp') {
            const ratio = oldMax > 0 ? f.hp / oldMax : 1;
            f.maxHp = f.stats.maxHp;
            f.hp = Math.max(1, Math.round(f.maxHp * ratio));
          }
        }
      });
      bus.emit('system:configChanged', { roleId: id, key, val });
    },
    resetCharParams(roleId) {
      const id = Assets.get(roleId).id;
      delete systemState.tuning[id];
      saveTuning(systemState.tuning);
      arenaState.fighters.forEach((f) => {
        if (f.role === id) {
          f.stats = getEffectiveStats(id);
          f.maxHp = f.stats.maxHp;
          f.hp = Math.min(f.hp, f.maxHp);
        }
      });
      bus.emit('system:configChanged', { roleId: id, reset: true });
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
      if (o.kind === 'freezeLight') {
        S.drawFreezeLight(ctx, o, s);
        return;
      }
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

        ctx.font = 'bold 12px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = '#4e4942';
        ctx.textAlign = isLeft ? 'right' : 'left';
        ctx.fillText(`${Math.ceil(f.hp)}/${f.maxHp}`, isLeft ? bx + barW : bx, topY - 6);

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

        // 实时状态小标签（变小 / 加速 / 隐身 / 瞬身 / 巨藤 / 赌命 / 大招冷却）
        const tags = [];
        if (f.shrinkTimer > 0) tags.push(`变小 ${f.shrinkTimer.toFixed(1)}s`);
        if (f.speedBoostTimer > 0) tags.push(`加速 ${f.speedBoostTimer.toFixed(1)}s`);
        if (f.stealthTimer > 0 && (systemState.gameMode === '1p' && f.id === 0)) tags.push(`阴影 ${f.stealthTimer.toFixed(1)}s`);
        if (f.blinkCharges > 0) tags.push(`瞬身剩${f.blinkCharges}段`);
        if (f.cocoonTimer > 0) tags.push(`裹茧 ${f.cocoonTimer.toFixed(1)}s`);
        if (f.cocoonPactTimer > 0) tags.push(`赌命 ${f.cocoonPactTimer.toFixed(1)}s!`);
        if (f.giantTimer > 0) tags.push(`巨藤 ${f.giantTimer.toFixed(1)}s`);
        if (f.asset.skills && f.asset.skills.ult && f.speedBoostTimer <= 0 && f.cocoonTimer <= 0) {
          const u1 = f.asset.skills.ult.label;
          tags.push(f.cooldowns.ult > 0 ? `${u1} ${f.cooldowns.ult.toFixed(1)}s` : `${u1}(;)就绪`);
        }
        if (f.asset.skills && f.asset.skills.ult2 && f.giantTimer <= 0) {
          const u2 = f.asset.skills.ult2.label;
          tags.push(f.cooldowns.ult2 > 0 ? `${u2} ${f.cooldowns.ult2.toFixed(1)}s` : `${u2}(')就绪`);
        }
        if (tags.length > 0) {
          ctx.font = 'bold 11.5px "PingFang SC", sans-serif';
          ctx.fillStyle = (f.speedBoostTimer > 0 || f.cocoonPactTimer > 0) ? '#c94a38' : (f.giantTimer > 0 ? '#2c7a36' : '#2e6b8a');
          ctx.textAlign = isLeft ? 'left' : 'right';
          ctx.fillText(tags.join(' · '), isLeft ? bx : bx + barW, fy + 23);
        }
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

      // 影子二技能：横向灰紫高速残影轨迹（草图 2 格左图）
      arenaState.afterimages.forEach((a, idx) => {
        const alpha = Math.max(0, a.life / a.maxLife) * 0.55;
        ctx.save();
        ctx.globalAlpha = alpha;
        const s = S.boilSeed(2100 + idx * 19, arenaState.time);
        for (let k = 0; k < 5; k++) {
          const yy = a.y - 22 - k * 14;
          S.sketchLine(ctx, a.x - a.facing * 52, yy, a.x + a.facing * 24, yy + 2, 3.0, k % 2 === 0 ? '#55505e' : '#7b4ca8', s + k, 1.8);
        }
        ctx.restore();
      });

      // 藤蔓一/二技能：地底藤蔓蔓延抓捕与破盾地刺
      arenaState.groundVines.forEach((gv) => {
        S.drawGroundVineEffect(ctx, gv, GROUND_Y, arenaState.time);
      });

      const env = {
        time: arenaState.time,
        groundY: GROUND_Y,
        gameMode: systemState.gameMode,
        storyActive: arenaState.story.active
      };
      // Draw taller characters behind smaller ones when close so small stickman stays clearly readable
      const drawOrder = arenaState.fighters.slice().sort((a, b) => b.height - a.height);
      drawOrder.forEach((f) => {
        f.asset.draw(ctx, f, env);
        S.drawFrozenOverlay(ctx, f, arenaState.time);
        S.drawVineBoundOverlay(ctx, f, arenaState.time);
      });

      arenaState.energyOrbs.forEach(drawEnergyOrb);

      // 影子大招：暗影空间全屏覆盖与四面八方紫影穿刺演出！
      if (arenaState.domainOverlay && arenaState.domainOverlay.active) {
        const dom = arenaState.domainOverlay;
        S.drawShadowDomain(ctx, dom, W, H, arenaState.time);
        // 在暗影空间正中心绘制被困住的对手剪影
        const victim = arenaState.fighters[dom.victimId];
        if (victim) {
          ctx.save();
          const savedX = victim.x, savedY = victim.y, savedState = victim.state;
          victim.x = dom.targetX + (Math.random() - 0.5) * 6;
          victim.y = dom.targetY + victim.height * 0.45 + (Math.random() - 0.5) * 5;
          victim.state = 'hurt';
          victim.asset.draw(ctx, victim, env);
          victim.x = savedX; victim.y = savedY; victim.state = savedState;
          ctx.restore();
        }
      }

      arenaState.particles.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        const col = p.color || '#1e1c1a';
        if (p.style === 'diamond') S.drawDiamond(ctx, p.x, p.y, p.size, col, '#fffdf5');
        else {
          ctx.fillStyle = col;
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
    const btnSettings = document.getElementById('btnSettings');
    const btnSound = document.getElementById('btnSound');
    const btnRestart = document.getElementById('btnRestart');
    const p2Guide = document.getElementById('p2Guide');
    const p1SkillsHint = document.getElementById('p1SkillsHint');
    const padSword = document.getElementById('padSword');
    const padSkillK = document.getElementById('padSkillK');
    const padSkillL = document.getElementById('padSkillL');
    const padSkillUlt = document.getElementById('padSkillUlt');
    const padSkillUlt2 = document.getElementById('padSkillUlt2');
    const gamepadPill = document.getElementById('gamepadPill');
    const storyCaption = document.getElementById('storyCaption');

    const settingsBackdrop = document.getElementById('settingsBackdrop');
    const settingsTabs = document.getElementById('settingsTabs');
    const settingsBody = document.getElementById('settingsBody');
    const btnCloseSettings = document.getElementById('btnCloseSettings');
    const btnResetRoleParams = document.getElementById('btnResetRoleParams');
    const btnApplyRestart = document.getElementById('btnApplyRestart');

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

    function renderSettingsModal() {
      settingsBackdrop.classList.toggle('open', systemState.settingsOpen);
      if (!systemState.settingsOpen) return;

      const chars = Assets.list();
      settingsTabs.innerHTML = '';
      chars.forEach((c) => {
        const b = document.createElement('button');
        b.className = 'sketch-btn' + (c.id === systemState.settingsTab ? ' active' : '');
        b.textContent = c.name;
        b.addEventListener('click', () => Commands.setSettingsTab(c.id));
        settingsTabs.appendChild(b);
      });

      const activeAsset = Assets.get(systemState.settingsTab);
      const stats = getEffectiveStats(activeAsset.id);
      settingsBody.innerHTML = '';
      (activeAsset.tunables || []).forEach((item) => {
        const row = document.createElement('div');
        row.className = 'param-row';
        const val = stats[item.key];
        const fmt = (v) => (Number.isInteger(item.step) ? String(Math.round(v)) : Number(v).toFixed(2).replace(/0$/, '')) + (item.unit || '');

        const top = document.createElement('div');
        top.className = 'param-row-top';
        const lbl = document.createElement('span');
        lbl.textContent = item.label;
        const valSpan = document.createElement('span');
        valSpan.className = 'param-val';
        valSpan.textContent = fmt(val);
        top.appendChild(lbl);
        top.appendChild(valSpan);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = String(item.min);
        slider.max = String(item.max);
        slider.step = String(item.step);
        slider.value = String(val);
        slider.addEventListener('input', () => {
          const nv = parseFloat(slider.value);
          valSpan.textContent = fmt(nv);
          Commands.setCharParam(activeAsset.id, item.key, nv);
        });

        row.appendChild(top);
        row.appendChild(slider);
        settingsBody.appendChild(row);
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

      // 根据 1P 所选角色资产，自动同步技能按钮与键位提示（UI 不存真值）
      const p1Asset = Assets.get(systemState.selectedRoles[0]);
      const sk = p1Asset.skills;
      if (padSword) padSword.textContent = `${sk.j.icon} ${sk.j.label}`;
      if (padSkillK) padSkillK.textContent = `${sk.k.icon} ${sk.k.label}`;
      if (padSkillL) padSkillL.textContent = `${sk.l.icon} ${sk.l.label}`;
      if (padSkillUlt) {
        if (sk.ult) {
          padSkillUlt.style.display = '';
          padSkillUlt.textContent = `${sk.ult.icon} ${sk.ult.label}(;)`;
        } else {
          padSkillUlt.style.display = 'none';
        }
      }
      if (padSkillUlt2) {
        if (sk.ult2) {
          padSkillUlt2.style.display = '';
          padSkillUlt2.textContent = `${sk.ult2.icon} ${sk.ult2.label}(')`;
        } else {
          padSkillUlt2.style.display = 'none';
        }
      }
      if (p1SkillsHint) {
        const ultHint = sk.ult ? ` · <kbd>;</kbd> ${sk.ult.label}` : '';
        const ult2Hint = sk.ult2 ? ` · <kbd>'</kbd> ${sk.ult2.label}` : '';
        p1SkillsHint.innerHTML = `<kbd>J</kbd> ${sk.j.label} · <kbd>K</kbd> ${sk.k.label} · <kbd>L</kbd> ${sk.l.label}${ultHint}${ult2Hint}`;
      }
    }

    bus.on('system:modeChanged', syncAll);
    bus.on('system:difficultyChanged', syncAll);
    bus.on('system:rosterChanged', syncAll);
    bus.on('system:timeModeChanged', syncAll);
    bus.on('system:soundChanged', syncAll);
    bus.on('system:settingsChanged', renderSettingsModal);
    bus.on('system:configChanged', ({ reset }) => {
      if (reset) renderSettingsModal();
    });

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

      btnMode1P.addEventListener('click', () => { btnMode1P.blur(); AudioSystem.ensure(); Commands.setGameMode('1p'); });
      btnMode2P.addEventListener('click', () => { btnMode2P.blur(); AudioSystem.ensure(); Commands.setGameMode('2p'); });
      btnDiff.addEventListener('click', () => { btnDiff.blur(); AudioSystem.ensure(); Commands.cycleDifficulty(); });
      selP1.addEventListener('change', () => { selP1.blur(); AudioSystem.ensure(); Commands.setRole(0, selP1.value); });
      selP2.addEventListener('change', () => { selP2.blur(); AudioSystem.ensure(); Commands.setRole(1, selP2.value); });
      btnTime.addEventListener('click', () => { btnTime.blur(); AudioSystem.ensure(); Commands.cycleTimeMode(); });
      btnStory.addEventListener('click', () => { btnStory.blur(); AudioSystem.ensure(); Commands.toggleStory(); });
      btnSettings.addEventListener('click', () => { btnSettings.blur(); AudioSystem.ensure(); Commands.openSettings(); });
      btnCloseSettings.addEventListener('click', () => Commands.closeSettings());
      settingsBackdrop.addEventListener('click', (e) => {
        if (e.target === settingsBackdrop) Commands.closeSettings();
      });
      btnResetRoleParams.addEventListener('click', () => Commands.resetCharParams(systemState.settingsTab));
      btnApplyRestart.addEventListener('click', () => {
        Commands.closeSettings();
        Commands.resetMatch();
      });
      btnSound.addEventListener('click', () => { btnSound.blur(); Commands.toggleSound(); });
      btnRestart.addEventListener('click', () => {
        btnRestart.blur();
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

    InputSystem.pollGamepads();

    if (!systemState.settingsOpen) {
      arenaState.time += dt;

      const targetNight = isCurrentlyNight() ? 1 : 0;
      arenaState.skyNightFactor += (targetNight - arenaState.skyNightFactor) * Math.min(1, dt * 3.5);
      if (arenaState.shakeTime > 0) arenaState.shakeTime = Math.max(0, arenaState.shakeTime - dt);

      if (arenaState.hitstop > 0) {
        arenaState.hitstop = Math.max(0, arenaState.hitstop - dt);
      } else if (arenaState.story.active) {
        StorySystem.update(dt);
      } else if (CombatSystem.updateDomainOverlay(dt)) {
        VfxSystem.update(dt);
      } else {
        if (arenaState.matchState === 'ko') arenaState.koTimer += dt;
        const inp0 = InputSystem.readPlayer(0);
        const inp1 = systemState.gameMode === '2p'
          ? InputSystem.readPlayer(1)
          : AISystem.compute(arenaState.fighters[1], arenaState.fighters[0], dt);

        CombatSystem.updateFighter(arenaState.fighters[0], arenaState.fighters[1], inp0, dt);
        CombatSystem.updateFighter(arenaState.fighters[1], arenaState.fighters[0], inp1, dt);
        CombatSystem.separateFighters();
        CombatSystem.updateGroundVines(dt);
        CombatSystem.updateProjectiles(dt);
        VfxSystem.update(dt);
      }
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
