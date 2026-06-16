// ============ Screen navigation ============

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// ============ Main screen ============

function enterMainScreen() {
    const god = GOD_INFO[GameState.character.godType];

    document.getElementById('display-name').textContent = GameState.character.name;
    document.getElementById('display-day').textContent = `第${GameState.stats.totalDays}天`;
    document.getElementById('god-chat-title').textContent = `${god.icon} ${god.title}`;

    updateResources();
    renderTasks();
    showScreen('screen-main');

    if (GameState.chatHistory.length === 0) {
        showFirstDayGreeting();
    } else {
        restoreChatHistory();
    }

    if (window.TileMap) {
        requestAnimationFrame(() => TileMap.init());
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

function completeTaskByName(name, minutes, rating) {
    const tasks = GameState.dailyTasks || [];
    const lower = name.toLowerCase();

    let task = tasks.find(t => !t.done && t.name === name);
    if (!task) task = tasks.find(t => !t.done && t.name.includes(name));
    if (!task) task = tasks.find(t => !t.done && name.includes(t.name));
    if (!task) task = tasks.find(t => !t.done && t.name.toLowerCase().includes(lower));
    if (!task) task = tasks.find(t => !t.done && lower.includes(t.name.toLowerCase()));

    if (!task) {
        console.log('completeTaskByName: no match for', name);
        return;
    }

    task.duration = minutes || task.duration || 30;
    const result = GameEngine.completeTask(GameState, task, rating || 3, minutes || 30);
    if (result.success) {
        if (task.type === 'daily') task.streak = (task.streak || 0) + 1;
        addLog(`完成「${task.name}」${minutes}分钟，评分${rating}/5，获得木屑${result.rewards.sawdust}+火苗${result.rewards.flame}`);
        saveGame();
    }
}

function addLog(text) {
    if (!GameState.logs) GameState.logs = [];
    const now = new Date();
    const date = now.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    const time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    GameState.logs.push(`[${date} ${time}] ${text}`);
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

// ============ Timer overlay ============

let activeTimerTask = null;
let timerInterval = null;
let timerPaused = false;
let timerPausedTotal = 0;
let timerPauseStart = 0;

function toggleTask(id) {
    const task = GameState.dailyTasks.find(t => t.id === id);
    if (!task || task.done) return;
    showTaskSetup(id);
}

function showTaskSetup(id) {
    const task = GameState.dailyTasks.find(t => t.id === id);
    if (!task) return;

    const overlay = document.createElement('div');
    overlay.id = 'task-setup-overlay';
    overlay.className = 'timer-overlay';
    overlay.innerHTML = `
        <div class="timer-content task-setup-content">
            <h2 class="timer-task-name">${task.name}</h2>

            <div class="setup-field">
                <label>计划时长（分钟）</label>
                <div class="setup-options">
                    <button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="setSetupDuration(5)">5</button>
                    <button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="setSetupDuration(15)">15</button>
                    <button class="r8-btn r8-btn--secondary r8-btn--sm setup-selected" onclick="setSetupDuration(30)">30</button>
                    <button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="setSetupDuration(60)">60</button>
                    <button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="setSetupDuration(120)">120</button>
                </div>
            </div>

            <div class="setup-field">
                <label>重要性</label>
                <div class="setup-options">
                    <button class="r8-btn r8-btn--danger r8-btn--sm" onclick="setSetupImportance('high')">高</button>
                    <button class="r8-btn r8-btn--secondary r8-btn--sm setup-selected" onclick="setSetupImportance('medium')">中</button>
                    <button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="setSetupImportance('low')">低</button>
                </div>
            </div>

            <div class="setup-field">
                <label>兴趣度</label>
                <div class="setup-options">
                    <button class="r8-btn r8-btn--primary r8-btn--sm" onclick="setSetupInterest('high')">高</button>
                    <button class="r8-btn r8-btn--secondary r8-btn--sm setup-selected" onclick="setSetupInterest('medium')">中</button>
                    <button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="setSetupInterest('low')">低</button>
                </div>
            </div>

            <div class="setup-summary" id="setup-summary">
                体力消耗: 6 | 精力消耗: 20
            </div>

            <div class="timer-buttons">
                <button class="r8-btn r8-btn--secondary" onclick="cancelTaskSetup()">取消</button>
                <button class="r8-btn r8-btn--primary" onclick="confirmTaskStart(${id})">开始任务</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // 存储临时设置
    window._taskSetup = { duration: 30, importance: 'medium', interest: 'medium' };
    updateSetupSummary();
}

function setSetupDuration(val) {
    window._taskSetup.duration = val;
    highlightSetupBtn(0, val);
    updateSetupSummary();
}

function setSetupImportance(val) {
    window._taskSetup.importance = val;
    highlightSetupBtn(1, val);
    updateSetupSummary();
}

function setSetupInterest(val) {
    window._taskSetup.interest = val;
    highlightSetupBtn(2, val);
    updateSetupSummary();
}

function highlightSetupBtn(fieldIdx, val) {
    const fields = document.querySelectorAll('.setup-field');
    if (!fields[fieldIdx]) return;
    const btns = fields[fieldIdx].querySelectorAll('.r8-btn');
    btns.forEach(b => b.classList.remove('setup-selected'));
    // 找到匹配的按钮
    btns.forEach(b => {
        const text = b.textContent.trim();
        const matchMap = {
            '5': 5, '15': 15, '30': 30, '60': 60, '120': 120,
            '高': 'high', '中': 'medium', '低': 'low'
        };
        if (matchMap[text] === val || matchMap[text] === String(val)) {
            b.classList.add('setup-selected');
        }
    });
}

function updateSetupSummary() {
    const s = window._taskSetup;
    const energy = GameEngine.calcEnergyConsumption(s.duration);
    const spirit = GameEngine.calcSpiritCost(s.interest);
    const el = document.getElementById('setup-summary');
    if (el) {
        let text = `体力消耗: ${energy}`;
        if (spirit > 0) text += ` | 精力消耗: ${spirit}`;
        else text += ` | 精力恢复: ${Math.abs(spirit)}`;
        if (s.importance === 'high' && s.interest === 'low') text += ' | ⚡黑狗任务';
        el.textContent = text;
    }
}

function cancelTaskSetup() {
    const el = document.getElementById('task-setup-overlay');
    if (el) el.remove();
    window._taskSetup = null;
}

function confirmTaskStart(id) {
    const task = GameState.dailyTasks.find(t => t.id === id);
    if (!task || !window._taskSetup) return;

    // 应用设置
    task.duration = window._taskSetup.duration;
    task.importance = window._taskSetup.importance;
    task.interest = window._taskSetup.interest;

    const el = document.getElementById('task-setup-overlay');
    if (el) el.remove();
    window._taskSetup = null;

    // 检查体力/精力
    const energyCost = GameEngine.calcEnergyConsumption(task.duration);
    const spiritCost = GameEngine.calcSpiritCost(task.interest);

    if (GameState.stats.energy < energyCost) {
        addMessage('god', `体力不足（需要${energyCost}，当前${GameState.stats.energy}）。休息一下。`);
        return;
    }
    if (spiritCost > 0 && GameState.stats.spirit < spiritCost) {
        addMessage('god', `精力不足（需要${spiritCost}，当前${GameState.stats.spirit}）。先做点感兴趣的事。`);
        return;
    }

    // 开始计时
    activeTimerTask = task;
    task.timerStarted = Date.now();
    timerPaused = false;
    timerPausedTotal = 0;
    timerPauseStart = 0;
    saveGame();

    showTimerOverlay();
}

function showTimerOverlay() {
    const task = activeTimerTask;
    if (!task) return;

    const overlay = document.createElement('div');
    overlay.id = 'timer-overlay';
    overlay.className = 'timer-overlay';
    overlay.innerHTML = `
        <div class="timer-content">
            <h2 class="timer-task-name">${task.name}</h2>
            <div class="timer-display" id="timer-clock">00:00</div>
            <div class="timer-progress-bar">
                <div class="timer-progress-fill" id="timer-progress"></div>
            </div>
            <p class="timer-target">计划时长：${task.duration || 30} 分钟</p>
            <div class="timer-buttons">
                <button class="r8-btn r8-btn--secondary" id="timer-pause-btn" onclick="toggleTimerPause()">暂停</button>
                <button class="r8-btn r8-btn--danger" onclick="abandonTask()">放弃</button>
                <button class="r8-btn r8-btn--primary" onclick="finishTask()">完成</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    timerInterval = setInterval(updateTimerDisplay, 1000);
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const clock = document.getElementById('timer-clock');
    const progress = document.getElementById('timer-progress');
    if (!clock || !activeTimerTask) return;

    const elapsed = getTimerElapsed();
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    clock.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const target = (activeTimerTask.duration || 30) * 60;
    const pct = Math.min((elapsed / target) * 100, 100);
    if (progress) progress.style.width = pct + '%';
}

function getTimerElapsed() {
    if (!activeTimerTask || !activeTimerTask.timerStarted) return 0;
    const now = Date.now();
    const pauseExtra = timerPaused && timerPauseStart ? (now - timerPauseStart) : 0;
    return Math.floor((now - activeTimerTask.timerStarted - timerPausedTotal - pauseExtra) / 1000);
}

function toggleTimerPause() {
    const btn = document.getElementById('timer-pause-btn');
    if (timerPaused) {
        timerPausedTotal += Date.now() - timerPauseStart;
        timerPauseStart = 0;
        timerPaused = false;
        if (btn) btn.textContent = '暂停';
    } else {
        timerPauseStart = Date.now();
        timerPaused = true;
        if (btn) btn.textContent = '继续';
    }
}

function abandonTask() {
    clearInterval(timerInterval);
    timerInterval = null;
    if (activeTimerTask) {
        activeTimerTask.timerStarted = null;
        saveGame();
    }
    activeTimerTask = null;
    removeTimerOverlay();
    addMessage('god', '任务已放弃。');
    renderTasks();
}

function finishTask() {
    clearInterval(timerInterval);
    timerInterval = null;
    const elapsed = getTimerElapsed();
    removeTimerOverlay();
    showRatingOverlay(elapsed);
}

function removeTimerOverlay() {
    const el = document.getElementById('timer-overlay');
    if (el) el.remove();
}

function showRatingOverlay(elapsedSeconds) {
    const task = activeTimerTask;
    if (!task) return;

    const mins = Math.floor(elapsedSeconds / 60);

    const overlay = document.createElement('div');
    overlay.id = 'rating-overlay';
    overlay.className = 'timer-overlay';
    overlay.innerHTML = `
        <div class="timer-content">
            <h2 class="timer-task-name">${task.name}</h2>
            <p class="timer-target">用时 ${mins} 分钟</p>
            <p style="margin: 16px 0; color: var(--text-main);">完成质量如何？</p>
            <div class="rating-stars">
                <button class="r8-btn r8-btn--secondary" onclick="submitRating(1)">★</button>
                <button class="r8-btn r8-btn--secondary" onclick="submitRating(2)">★★</button>
                <button class="r8-btn r8-btn--secondary" onclick="submitRating(3)">★★★</button>
                <button class="r8-btn r8-btn--secondary" onclick="submitRating(4)">★★★★</button>
                <button class="r8-btn r8-btn--secondary" onclick="submitRating(5)">★★★★★</button>
            </div>
        </div>
    `;
    overlay.dataset.elapsed = elapsedSeconds;
    document.body.appendChild(overlay);
}

function submitRating(rating) {
    const overlay = document.getElementById('rating-overlay');
    const elapsedSeconds = overlay ? parseInt(overlay.dataset.elapsed) : 0;
    if (overlay) overlay.remove();

    const task = activeTimerTask;
    if (!task) return;

    const actualMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    const result = GameEngine.completeTask(GameState, task, rating, actualMinutes);

    if (!result.success) {
        addMessage('god', `完成失败：${result.reason}`);
        activeTimerTask = null;
        renderTasks();
        return;
    }

    const r = result.rewards;
    let msg = `「${task.name}」完成（${rating}星，${actualMinutes}分钟）。+${r.sawdust}木屑 +${r.flame}火苗 -${r.energyCost}体力`;
    if (r.spiritCost > 0) msg += ` -${r.spiritCost}精力`;
    if (r.spiritCost < 0) msg += ` +${Math.abs(r.spiritCost)}精力`;
    if (result.isBlackDog) msg += ` [黑狗征服者 x${result.combo}]`;
    addMessage('god', msg);

    if (window.Analytics) Analytics.trackTaskComplete(task.name, actualMinutes, rating, r);

    activeTimerTask = null;
    updateResources();
    saveGame();
    renderTasks();
}

function deleteTask(id) {
    GameState.dailyTasks = GameState.dailyTasks.filter(t => t.id !== id);
    saveGame();
    renderTasks();
}

function renderTasks() {
    const tasks = GameState.dailyTasks;

    const daily = tasks.filter(t => t.type === 'daily' || !t.type);
    const side = tasks.filter(t => t.type === 'side');
    const main = tasks.filter(t => t.type === 'main');

    renderTaskList('task-list-daily', daily, '在战友陵墓中添加任务');
    renderTaskList('task-list-side', side, '在战友陵墓中添加任务');
    renderTaskList('task-list-main', main, '在战友陵墓中添加任务');

    if (window.TaskSystem) TaskSystem.render();
}

function renderTaskList(containerId, tasks, hint) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (tasks.length === 0) {
        container.innerHTML = `<div class="empty-tasks"><p class="hint">${hint}</p></div>`;
        return;
    }

    container.innerHTML = tasks.map(t => {
        const status = t.done ? '✅' : '⬜';
        let extra = '';
        if (t.type === 'daily' && t.streak > 0) extra = `<span class="task-streak">🔥${t.streak}</span>`;
        if (t.type === 'side' && t.deadline) {
            const daysLeft = Math.ceil((new Date(t.deadline) - new Date()) / 86400000);
            extra = `<span class="task-deadline">${daysLeft <= 0 ? '逾期' : daysLeft + '天'}</span>`;
        }
        if (t.type === 'main' && t.milestones && t.milestones.length > 0) {
            extra = `<span class="task-progress">${t.currentMilestone || 0}/${t.milestones.length}</span>`;
        }
        return `
            <div class="task-item ${t.done ? 'done' : ''}" onclick="toggleTask(${t.id})">
                <span>${status}</span>
                <span class="task-name">${t.name}</span>
                ${extra}
                ${!t.done ? `<span class="task-delete" onclick="event.stopPropagation(); deleteTask(${t.id})">✕</span>` : ''}
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
    const tasks = GameState.dailyTasks;
    const completed = tasks.filter(t => t.done).length;
    const total = tasks.length;

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

    const done = (GameState.dailyTasks || []).filter(t => t.completed).length;
    addLog(`结束第${s.totalDays - 1}天，完成${done}个任务，火苗${s.flame}，灰烬+${result.ashGain || 0}`);

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
    } else {
        addMessage('god', result.reason);
    }
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

    if (loadGame() && GameState.character) {
        enterMainScreen();
    } else {
        Opening.start();
    }
}
