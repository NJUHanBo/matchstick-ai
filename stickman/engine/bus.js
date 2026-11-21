/**
 * engine/bus.js — 轻量广播总线（EventBus）
 *
 * 遵循 game-architecture-reference.md：
 * 实体与战斗系统只发广播，不直接操作 UI / 音效 / 震动 / 特效。
 *
 * 核心事件：
 * - combat:slash, combat:hit, combat:block, combat:parry, combat:slip
 * - combat:bananaThrow, combat:orbCast, combat:orbClash, combat:jump, combat:fly
 * - match:reset, match:ko
 * - system:modeChanged, system:rosterChanged, system:difficultyChanged
 * - system:timeModeChanged, system:soundChanged, system:gamepadChanged
 * - story:start, story:stop, story:panelChanged
 */
(function (global) {
  'use strict';

  const PaperArena = (global.PaperArena = global.PaperArena || {});

  function createEventBus() {
    const listeners = new Map();

    return {
      on(event, fn) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(fn);
        return () => this.off(event, fn);
      },

      off(event, fn) {
        const set = listeners.get(event);
        if (set) set.delete(fn);
      },

      emit(event, payload) {
        const set = listeners.get(event);
        if (!set) return;
        set.forEach((fn) => {
          try {
            fn(payload);
          } catch (err) {
            console.error('[EventBus]', event, err);
          }
        });
      }
    };
  }

  PaperArena.createEventBus = createEventBus;
})(window);
