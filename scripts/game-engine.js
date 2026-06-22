// 游戏引擎 — 资源计算、奖励、黑狗连击、抑郁里程碑

const GameEngine = {

    // ========== 结束一天 ==========
    endDay(state) {
        const s = state.stats;
        const ashGain = Math.floor(s.flame / 2);
        const wasBurning = s.flame >= 100;

        // 度假自动结束检查
        if (state.vacation.isOnVacation && state.vacation.endDate) {
            if (new Date() >= new Date(state.vacation.endDate)) {
                this.endVacation(state);
            }
        }

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

        // 重置每日杂念
        state.dailyThoughtCompleted = false;

        // 记录日期
        state.lastPlayedDate = new Date().toISOString().split('T')[0];

        // 重置日常任务（streak处理），支线完成的移除，主线保留
        state.dailyTasks = state.dailyTasks.filter(t => {
            if (t.type === 'side' && (t.done || t.completed)) return false;
            return true;
        });
        state.dailyTasks.forEach(t => {
            if (t.type === 'daily' || !t.type) {
                if (t.done || t.completed) {
                    t.streak = (t.streak || 0) + 1;
                } else {
                    t.streak = 0;
                }
                t.done = false;
                t.completed = false;
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
