// 游戏引擎 — 资源计算、奖励、黑狗连击、抑郁里程碑

const GameEngine = {

    // ========== 体力消耗 ==========
    // 8小时工作 = 100体力耗尽
    calcEnergyConsumption(durationMinutes) {
        return Math.round((durationMinutes / 480) * 100);
    },

    // ========== 精力消耗 ==========
    // 高兴趣: 恢复20精力, 中: 消耗20, 低: 消耗40
    calcSpiritCost(interest) {
        const map = { high: -20, medium: 20, low: 40 };
        return map[interest] || 20;
    },

    // ========== 木屑奖励 ==========
    calcSawdustReward(rating, durationMinutes, actualMinutes) {
        const base = 10;
        const ratingMultiplier = rating / 5;
        const timeEfficiency = Math.min(actualMinutes / durationMinutes, 1.5);
        return Math.round(base * ratingMultiplier * timeEfficiency);
    },

    // ========== 火苗奖励 ==========
    calcFlameReward(sawdustReward, state) {
        if (state.vacation.isOnVacation) return 0;
        const baseFlame = sawdustReward / 2;
        const sawdustMultiplier = 1 + (state.stats.sawdust - 100) / 1000;
        let flame = baseFlame * Math.max(sawdustMultiplier, 0.1);
        if (state.shop.activeEffects.mirror) flame *= 2;
        if (state.shop.activeEffects.oxygenChamber) flame *= 2;
        return Math.round(flame);
    },

    // ========== 黑狗征服者 ==========
    isBlackDogTask(task) {
        return task.importance === 'high' && task.interest === 'low';
    },

    getComboBonus(state) {
        const combo = state.blackDogCombo || 0;
        return Math.min(combo * 0.25, 0.75); // 最高75%
    },

    updateCombo(state, isBlackDogTask) {
        if (isBlackDogTask) {
            state.blackDogCombo = (state.blackDogCombo || 0) + 1;
            state.blackDogTotalCompleted = (state.blackDogTotalCompleted || 0) + 1;
        } else {
            state.blackDogCombo = 0;
        }
    },

    // ========== 完整的任务完成流程 ==========
    completeTask(state, task, rating, actualMinutes) {
        const durationMinutes = task.duration || 30;

        // 体力检查
        const energyCost = this.calcEnergyConsumption(durationMinutes);
        const spiritCost = this.calcSpiritCost(task.interest || 'medium');

        if (state.stats.energy < energyCost) {
            return { success: false, reason: '体力不足' };
        }
        if (state.stats.spirit < spiritCost && spiritCost > 0) {
            return { success: false, reason: '精力不足' };
        }

        // 扣除消耗
        state.stats.energy = Math.max(0, state.stats.energy - energyCost);
        state.stats.spirit = Math.max(0, state.stats.spirit - spiritCost);
        if (spiritCost < 0) {
            state.stats.spirit = Math.min(100, state.stats.spirit - spiritCost);
        }

        // 计算奖励
        let sawdust = this.calcSawdustReward(rating, durationMinutes, actualMinutes || durationMinutes);
        let flame = this.calcFlameReward(sawdust, state);

        // 黑狗征服者加成
        const isBD = this.isBlackDogTask(task);
        if (isBD) {
            flame *= 2; // 火苗暴击翻倍
            const comboBonus = this.getComboBonus(state);
            flame = Math.round(flame * (1 + comboBonus));
        }
        this.updateCombo(state, isBD);

        // 应用奖励
        state.stats.sawdust += sawdust;
        state.stats.flame += flame;

        // 标记完成
        task.done = true;
        task.rating = rating;
        task.completedAt = new Date().toISOString();

        return {
            success: true,
            rewards: { sawdust, flame, energyCost, spiritCost },
            isBlackDog: isBD,
            combo: state.blackDogCombo || 0,
        };
    },

    // ========== 结束一天 ==========
    endDay(state) {
        const s = state.stats;
        const ashGain = Math.floor(s.flame / 2);
        const wasBurning = s.flame >= 100;

        // 火苗衰减（除非度假/助燃剂）
        if (!state.vacation.isOnVacation && !state.shop.activeEffects.fireStarter) {
            s.ash += ashGain;
            s.flame = Math.floor(s.flame / 2);
        }

        // 燃烧日
        if (wasBurning) {
            s.burningDays += 1;
        }

        // 抑郁里程碑检查
        const depressionResult = this.checkDepressionMilestone(state);

        // 重置
        s.totalDays += 1;
        s.energy = 100;
        s.spirit = state.depression.dailySpirit;

        // 重置商店日效果
        state.shop.activeEffects.fireStarter = false;
        state.shop.activeEffects.mirror = false;

        // 重置黑狗连击
        state.blackDogCombo = 0;

        // 重置日常任务（streak处理），支线完成的移除，主线保留
        state.dailyTasks = state.dailyTasks.filter(t => {
            if (t.type === 'side' && t.done) return false; // 支线完成即删
            return true;
        });
        state.dailyTasks.forEach(t => {
            if (t.type === 'daily' || !t.type) {
                if (t.done) {
                    t.streak = (t.streak || 0) + 1;
                } else {
                    t.streak = 0; // 没完成断streak
                }
                t.done = false;
                t.rating = null;
                t.timerStarted = null;
            }
        });

        // 死亡检查
        const isDead = s.flame <= 0;

        return { ashGain, wasBurning, isDead, depressionResult };
    },

    // ========== 抑郁里程碑 ==========
    checkDepressionMilestone(state) {
        const d = state.depression;
        const burningDays = state.stats.burningDays;
        const milestones = Object.keys(d.milestones).map(Number).sort((a, b) => a - b);

        for (const days of milestones) {
            if (burningDays >= days && d.nextMilestone <= days) {
                const milestone = d.milestones[days];
                d.status = milestone.status;
                d.dailySpirit = milestone.spirit;
                const nextIdx = milestones.indexOf(days);
                d.nextMilestone = nextIdx < milestones.length - 1 ? milestones[nextIdx + 1] : days;
                return { changed: true, newStatus: milestone.status, newSpirit: milestone.spirit };
            }
        }
        return { changed: false };
    },

    // ========== 商店 ==========
    shopItems: {
        fireStarter: { name: '助燃剂', cost: 100, desc: '明天火苗不减半', permanent: false },
        mirror: { name: '镜子', cost: 200, desc: '今天任务火苗翻倍', permanent: false },
        oxygenChamber: { name: '富氧舱', cost: 5000, desc: '永久任务火苗翻倍', permanent: true },
        flameTea: { name: '火种茶', cost: 30, desc: '恢复10精力', instant: true, effect: 'spirit', amount: 10 },
        sparkCandy: { name: '焰火糖', cost: 20, desc: '恢复5体力', instant: true, effect: 'energy', amount: 5 },
        sawdustCookie: { name: '木屑饼干', cost: 50, desc: '获得10木屑', instant: true, effect: 'sawdust', amount: 10 },
    },

    purchaseItem(state, itemId) {
        const item = this.shopItems[itemId];
        if (!item) return { success: false, reason: '物品不存在' };
        if (state.stats.ash < item.cost) return { success: false, reason: `灰烬不足，需要${item.cost}` };

        state.stats.ash -= item.cost;

        if (item.instant) {
            state.stats[item.effect] = Math.min(
                state.stats[item.effect] + item.amount,
                item.effect === 'sawdust' ? Infinity : 100
            );
            return { success: true, msg: `使用了${item.name}，${item.desc}` };
        }

        state.shop.activeEffects[itemId] = true;
        return { success: true, msg: `购买了${item.name}，${item.desc}` };
    },

    // ========== 度假 ==========
    startVacation(state, type) {
        const costs = { short: 5000, long: 20000 };
        const days = { short: 7, long: 30 };

        if (state.stats.ash < costs[type]) return { success: false, reason: `灰烬不足，需要${costs[type]}` };

        state.stats.ash -= costs[type];
        state.vacation.isOnVacation = true;
        state.vacation.vacationType = type;
        state.vacation.startDate = new Date().toISOString();
        const end = new Date();
        end.setDate(end.getDate() + days[type]);
        state.vacation.endDate = end.toISOString();

        return { success: true, days: days[type] };
    },

    endVacation(state) {
        state.vacation.isOnVacation = false;
        state.vacation.vacationType = null;
        state.vacation.startDate = null;
        state.vacation.endDate = null;
    },
};
