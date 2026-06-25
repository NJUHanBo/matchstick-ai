// ============ Screen navigation ============

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// ============ Main screen ============

var FLAME_FLOOR = 10;
var WELCOME_BACK_FLAME = 20;

function checkAutoEndDay() {
    const today = new Date().toISOString().split('T')[0];
    const last = GameState.lastPlayedDate;
    if (!last || last === today) {
        if (!GameState.lastPlayedDate) {
            GameState.lastPlayedDate = today;
            saveGame();
        }
        return;
    }

    const lastDate = new Date(last + 'T00:00:00');
    const todayDate = new Date(today + 'T00:00:00');
    const missedDays = Math.round((todayDate - lastDate) / 86400000);
    if (missedDays <= 0) return;

    const cap = Math.min(missedDays, 30);
    const flameBefore = GameState.stats.flame;

    for (let i = 0; i < cap; i++) {
        GameEngine.endDay(GameState);
        if (window.TaskSystem) TaskSystem.resetDaily();
        if (GameState.stats.flame < FLAME_FLOOR) {
            GameState.stats.flame = FLAME_FLOOR;
        }
    }

    const flameAfterDecay = GameState.stats.flame;
    GameState.stats.flame += WELCOME_BACK_FLAME;

    GameState.lastPlayedDate = today;
    saveGame();

    showAutoEndDayNotice(cap, flameBefore, flameAfterDecay);
}

function showAutoEndDayNotice(days, flameBefore, flameAfterDecay) {
    const flameNow = GameState.stats.flame;
    const name = GameState.character ? GameState.character.name : '旅人';

    let title, subtitle;
    if (days <= 2) {
        title = '新的一天';
        subtitle = name + '，你回来了。火苗还在。';
    } else if (days <= 7) {
        title = '你离开了 ' + days + ' 天';
        subtitle = '火苗变小了，但它一直在等你。';
    } else {
        title = '你离开了 ' + days + ' 天';
        subtitle = '火苗几乎要熄灭了……但它记得你。';
    }

    const overlay = document.createElement('div');
    overlay.id = 'auto-endday-overlay';
    overlay.className = 'timer-overlay';
    overlay.innerHTML = `
        <div class="timer-content endday-content">
            <h2 class="timer-task-name">${title}</h2>
            <p style="color:var(--text-main);margin:8px 0 16px;text-align:center;">${subtitle}</p>
            <div class="endday-stats">
                <div class="endday-row">
                    <span>火苗变化</span>
                    <span class="endday-value fire-color">${flameBefore} → ${flameAfterDecay}</span>
                </div>
                <div class="endday-row">
                    <span>回归之火</span>
                    <span class="endday-value" style="color:#ffcc44;">+${WELCOME_BACK_FLAME}（当前 ${flameNow}）</span>
                </div>
                <div class="endday-row">
                    <span>游戏日</span>
                    <span class="endday-value">第${GameState.stats.totalDays}天</span>
                </div>
                <div class="endday-row">
                    <span>状态</span>
                    <span class="endday-value">${GameState.depression.status}</span>
                </div>
            </div>
            <div class="timer-buttons">
                <button class="r8-btn r8-btn--primary" onclick="document.getElementById('auto-endday-overlay').remove()">继续</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function enterMainScreen() {
    checkAutoEndDay();

    const god = GOD_INFO[GameState.character.godType];

    document.getElementById('display-name').textContent = GameState.character.name;
    document.getElementById('display-day').textContent = `第${GameState.stats.totalDays}天`;
    document.getElementById('god-chat-title').textContent = `${god.icon} ${god.title}`;

    updateResources();
    renderTasks();
    showScreen('screen-main');

    if (GameState.chatHistory.length === 0) {
        if (GameState.guideTourCompleted || GameState.stats.totalDays > 1) {
            showFirstDayGreeting();
        }
    } else {
        restoreChatHistory();
    }

    if (window.TileMap) {
        requestAnimationFrame(() => {
            TileMap.init();
            if (!GameState.guideTourCompleted && GameState.stats.totalDays === 1 && window.GuideTour) {
                setTimeout(() => GuideTour.start(), 800);
            }
        });
    }
}

function updateResources() {
    const s = GameState.stats;

    // 顶栏
    document.getElementById('res-energy').textContent = s.energy;
    document.getElementById('res-spirit').textContent = s.spirit;
    document.getElementById('res-sawdust').textContent = s.sawdust;
    document.getElementById('res-flame').textContent = s.flame;
    document.getElementById('res-ash').textContent = s.ash;

    // 侧边栏详情
    const barEnergy = document.getElementById('bar-energy');
    const barSpirit = document.getElementById('bar-spirit');
    if (barEnergy) barEnergy.style.width = s.energy + '%';
    if (barSpirit) barSpirit.style.width = s.spirit + '%';

    const statEnergy = document.getElementById('stat-energy');
    const statSpirit = document.getElementById('stat-spirit');
    const statFlame = document.getElementById('stat-flame');
    const statSawdust = document.getElementById('stat-sawdust');
    const statAsh = document.getElementById('stat-ash');
    const statDepression = document.getElementById('stat-depression');
    const statBurning = document.getElementById('stat-burning');

    if (statEnergy) statEnergy.textContent = s.energy;
    if (statSpirit) statSpirit.textContent = s.spirit;
    if (statFlame) statFlame.textContent = s.flame;
    if (statSawdust) statSawdust.textContent = s.sawdust;
    if (statAsh) statAsh.textContent = s.ash;
    if (statDepression) statDepression.textContent = GameState.depression.status;
    if (statBurning) statBurning.textContent = `燃烧${s.burningDays}天`;

    // 活跃 buff 状态
    const buffsEl = document.getElementById('active-buffs');
    if (buffsEl) {
        const effects = GameState.shop ? GameState.shop.activeEffects : {};
        const vacation = GameState.vacation;
        let tags = '';
        if (effects.fireStarter) tags += '<span class="buff-tag" title="明天火苗不减半">🔥助燃</span>';
        if (effects.mirror) tags += '<span class="buff-tag" title="今天任务火苗翻倍">🪞镜子</span>';
        if (effects.oxygenChamber) tags += '<span class="buff-tag buff-tag--perm" title="永久任务火苗翻倍">🫧富氧</span>';
        if (vacation && vacation.isOnVacation) tags += '<span class="buff-tag buff-tag--vacation" title="度假中，火苗冻结">🏖️度假</span>';
        buffsEl.innerHTML = tags;
    }
}

// ============ Chat system ============

function addMessage(sender, text, save = true) {
    const container = document.getElementById('chat-messages');
    const god = GOD_INFO[GameState.character.godType];

    const msgDiv = document.createElement('div');
    const isGod = sender === 'god';
    msgDiv.className = `msg ${isGod ? 'msg-god' : 'msg-user'}`;

    const senderName = isGod ? god.name : GameState.character.name;
    msgDiv.innerHTML = `<div class="msg-sender">${senderName}</div><div class="msg-text">${text}</div>`;
    container.appendChild(msgDiv);

    container.scrollTop = container.scrollHeight;

    if (save) {
        GameState.chatHistory.push({ sender, text, time: Date.now() });
        saveGame();
    }
}

function restoreChatHistory() {
    GameState.chatHistory.forEach(msg => {
        addMessage(msg.sender, msg.text, false);
    });
}

function showFirstDayGreeting() {
    const god = GOD_INFO[GameState.character.godType];
    const name = GameState.character.name;

    const greetings = {
        wise: [
            `......${name}。你能听到我吗。`,
            `我已经不在了。但灰烬中还残留着一点回响。`,
            `十九棵幼苗已经破土。你知道你该做什么。`,
            `告诉我今天的状况。我会尽力引导你。`,
        ],
        king: [
            `${name}。醒了就别发呆。`,
            `黑狗斥候白天不敢靠近，但它们在外围游荡。你必须利用好白天。`,
            `报告你今天的任务。我来帮你安排优先级。`,
        ],
        rich: [
            `${name}，听好。灰烬是你唯一的货币，火苗是你唯一的生命。`,
            `每一天你能收集多少木屑，转化多少灰烬，决定了幼苗能否存活。`,
            `告诉我你今天打算做什么，我来评估回报。`,
        ],
    };

    const msgs = greetings[GameState.character.godType];
    let delay = 800;
    msgs.forEach((msg, i) => {
        setTimeout(() => addMessage('god', msg), delay);
        delay += 1200 + msg.length * 25;
    });
}

function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    addMessage('user', text);
    input.value = '';

    // 如果在杂念模式中，内容保存为杂念
    if (thoughtTimer) {
        GameState.thoughts.push({
            id: Date.now(),
            content: text,
            timestamp: new Date().toISOString(),
        });
        saveGame();
        return; // 不回复，静默保存
    }

    // 仅商店/度假/杂念等游戏引擎操作走本地
    const engineReply = handleEngineCommand(text);
    if (engineReply === undefined) return; // 杂念模式等自处理情况
    if (engineReply) {
        showTypingIndicator();
        setTimeout(() => {
            removeTypingIndicator();
            addMessage('god', engineReply);
        }, 300);
        return;
    }

    // 对话走 DeepSeek AI（纯聊天）
    showTypingIndicator();
    if (window.Analytics) Analytics.trackChat(text.substring(0, 50));
    AIChat.send(text).then(result => {
        removeTypingIndicator();
        if (!result || !result.text) {
            addMessage('god', '......');
            return;
        }
        addMessage('god', result.text);
    });
}

function handleChatKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function showTypingIndicator() {
    const container = document.getElementById('chat-messages');
    const typing = document.createElement('div');
    typing.className = 'msg msg-god typing-indicator';
    typing.id = 'typing';
    typing.innerHTML = '<div class="msg-sender">...</div><div class="msg-text">思考中...</div>';
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
}

function removeTypingIndicator() {
    const el = document.getElementById('typing');
    if (el) el.remove();
}

/**
 * 仅处理需要即时执行游戏引擎副作用的命令（商店购买、度假、杂念模式）
 * 其他所有对话（包括任务创建、状态查询、闲聊）全部交给 AI
 * 返回字符串表示已处理，返回 null 表示交给 AI
 */
function handleEngineCommand(userText) {
    const lower = userText.toLowerCase();

    // 商店购买（需要立刻执行副作用）
    if (lower.includes('买') || lower.includes('购买')) {
        if (lower.includes('助燃') || lower.includes('firestarter')) {
            const r = GameEngine.purchaseItem(GameState, 'fireStarter');
            saveGame(); updateResources();
            return r.success ? r.msg : r.reason;
        }
        if (lower.includes('镜子') || lower.includes('mirror')) {
            const r = GameEngine.purchaseItem(GameState, 'mirror');
            saveGame(); updateResources();
            return r.success ? r.msg : r.reason;
        }
        if (lower.includes('富氧') || lower.includes('oxygen')) {
            const r = GameEngine.purchaseItem(GameState, 'oxygenChamber');
            saveGame(); updateResources();
            return r.success ? r.msg : r.reason;
        }
        if (lower.includes('茶')) {
            const r = GameEngine.purchaseItem(GameState, 'flameTea');
            saveGame(); updateResources();
            return r.success ? r.msg : r.reason;
        }
        if (lower.includes('糖')) {
            const r = GameEngine.purchaseItem(GameState, 'sparkCandy');
            saveGame(); updateResources();
            return r.success ? r.msg : r.reason;
        }
    }

    // 度假（需要立刻执行副作用）
    if (lower.includes('度假') && (lower.includes('短') || lower.includes('7'))) {
        const r = GameEngine.startVacation(GameState, 'short');
        if (r.success) { saveGame(); updateResources(); }
        return r.success ? `出发了。${r.days}天假期，火苗暂时冻结。好好休息。` : r.reason;
    }
    if (lower.includes('度假') && (lower.includes('长') || lower.includes('30'))) {
        const r = GameEngine.startVacation(GameState, 'long');
        if (r.success) { saveGame(); updateResources(); }
        return r.success ? `出发了。${r.days}天长假，火苗冻结。你值得这个休息。` : r.reason;
    }

    // 杂念/倾诉模式（需要切换状态）
    if (lower.includes('杂念') || lower.includes('倾诉') || lower.includes('写点什么')) {
        startThoughtBin();
        return undefined; // startThoughtBin 自己发消息，不走 AI 也不走 addMessage
    }
    if (lower.includes('写完了') || lower.includes('结束倾诉')) {
        if (thoughtTimer || GameState.thoughts.length > 0) {
            endThoughtBin('');
            return undefined;
        }
    }

    return null;
}

// ============ Task system ============

function addLog(text) {
    if (!GameState.logs) GameState.logs = [];
    const now = new Date();
    const time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const day = GameState.stats ? GameState.stats.totalDays : 0;
    GameState.logs.push(`[D${day} ${time}] ${text}`);
}

function addTask(name, type, extra) {
    const base = {
        id: Date.now(),
        name: name,
        type: type || 'daily', // 'daily' | 'side' | 'main'
        done: false,
        duration: 30,
        importance: 'medium',
        interest: 'medium',
        rating: null,
        timerStarted: null,
        streak: 0,
        createdAt: new Date().toISOString(),
    };

    if (type === 'side') {
        base.deadline = extra?.deadline || null;
    }

    if (type === 'main') {
        base.milestones = extra?.milestones || [];
        base.currentMilestone = 0;
    }

    GameState.dailyTasks.push(base);
    const typeLabel = { daily: '日常', side: '支线', main: '主线' }[type] || '任务';
    addLog(`创建${typeLabel}任务「${name}」`);
    saveGame();
    renderTasks();
}

function deleteTask(id) {
    GameState.dailyTasks = GameState.dailyTasks.filter(t => t.id !== id);
    saveGame();
    renderTasks();
}

function renderTasks() {
    const tasks = GameState.dailyTasks || [];

    const daily = tasks.filter(t => t.type === 'daily' || !t.type);
    const side = (GameState.todos || []).filter(t => !t.completed);
    const main = (GameState.projects || []).filter(t => !t.completed);

    renderCampTaskList('task-list-daily', daily, '在战友陵墓中添加任务');
    renderCampTaskList('task-list-side', side, '在战友陵墓中添加任务');
    renderCampTaskList('task-list-main', main, '在战友陵墓中添加任务');
    renderBattleReport();

    if (window.TaskSystem) TaskSystem.render();
}

function renderBattleReport() {
    const panel = document.getElementById('battle-report-panel');
    const container = document.getElementById('battle-report');
    if (!panel || !container) return;

    const logs = GameState.logs || [];
    const currentDay = GameState.stats ? GameState.stats.totalDays : 0;
    const dayTag = '[D' + currentDay + ' ';

    const todayLogs = logs.filter(function (l) {
        return l.startsWith(dayTag);
    }).filter(l =>
        l.includes('完成') || l.includes('推进')
    );

    const dailyTasks = (GameState.dailyTasks || []).filter(t => t.type === 'daily');
    const doneCount = dailyTasks.filter(t => t.done || t.completed).length;
    const totalCount = dailyTasks.length;

    if (todayLogs.length === 0 && doneCount === 0) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = '';

    let html = '';

    if (totalCount > 0) {
        const pct = Math.round((doneCount / totalCount) * 100);
        html += '<div class="br-progress">';
        html += '<div class="br-progress-label">日常进度 ' + doneCount + '/' + totalCount + '</div>';
        html += '<div class="br-progress-bar"><div class="br-progress-fill" style="width:' + pct + '%"></div></div>';
        html += '</div>';
    }

    if (todayLogs.length > 0) {
        html += '<div class="br-entries">';
        todayLogs.forEach(function (log) {
            var text = log.replace(/^\[.*?\]\s*/, '');
            var icon = '✅';
            if (text.includes('推进')) icon = '⬆️';
            if (text.includes('项目')) icon = '🏆';

            var rewards = '';
            var sawMatch = text.match(/\+(\d+)木屑/);
            var flameMatch = text.match(/\+(\d+)火苗/);
            if (sawMatch) rewards += '<span class="br-reward br-reward--sawdust">🪵+' + sawMatch[1] + '</span>';
            if (flameMatch) rewards += '<span class="br-reward br-reward--flame">🔥+' + flameMatch[1] + '</span>';

            var taskName = '';
            var nameMatch = text.match(/「(.+?)」/);
            if (nameMatch) taskName = nameMatch[1];

            html += '<div class="br-entry">';
            html += '<span class="br-icon">' + icon + '</span>';
            html += '<span class="br-name">' + (taskName || text) + '</span>';
            html += '<span class="br-rewards">' + rewards + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }

    container.innerHTML = html;
}

function renderCampTaskList(containerId, tasks, hint) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (tasks.length === 0) {
        container.innerHTML = `<div class="empty-tasks"><p class="hint">${hint}</p></div>`;
        return;
    }

    const isDone = t => t.done || t.completed;

    container.innerHTML = tasks.map(t => {
        const status = isDone(t) ? '✅' : '⬜';
        let extra = '';
        if (t.type === 'daily' && t.streak > 0) extra = `<span class="task-streak">🔥${t.streak}</span>`;
        if (t.type === 'todo' && t.deadline) {
            const daysLeft = Math.ceil((new Date(t.deadline) - new Date()) / 86400000);
            extra = `<span class="task-deadline">${daysLeft <= 0 ? '逾期' : daysLeft + '天'}</span>`;
        }
        if (t.type === 'project' && t.milestones && t.milestones.length > 0) {
            const ms = t.milestones[t.currentMilestone];
            const msProgress = ms && ms.progress ? ms.progress + '%' : '0%';
            extra = `<span class="task-progress">${t.currentMilestone || 0}/${t.milestones.length} · ${ms ? ms.name : ''}（${msProgress}）</span>`;
        }

        let actionHtml = '';
        if (!isDone(t)) {
            if (t.type === 'daily') {
                actionHtml = `<span class="task-action" onclick="event.stopPropagation(); TaskSystem.completeDaily(${t.id})">✓</span>`;
            } else if (t.type === 'todo') {
                actionHtml = `<span class="task-action" onclick="event.stopPropagation(); TaskSystem.completeTodo(${t.id})">✓</span>`;
            } else if (t.type === 'project') {
                actionHtml = `<span class="task-action" onclick="event.stopPropagation(); TaskSystem.completeMilestone(${t.id})">⬆</span>`;
            }
        }

        return `
            <div class="task-item ${isDone(t) ? 'done' : ''}">
                <span>${status}</span>
                <span class="task-name">${t.name}</span>
                ${extra}
                ${actionHtml}
            </div>
        `;
    }).join('');
}

// ============ 杂念垃圾桶（15分钟写作）============

let thoughtTimer = null;
let thoughtSeconds = 15 * 60;

function startThoughtBin() {
    if (GameState.dailyThoughtCompleted) {
        addMessage('god', '今天已经倾诉过了。明天再来。');
        return;
    }

    thoughtSeconds = 15 * 60;
    addMessage('god', '15分钟开始了。在输入框里写任何你想写的东西，写完发送给我保存。时间到了我会提醒你。');

    thoughtTimer = setInterval(() => {
        thoughtSeconds--;
        if (thoughtSeconds <= 0) {
            clearInterval(thoughtTimer);
            thoughtTimer = null;
            addMessage('god', '15分钟到了。你可以继续写，或者说"写完了"结束。');
        }
    }, 1000);
}

function endThoughtBin(content) {
    if (thoughtTimer) {
        clearInterval(thoughtTimer);
        thoughtTimer = null;
    }

    if (content && content.trim()) {
        GameState.thoughts.push({
            id: Date.now(),
            content: content.trim(),
            timestamp: new Date().toISOString(),
        });
    }

    GameState.dailyThoughtCompleted = true;
    GameState.stats.spirit = Math.min(100, GameState.stats.spirit + 10);
    saveGame();
    updateResources();
    addMessage('god', '杂念已收下。精力恢复了一些（+10）。继续前行。');
}

// ============ Quick actions ============

function askGod(type) {
    MapUI.open('god');
    if (type === 'help') {
        addMessage('user', '这游戏怎么玩？');
        setTimeout(() => addMessage('god', '跟我聊天就行。告诉我你想做什么，我帮你安排成任务。完成任务获得木屑和火苗。火苗每天会减半变成灰烬，保持活跃才能维持火苗！灰烬可以在商店买道具。'), 500);
    } else if (type === 'status') {
        const s = GameState.stats;
        addMessage('user', '看看我的状态');
        setTimeout(() => addMessage('god', `第${s.totalDays}天 | 体力:${s.energy} 精力:${s.spirit} | 木屑:${s.sawdust} 火苗:${s.flame} 灰烬:${s.ash} | 燃烧天数:${s.burningDays}`), 500);
    }
}

function endDay() {
    // 先显示统计预览，让用户确认
    showEndDayPreview();
}

function showEndDayPreview() {
    const s = GameState.stats;
    const tasks = GameState.dailyTasks || [];
    const todos = GameState.todos || [];
    const projects = GameState.projects || [];
    const isDone = t => t.done || t.completed;
    const completed = tasks.filter(isDone).length + todos.filter(isDone).length;
    const total = tasks.length + todos.filter(t => !isDone(t)).length + projects.filter(t => !isDone(t)).length;

    const ashGain = Math.floor(s.flame / 2);
    const newFlame = Math.floor(s.flame / 2);
    const willBurn = s.flame >= 100;

    const isVacation = GameState.vacation.isOnVacation;
    const hasFireStarter = GameState.shop.activeEffects.fireStarter;

    let flameNote = '';
    if (isVacation) flameNote = '（度假中，火苗冻结）';
    else if (hasFireStarter) flameNote = '（助燃剂生效，火苗不减半）';

    const overlay = document.createElement('div');
    overlay.id = 'endday-overlay';
    overlay.className = 'timer-overlay';
    overlay.innerHTML = `
        <div class="timer-content endday-content">
            <h2 class="timer-task-name">第${s.totalDays}天 · 日终报告</h2>

            <div class="endday-stats">
                <div class="endday-row">
                    <span>任务完成</span>
                    <span class="endday-value">${completed} / ${total}</span>
                </div>
                <div class="endday-row">
                    <span>当前火苗</span>
                    <span class="endday-value fire-color">${s.flame}</span>
                </div>
                <div class="endday-row">
                    <span>火苗变化</span>
                    <span class="endday-value">${isVacation || hasFireStarter ? '不变' : `${s.flame} → ${newFlame}（-${ashGain}）`} ${flameNote}</span>
                </div>
                <div class="endday-row">
                    <span>灰烬获得</span>
                    <span class="endday-value">+${isVacation || hasFireStarter ? 0 : ashGain}</span>
                </div>
                <div class="endday-row">
                    <span>燃烧日</span>
                    <span class="endday-value">${willBurn ? '✓ 达标（火苗≥100）' : '✗ 未达标'}</span>
                </div>
                <div class="endday-row">
                    <span>累计燃烧</span>
                    <span class="endday-value">${s.burningDays}天${willBurn ? ' → ' + (s.burningDays + 1) + '天' : ''}</span>
                </div>
                <div class="endday-row">
                    <span>状态</span>
                    <span class="endday-value">${GameState.depression.status}</span>
                </div>
                ${newFlame <= 0 && !isVacation && !hasFireStarter ? '<div class="endday-warning">⚠️ 火苗将归零——你会死</div>' : ''}
            </div>

            <div class="timer-buttons">
                <button class="r8-btn r8-btn--secondary" onclick="cancelEndDay()">继续这一天</button>
                <button class="r8-btn r8-btn--primary" onclick="confirmEndDay()">确认结束</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function cancelEndDay() {
    const el = document.getElementById('endday-overlay');
    if (el) el.remove();
}

function confirmEndDay() {
    const el = document.getElementById('endday-overlay');
    if (el) el.remove();

    const result = GameEngine.endDay(GameState);
    const s = GameState.stats;

    const dailyDone = (GameState.dailyTasks || []).filter(t => t.done || t.completed).length;
    addLog(`结束第${s.totalDays - 1}天，完成${dailyDone}个任务，火苗${s.flame}，灰烬+${result.ashGain || 0}`);

    if (window.TaskSystem) TaskSystem.resetDaily();
    saveGame();
    updateResources();
    renderTasks();
    document.getElementById('display-day').textContent = `第${s.totalDays}天`;

    if (window.Analytics) Analytics.trackEndDay(s.totalDays, s.flame, s.ash, s.burningDays);

    // 抑郁里程碑提示
    if (result.depressionResult.changed) {
        setTimeout(() => {
            addMessage('god', `......感觉有什么变了。黑狗的气息在减弱。状态进化：「${result.depressionResult.newStatus}」。精力上限提升至${result.depressionResult.newSpirit}。`);
        }, 1500);
    }

    // 死亡
    if (result.isDead) {
        GameState.stats.flame = 0;
        saveGame();
        updateResources();
        addMessage('god', `......火苗熄灭了。`);
        setTimeout(() => addMessage('god', `${GameState.character.name}。你倒下了。幼苗们失去了守护者。`), 2000);
        setTimeout(() => addMessage('god', `黑狗将在黎明到来前找到这里。一切都结束了。`), 4000);
        setTimeout(() => addMessage('god', `......还是说，你愿意再试一次？`), 6500);
        return;
    }

    // 种子结算 + 夜晚过渡
    settleSeedsAndTransition(result, s);
}

async function settleSeedsAndTransition(result, s) {
    let seedResult = { flame: 0, details: [] };

    if (window.SeedSocial && SupabaseClient.isReady()) {
        try {
            seedResult = await SeedSocial.settleSeeds();
            if (seedResult.flame > 0) {
                GameState.stats.flame += seedResult.flame;
                saveGame();
                updateResources();
                addLog(`种子结算：+${seedResult.flame}火苗（${seedResult.details.length}颗种子获得评价）`);
            }
        } catch (e) {
            console.error('Seed settlement failed:', e);
        }
    }

    // 刷新花园随机缓存
    if (window.GardenUI) GardenUI.refreshRandomCache();

    // AI 记忆压缩整理
    if (window.AIMemory) {
        const tasks = GameState.dailyTasks || [];
        const completed = tasks.filter(t => t.done || t.completed).length;
        AIMemory.compressAtEndDay({
            day: s.totalDays,
            flame: s.flame,
            ash: s.ash,
            tasksCompleted: completed,
            burningDays: s.burningDays,
        }).catch(() => {});
    }

    showNightTransition(result, s, seedResult);
}

function showNightTransition(result, s, seedResult) {
    const nightOverlay = document.createElement('div');
    nightOverlay.id = 'night-overlay';
    nightOverlay.className = 'night-overlay';

    let summaryText = `火苗 ${s.flame}（-${result.ashGain}） · 灰烬 +${result.ashGain}`;
    if (result.wasBurning) summaryText += ` · 燃烧日 ${s.burningDays}`;
    summaryText += ` · 第${s.totalDays}天`;

    // 种子收益
    let seedHtml = '';
    if (seedResult && seedResult.flame > 0) {
        const detailLines = seedResult.details.map(d =>
            `「${d.content}」被${d.newRatings}人评价，+${d.flameGained}火苗`
        ).join('<br>');
        seedHtml = `
            <div class="night-seed-reward">
                <p class="night-seed-title">种子收获 +${seedResult.flame} 火苗</p>
                <p class="night-seed-detail">${detailLines}</p>
            </div>`;
        summaryText += ` · 种子 +${seedResult.flame}火苗`;
    }

    const memory = pickMemory();
    const memoryHtml = memory
        ? `<div class="night-memory">
            <p class="night-memory-period">${memory.period}</p>
            <h3 class="night-memory-title">${memory.title}</h3>
            <p class="night-memory-text">${memory.text.replace(/\n/g, '<br>')}</p>
           </div>`
        : `<p class="night-message">萤火虫在林间闪烁。幼苗还在。你还在。</p>`;

    nightOverlay.innerHTML = `
        <div class="night-content">
            <div class="night-fireflies"></div>
            ${memoryHtml}
            ${seedHtml}
            <p class="night-summary">${summaryText}</p>
            <button class="r8-btn r8-btn--primary" onclick="dismissNight()">迎接新的一天</button>
        </div>
    `;
    document.body.appendChild(nightOverlay);
}

function pickMemory() {
    if (typeof MEMORIES === 'undefined' || !MEMORIES.length) return null;

    if (!GameState._shownMemories) GameState._shownMemories = [];

    var unseen = MEMORIES.filter(function (m, i) {
        return GameState._shownMemories.indexOf(i) === -1;
    });

    if (unseen.length === 0) {
        GameState._shownMemories = [];
        unseen = MEMORIES;
    }

    var idx = MEMORIES.indexOf(unseen[Math.floor(Math.random() * unseen.length)]);
    GameState._shownMemories.push(idx);
    saveGame();
    return MEMORIES[idx];
}

function dismissNight() {
    const overlay = document.getElementById('night-overlay');
    if (overlay) overlay.remove();
}

// ============ Quick buy ============

function quickBuy(itemId) {
    const result = GameEngine.purchaseItem(GameState, itemId);
    if (result.success) {
        saveGame();
        updateResources();
        addMessage('god', result.msg);
        if (window.AIMemory) AIMemory.recordEvent('购买了' + itemId);
        showQuickBuyToast(result.msg, true);
    } else {
        addMessage('god', result.reason);
        showQuickBuyToast(result.reason, false);
    }
}

function showQuickBuyToast(text, success) {
    var existing = document.getElementById('shop-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id = 'shop-toast';
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:8px 20px;border-radius:4px;font-size:13px;z-index:9999;pointer-events:none;transition:opacity 0.3s;'
        + (success ? 'background:#1a2a1a;color:#44ff44;border:1px solid #44ff4466;' : 'background:#2a1a1a;color:#ff6644;border:1px solid #ff664466;');
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(function () { toast.style.opacity = '0'; }, 1500);
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, 2000);
}

// ============ Data backup ============

function exportData() {
    const data = JSON.stringify(GameState, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `守墓者存档_第${GameState.stats.totalDays}天.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addMessage('god', '存档已导出。妥善保管。');
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const parsed = JSON.parse(ev.target.result);
                if (!parsed.character || !parsed.stats) {
                    addMessage('god', '文件格式错误，无法导入。');
                    return;
                }
                Object.assign(GameState, parsed);
                saveGame();
                addMessage('god', `存档已恢复。欢迎回来，${GameState.character.name}。`);
                updateResources();
                renderTasks();
                document.getElementById('display-name').textContent = GameState.character.name;
                document.getElementById('display-day').textContent = `第${GameState.stats.totalDays}天`;
            } catch (err) {
                addMessage('god', '导入失败：' + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ============ Reset ============

function confirmReset() {
    if (confirm('确定要重启人生吗？所有数据将被清除。')) {
        resetGame();
    }
}

// ============ Change name ============

function changeName() {
    var currentName = GameState.character ? GameState.character.name : '';
    var newName = prompt('输入新名字（当前：' + currentName + '）', currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
        GameState.character.name = newName.trim();
        document.getElementById('display-name').textContent = newName.trim();
        saveGame();
        addMessage('god', '好。从现在起，你叫「' + newName.trim() + '」。');
    }
}

// ============ 自定义 tooltip ============

(function () {
    var tip = null;
    function show(e) {
        if (!tip) tip = document.getElementById('custom-tooltip');
        if (!tip) return;
        var text = e.target.closest('[data-tip]');
        if (!text) return;
        tip.textContent = text.getAttribute('data-tip');
        tip.classList.remove('hidden');
        position(e);
    }
    function position(e) {
        if (!tip) return;
        var x = e.clientX + 12;
        var y = e.clientY + 12;
        if (x + 230 > window.innerWidth) x = e.clientX - 230;
        if (y + 80 > window.innerHeight) y = e.clientY - 80;
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
    }
    function hide() {
        if (tip) tip.classList.add('hidden');
    }
    document.addEventListener('mouseover', show);
    document.addEventListener('mousemove', position);
    document.addEventListener('mouseout', function (e) {
        if (!e.target.closest('[data-tip]')) hide();
    });
    document.addEventListener('mouseover', function (e) {
        if (!e.target.closest('[data-tip]')) hide();
    });
})();

// ============ 守墓者手札 ============

function openLoreOverlay() {
    document.getElementById('lore-overlay').classList.remove('hidden');
}

function closeLoreOverlay() {
    document.getElementById('lore-overlay').classList.add('hidden');
}

// ============ Init ============

window.addEventListener('DOMContentLoaded', () => {
    // 初始化 Supabase
    if (window.SupabaseClient) SupabaseClient.init();

    // 显示同意条幅（如果首次）
    if (window.ConsentManager) ConsentManager.init();

    // 初始化 Analytics
    if (window.Analytics) Analytics.init();

    // 启动 Auth 流程（Auth 完成后会调用 startGameAfterAuth）
    if (window.AuthUI) {
        AuthUI.init();
    } else {
        startGameAfterAuth();
    }
});

function startGameAfterAuth() {
    if (window.Analytics && SupabaseClient.isLoggedIn()) {
        Analytics.trackLogin('email');
    }

    // 加载 AI 记忆
    if (window.AIMemory && SupabaseClient.isReady()) {
        AIMemory.load().catch(() => {});
    }

    // 背景音乐
    if (window.BGMusic) {
        BGMusic.init();
        BGMusic.tryAutoplay();
    }

    if (loadGame() && GameState.character) {
        enterMainScreen();
    } else {
        Opening.start();
    }
}
