/**
 * 任务系统 — 三类任务管理
 * 日常任务: 每天重复，streak连续天数，每日重置
 * 项目(主线): 里程碑制，逐步推进
 * 待办(支线): 一次性，有截止日期和紧急度
 */
var TaskSystem = (function () {

    var currentTab = 'daily';

    // ========== 添加任务（内置表单） ==========

    function addDaily() {
        showAddForm('daily', '添加日常任务', [
            { id: 'name', label: '任务名称', type: 'text', placeholder: '如：跑步、阅读、冥想...' },
            { id: 'duration', label: '每天计划时长（分钟）', type: 'number', value: '30' },
            { id: 'importance', label: '重要性', type: 'select', options: [['high', '高'], ['medium', '中'], ['low', '低']], value: 'medium' },
            { id: 'interest', label: '兴趣度', type: 'select', options: [['high', '高'], ['medium', '中'], ['low', '低']], value: 'medium' },
        ], function (data) {
            if (!data.name) return;
            var task = {
                id: Date.now(),
                name: data.name,
                type: 'daily',
                duration: parseInt(data.duration) || 30,
                importance: data.importance || 'medium',
                interest: data.interest || 'medium',
                streak: 0,
                lastCompleted: null,
                completed: false,
                createdAt: new Date().toISOString(),
            };
            GameState.dailyTasks.push(task);
            addLog('创建日常任务「' + data.name + '」');
            saveGame();
            render();
        });
    }

    function addProject() {
        showAddForm('project', '添加项目', [
            { id: 'name', label: '项目名称', type: 'text', placeholder: '如：毕业论文' },
            { id: 'deadline', label: '截止日期（可留空）', type: 'text', placeholder: '2026-07-01' },
            { id: 'milestones', label: '里程碑节点（逗号分隔）', type: 'text', placeholder: '大纲, 初稿, 修改, 定稿' },
            { id: 'importance', label: '重要性', type: 'select', options: [['high', '高'], ['medium', '中'], ['low', '低']], value: 'medium' },
            { id: 'interest', label: '兴趣度', type: 'select', options: [['high', '高'], ['medium', '中'], ['low', '低']], value: 'medium' },
        ], function (data) {
            if (!data.name) return;
            var milestones = [];
            if (data.milestones && data.milestones.trim()) {
                milestones = data.milestones.split(/[,，]/).map(function (s, i) {
                    return { id: i, name: s.trim(), completed: false, completedAt: null };
                }).filter(function (m) { return m.name; });
            }
            if (milestones.length === 0) {
                milestones = [{ id: 0, name: '完成', completed: false, completedAt: null }];
            }
            var project = {
                id: Date.now(),
                name: data.name,
                type: 'project',
                deadline: data.deadline || null,
                importance: data.importance || 'medium',
                interest: data.interest || 'medium',
                milestones: milestones,
                currentMilestone: 0,
                completed: false,
                createdAt: new Date().toISOString(),
            };
            if (!GameState.projects) GameState.projects = [];
            GameState.projects.push(project);
            addLog('创建项目「' + data.name + '」（' + milestones.length + '个里程碑）');
            saveGame();
            render();
        });
    }

    function addTodo() {
        showAddForm('todo', '添加待办', [
            { id: 'name', label: '待办名称', type: 'text', placeholder: '如：回邮件、买东西...' },
            { id: 'deadline', label: '截止日期（可留空）', type: 'text', placeholder: '2026-07-01' },
            { id: 'duration', label: '预计时长（分钟）', type: 'number', value: '60' },
            { id: 'importance', label: '重要性', type: 'select', options: [['high', '高'], ['medium', '中'], ['low', '低']], value: 'medium' },
            { id: 'interest', label: '兴趣度', type: 'select', options: [['high', '高'], ['medium', '中'], ['low', '低']], value: 'medium' },
        ], function (data) {
            if (!data.name) return;
            var todo = {
                id: Date.now(),
                name: data.name,
                type: 'todo',
                deadline: data.deadline || null,
                duration: parseInt(data.duration) || 60,
                importance: data.importance || 'medium',
                interest: data.interest || 'medium',
                completed: false,
                createdAt: new Date().toISOString(),
            };
            if (!GameState.todos) GameState.todos = [];
            GameState.todos.push(todo);
            addLog('创建待办「' + data.name + '」');
            saveGame();
            render();
        });
    }

    // ========== 内置表单 Overlay ==========

    function showAddForm(mode, title, fields, onConfirm) {
        var html = '<div class="timer-content task-form-content">';
        html += '<h2 class="timer-task-name">' + title + '</h2>';
        html += '<div class="task-form-fields">';

        for (var i = 0; i < fields.length; i++) {
            var f = fields[i];
            html += '<div class="task-form-field">';
            html += '<label class="task-form-label">' + f.label + '</label>';
            if (f.type === 'text' || f.type === 'number') {
                html += '<input class="r8-input task-form-input" id="tf-' + f.id + '" type="' + f.type + '"'
                    + ' placeholder="' + (f.placeholder || '') + '"'
                    + ' value="' + (f.value || '') + '">';
            } else if (f.type === 'select') {
                html += '<div class="task-form-select" id="tf-' + f.id + '">';
                for (var j = 0; j < f.options.length; j++) {
                    var opt = f.options[j];
                    var sel = opt[0] === f.value ? ' task-form-opt-active' : '';
                    html += '<button type="button" class="r8-btn r8-btn--secondary r8-btn--sm task-form-opt' + sel + '" data-value="' + opt[0] + '" onclick="TaskSystem._selectOpt(this)">' + opt[1] + '</button>';
                }
                html += '</div>';
            }
            html += '</div>';
        }

        html += '</div>';
        html += '<div class="timer-buttons">';
        html += '<button class="r8-btn r8-btn--secondary" onclick="TaskSystem._closeForm()">取消</button>';
        html += '<button class="r8-btn r8-btn--primary" onclick="TaskSystem._submitForm()">确认</button>';
        html += '</div></div>';

        var overlay = document.createElement('div');
        overlay.id = 'task-form-overlay';
        overlay.className = 'timer-overlay';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);

        window._formState = { fields: fields, onConfirm: onConfirm };

        setTimeout(function () {
            var firstInput = overlay.querySelector('input');
            if (firstInput) firstInput.focus();
        }, 100);
    }

    function _selectOpt(btn) {
        var parent = btn.parentElement;
        var btns = parent.querySelectorAll('.task-form-opt');
        btns.forEach(function (b) { b.classList.remove('task-form-opt-active'); });
        btn.classList.add('task-form-opt-active');
    }

    function _closeForm() {
        var el = document.getElementById('task-form-overlay');
        if (el) el.remove();
        window._formState = null;
    }

    function _submitForm() {
        var state = window._formState;
        if (!state) return;

        var data = {};
        for (var i = 0; i < state.fields.length; i++) {
            var f = state.fields[i];
            if (f.type === 'text' || f.type === 'number') {
                var input = document.getElementById('tf-' + f.id);
                data[f.id] = input ? input.value.trim() : '';
            } else if (f.type === 'select') {
                var container = document.getElementById('tf-' + f.id);
                var active = container ? container.querySelector('.task-form-opt-active') : null;
                data[f.id] = active ? active.dataset.value : f.value;
            }
        }

        _closeForm();
        state.onConfirm(data);
    }

    // ========== 完成任务 ==========

    function completeDaily(id) {
        var task = GameState.dailyTasks.find(function (t) { return t.id === id; });
        if (!task || task.completed) return;
        showCompleteOverlay(task, 'daily');
    }

    function completeMilestone(projectId) {
        var projects = GameState.projects || [];
        var project = projects.find(function (p) { return p.id === projectId; });
        if (!project || project.completed) return;

        var ms = project.milestones[project.currentMilestone];
        if (!ms) return;

        showMilestoneProgressOverlay(project, ms);
    }

    function showMilestoneProgressOverlay(project, ms) {
        var currentProgress = ms.progress || 0;
        var overlay = document.createElement('div');
        overlay.id = 'milestone-progress-overlay';
        overlay.className = 'timer-overlay';
        overlay.innerHTML =
            '<div class="timer-content">' +
            '<h2 class="timer-task-name">' + project.name + '</h2>' +
            '<p style="color:var(--text-bright);margin:8px 0;">里程碑：' + ms.name + '</p>' +
            '<p style="color:var(--text-main);font-size:12px;">当前进度：' + currentProgress + '%</p>' +
            '<div class="quick-complete-form">' +
            '<div class="qc-field"><label>更新进度到（%）</label>' +
            '<div class="qc-duration-btns">' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="TaskSystem._setMsProgress(25)">25%</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="TaskSystem._setMsProgress(50)">50%</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="TaskSystem._setMsProgress(75)">75%</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="TaskSystem._setMsProgress(100)">100%</button>' +
            '</div>' +
            '<input type="number" id="ms-progress-input" class="r8-input" style="margin-top:8px;width:120px;" min="' + currentProgress + '" max="100" value="' + Math.min(currentProgress + 25, 100) + '" placeholder="0-100">' +
            '</div>' +
            '<div class="qc-field"><label>今天花了多少分钟</label>' +
            '<div class="qc-duration-btns">' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="TaskSystem._setMsMinutes(15)">15</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm qc-selected" onclick="TaskSystem._setMsMinutes(30)">30</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="TaskSystem._setMsMinutes(60)">60</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="TaskSystem._setMsMinutes(120)">120</button>' +
            '</div></div>' +
            '</div>' +
            '<div class="timer-buttons">' +
            '<button class="r8-btn r8-btn--secondary" onclick="TaskSystem._cancelMsProgress()">取消</button>' +
            '<button class="r8-btn r8-btn--primary" onclick="TaskSystem._confirmMsProgress()">提交进度</button>' +
            '</div></div>';
        document.body.appendChild(overlay);
        window._msState = { project: project, ms: ms, minutes: 30 };
    }

    function _setMsProgress(val) {
        var input = document.getElementById('ms-progress-input');
        if (input) input.value = val;
    }

    function _setMsMinutes(val) {
        if (window._msState) window._msState.minutes = val;
        var btns = document.querySelectorAll('#milestone-progress-overlay .qc-duration-btns:last-of-type .r8-btn');
        btns.forEach(function (b) { b.classList.remove('qc-selected'); });
        btns.forEach(function (b) { if (b.textContent.trim() === String(val)) b.classList.add('qc-selected'); });
    }

    function _cancelMsProgress() {
        var el = document.getElementById('milestone-progress-overlay');
        if (el) el.remove();
        window._msState = null;
    }

    function _confirmMsProgress() {
        var s = window._msState;
        if (!s) return;
        var input = document.getElementById('ms-progress-input');
        var newProgress = parseInt(input ? input.value : 0);
        if (isNaN(newProgress) || newProgress < (s.ms.progress || 0)) {
            alert('进度不能倒退');
            return;
        }
        newProgress = Math.min(100, Math.max(0, newProgress));

        var el = document.getElementById('milestone-progress-overlay');
        if (el) el.remove();
        window._msState = null;

        var minutes = s.minutes || 30;
        var energyCost = calcEnergyCost(minutes);
        if (GameState.stats.energy < energyCost) {
            showResourceWarning('体力不足', energyCost, GameState.stats.energy, '体力');
            return;
        }
        var spiritChange = calcSpiritChange(s.project.interest, minutes);
        if (spiritChange < 0 && GameState.stats.spirit < Math.abs(spiritChange)) {
            showResourceWarning('精力不足', Math.abs(spiritChange), GameState.stats.spirit, '精力');
            return;
        }

        var oldProgress = s.ms.progress || 0;
        s.ms.progress = newProgress;
        var progressDelta = newProgress - oldProgress;

        // 里程碑完成
        if (newProgress >= 100) {
            s.ms.completed = true;
            s.ms.completedAt = new Date().toISOString();
            s.project.currentMilestone++;

            var isProjectComplete = s.project.currentMilestone >= s.project.milestones.length;
            if (isProjectComplete) s.project.completed = true;

            var sawdust = isProjectComplete ? 200 : 60;
            var flame = applyFlameModifiers(isProjectComplete ? 100 : 40);
            var bd = applyBlackDogBonus(sawdust, flame, s.project);
            sawdust = bd.sawdust; flame = bd.flame; var blackDog = bd.blackDog;

            GameState.stats.sawdust += sawdust;
            GameState.stats.flame += flame;
            GameState.stats.energy = Math.max(0, GameState.stats.energy - calcEnergyCost(minutes));
            GameState.stats.spirit = adjustSpirit(GameState.stats.spirit, s.project.interest, minutes);

            var logText = isProjectComplete
                ? '完成项目「' + s.project.name + '」！+' + sawdust + '木屑 +' + flame + '火苗'
                : '完成里程碑「' + s.ms.name + '」+' + sawdust + '木屑 +' + flame + '火苗';
            addLog(logText);

            saveGame();
            updateResources();
            render();
            renderTasks();

            if (window.GameFeedback) {
                if (isProjectComplete) {
                    GameFeedback.onProjectComplete(s.project, sawdust, flame, energyCost, spiritChange, blackDog, GameState.blackDogCombo || 0);
                } else {
                    GameFeedback.onMilestoneComplete(s.project, s.ms, sawdust, flame, energyCost, spiritChange, blackDog, GameState.blackDogCombo || 0);
                }
            }
        } else {
            // 未完成，给予进度奖励
            var reward = Math.round(progressDelta * 0.5);
            var flameReward = applyFlameModifiers(Math.round(progressDelta * 0.3));
            GameState.stats.sawdust += reward;
            GameState.stats.flame += flameReward;
            GameState.stats.energy = Math.max(0, GameState.stats.energy - calcEnergyCost(minutes));
            GameState.stats.spirit = adjustSpirit(GameState.stats.spirit, s.project.interest, minutes);

            addLog('推进「' + s.project.name + '」里程碑「' + s.ms.name + '」进度 ' + oldProgress + '%→' + newProgress + '% +' + reward + '木屑 +' + flameReward + '火苗');

            saveGame();
            updateResources();
            render();
            renderTasks();

            if (window.GameFeedback) {
                GameFeedback.onMilestoneProgress(s.project, s.ms, reward, flameReward, energyCost, spiritChange, oldProgress, newProgress);
            }
        }
    }

    function completeTodo(id) {
        var todos = GameState.todos || [];
        var todo = todos.find(function (t) { return t.id === id; });
        if (!todo || todo.completed) return;
        showCompleteOverlay(todo, 'todo');
    }

    function showCompleteOverlay(item, mode) {
        var title = mode === 'milestone'
            ? item.name + ' — 里程碑：' + item.milestones[item.currentMilestone].name
            : item.name;

        var overlay = document.createElement('div');
        overlay.id = 'task-complete-overlay';
        overlay.className = 'timer-overlay';
        overlay.innerHTML =
            '<div class="timer-content">' +
            '<h2 class="timer-task-name">' + title + '</h2>' +
            (isBlackDogTask(item) ? '<p class="qc-blackdog-hint">黑狗任务 — 高重要·低兴趣</p>' : '') +
            '<div class="quick-complete-form">' +
            '<div class="qc-field"><label>实际用时（分钟）</label>' +
            '<div class="qc-duration-btns">' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="TaskSystem._setQc(\'duration\',5)">5</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="TaskSystem._setQc(\'duration\',15)">15</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm qc-selected" onclick="TaskSystem._setQc(\'duration\',30)">30</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="TaskSystem._setQc(\'duration\',60)">60</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="TaskSystem._setQc(\'duration\',120)">120</button>' +
            '</div></div>' +
            '<div class="qc-field"><label>完成质量</label>' +
            '<div class="qc-rating-btns">' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="TaskSystem._setQc(\'rating\',1)">★</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="TaskSystem._setQc(\'rating\',2)">★★</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm qc-selected" onclick="TaskSystem._setQc(\'rating\',3)">★★★</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="TaskSystem._setQc(\'rating\',4)">★★★★</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="TaskSystem._setQc(\'rating\',5)">★★★★★</button>' +
            '</div></div>' +
            '</div>' +
            '<div class="timer-buttons">' +
            '<button class="r8-btn r8-btn--secondary" onclick="TaskSystem._cancelComplete()">取消</button>' +
            '<button class="r8-btn r8-btn--primary" onclick="TaskSystem._confirmComplete()">确认完成</button>' +
            '</div></div>';
        document.body.appendChild(overlay);
        window._qcState = { duration: 30, rating: 3, item: item, mode: mode };
    }

    function _setQc(field, val) {
        if (!window._qcState) return;
        window._qcState[field] = val;
        var cls = field === 'duration' ? '.qc-duration-btns' : '.qc-rating-btns';
        var btns = document.querySelectorAll(cls + ' .r8-btn');
        btns.forEach(function (b, i) {
            if (field === 'duration') {
                b.classList.toggle('qc-selected', parseInt(b.textContent) === val);
            } else {
                b.classList.toggle('qc-selected', i + 1 === val);
            }
        });
    }

    function _cancelComplete() {
        var el = document.getElementById('task-complete-overlay');
        if (el) el.remove();
        window._qcState = null;
    }

    function _confirmComplete() {
        var s = window._qcState;
        if (!s) return;
        var el = document.getElementById('task-complete-overlay');
        if (el) el.remove();

        var minutes = s.duration;
        var rating = s.rating;
        var item = s.item;
        var mode = s.mode;
        window._qcState = null;

        if (mode === 'daily') {
            finishDaily(item, minutes, rating);
        } else if (mode === 'todo') {
            finishTodo(item, minutes, rating);
        }
    }

    function finishDaily(task, minutes, rating) {
        var energyCost = calcEnergyCost(minutes);
        if (GameState.stats.energy < energyCost) {
            showResourceWarning('体力不足', energyCost, GameState.stats.energy, '体力');
            return;
        }
        var spiritChange = calcSpiritChange(task.interest, minutes);
        if (spiritChange < 0 && GameState.stats.spirit < Math.abs(spiritChange)) {
            showResourceWarning('精力不足', Math.abs(spiritChange), GameState.stats.spirit, '精力');
            return;
        }

        var today = new Date().toISOString().split('T')[0];
        var yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        if (task.lastCompleted === yesterday) {
            task.streak = (task.streak || 0) + 1;
        } else if (task.lastCompleted !== today) {
            task.streak = 1;
        }
        task.lastCompleted = today;
        task.completed = true;

        var sawdust = calcDailyReward(task, minutes, rating);
        var flame = applyFlameModifiers(Math.round(sawdust * 0.5));
        var bd = applyBlackDogBonus(sawdust, flame, task);
        sawdust = bd.sawdust; flame = bd.flame; var blackDog = bd.blackDog;

        GameState.stats.sawdust += sawdust;
        GameState.stats.flame += flame;
        GameState.stats.energy = Math.max(0, GameState.stats.energy - calcEnergyCost(minutes));
        GameState.stats.spirit = adjustSpirit(GameState.stats.spirit, task.interest, minutes);

        addLog('完成日常「' + task.name + '」' + minutes + '分钟 ' + rating + '星 +' + sawdust + '木屑 +' + flame + '火苗' + (blackDog ? ' [黑狗征服者x' + GameState.blackDogCombo + ']' : ''));
        saveGame();
        updateResources();
        render();
        renderTasks();

        if (window.GameFeedback) {
            GameFeedback.onDailyComplete(task, sawdust, flame, calcEnergyCost(minutes), spiritChange, blackDog, GameState.blackDogCombo || 0);
        }
    }

    function finishTodo(todo, minutes, rating) {
        var energyCost = calcEnergyCost(minutes);
        if (GameState.stats.energy < energyCost) {
            showResourceWarning('体力不足', energyCost, GameState.stats.energy, '体力');
            return;
        }
        var spiritChange = calcSpiritChange(todo.interest, minutes);
        if (spiritChange < 0 && GameState.stats.spirit < Math.abs(spiritChange)) {
            showResourceWarning('精力不足', Math.abs(spiritChange), GameState.stats.spirit, '精力');
            return;
        }

        todo.completed = true;
        todo.completedAt = new Date().toISOString();

        var baseFlame = 10;
        var flame = applyFlameModifiers(Math.round(baseFlame * (rating / 3)));
        var sawdust = Math.round(flame * 1.5);
        var bd = applyBlackDogBonus(sawdust, flame, todo);
        sawdust = bd.sawdust; flame = bd.flame; var blackDog = bd.blackDog;

        GameState.stats.sawdust += sawdust;
        GameState.stats.flame += flame;
        GameState.stats.energy = Math.max(0, GameState.stats.energy - calcEnergyCost(minutes));
        GameState.stats.spirit = adjustSpirit(GameState.stats.spirit, todo.interest, minutes);

        addLog('完成待办「' + todo.name + '」+' + sawdust + '木屑 +' + flame + '火苗' + (blackDog ? ' [黑狗征服者]' : ''));
        saveGame();
        updateResources();
        render();

        if (window.GameFeedback) {
            GameFeedback.onTodoComplete(todo, sawdust, flame, calcEnergyCost(minutes), spiritChange, blackDog, GameState.blackDogCombo || 0);
        }
    }

    // ========== 计算工具 ==========

    function showResourceWarning(title, required, current, label) {
        var overlay = document.createElement('div');
        overlay.id = 'resource-warning-overlay';
        overlay.className = 'timer-overlay';
        overlay.innerHTML =
            '<div class="timer-content">' +
            '<h2 class="timer-task-name" style="color:#ff6644;">' + title + '</h2>' +
            '<p style="color:var(--text-main);margin:12px 0;">需要 ' + required + ' ' + label + '，当前只有 ' + current + '</p>' +
            '<p style="color:var(--text-dim);font-size:11px;">休息一下，或者用商店道具恢复</p>' +
            '<div class="timer-buttons">' +
            '<button class="r8-btn r8-btn--secondary" onclick="document.getElementById(\'resource-warning-overlay\').remove()">知道了</button>' +
            '</div></div>';
        document.body.appendChild(overlay);
    }

    function applyFlameModifiers(flame) {
        if (GameState.vacation && GameState.vacation.isOnVacation) return 0;
        if (GameState.shop && GameState.shop.activeEffects.mirror) flame *= 2;
        if (GameState.shop && GameState.shop.activeEffects.oxygenChamber) flame *= 2;
        return Math.round(flame);
    }

    function applyBlackDogBonus(sawdust, flame, task) {
        if (!isBlackDogTask(task)) {
            GameState.blackDogCombo = 0;
            return { sawdust: sawdust, flame: flame, blackDog: false };
        }
        GameState.blackDogCombo = (GameState.blackDogCombo || 0) + 1;
        GameState.blackDogTotalCompleted = (GameState.blackDogTotalCompleted || 0) + 1;
        sawdust *= 2;
        flame *= 2;
        var comboBonus = Math.min((GameState.blackDogCombo - 1) * 0.25, 0.75);
        flame = Math.round(flame * (1 + comboBonus));
        return { sawdust: sawdust, flame: flame, blackDog: true };
    }

    function isBlackDogTask(task) {
        return task && task.importance === 'high' && task.interest === 'low';
    }

    function calcDailyReward(task, minutes, rating) {
        var base = 10;
        var timeRatio = minutes / (task.duration || 30);
        var reward = Math.round(base * (rating / 5));
        if (timeRatio < 1) reward = Math.round(reward * (1 + (1 - timeRatio)));
        return Math.max(reward, 1);
    }

    function calcEnergyCost(minutes) {
        return Math.max(1, Math.round((minutes / 480) * 100));
    }

    function calcSpiritChange(interest, minutes) {
        if (interest === 'high') return Math.round(minutes * 0.3);
        if (interest === 'low') return -Math.round(minutes * 0.3);
        return 0;
    }

    function adjustSpirit(current, interest, minutes) {
        if (interest === 'high') return Math.min(100, current + Math.round(minutes * 0.3));
        if (interest === 'low') return Math.max(0, current - Math.round(minutes * 0.3));
        return current;
    }

    // ========== 删除 ==========

    function removeDaily(id) {
        GameState.dailyTasks = GameState.dailyTasks.filter(function (t) { return t.id !== id; });
        saveGame(); render();
    }

    function removeProject(id) {
        GameState.projects = (GameState.projects || []).filter(function (p) { return p.id !== id; });
        saveGame(); render();
    }

    function removeTodo(id) {
        GameState.todos = (GameState.todos || []).filter(function (t) { return t.id !== id; });
        saveGame(); render();
    }

    // ========== UI 渲染 ==========

    function switchTab(tab) {
        currentTab = tab;
        render();
    }

    function render() {
        var container = document.getElementById('tomb-task-list');
        if (!container) return;

        var tabsHtml =
            '<div class="tomb-tabs">' +
            '<button class="tomb-tab' + (currentTab === 'daily' ? ' tomb-tab-active' : '') + '" onclick="TaskSystem.switchTab(\'daily\')">日常</button>' +
            '<button class="tomb-tab' + (currentTab === 'project' ? ' tomb-tab-active' : '') + '" onclick="TaskSystem.switchTab(\'project\')">项目</button>' +
            '<button class="tomb-tab' + (currentTab === 'todo' ? ' tomb-tab-active' : '') + '" onclick="TaskSystem.switchTab(\'todo\')">待办</button>' +
            '</div>';

        var contentHtml = '';
        if (currentTab === 'daily') contentHtml = renderDailyList();
        else if (currentTab === 'project') contentHtml = renderProjectList();
        else contentHtml = renderTodoList();

        container.innerHTML = tabsHtml + contentHtml;
    }

    function renderDailyList() {
        var tasks = (GameState.dailyTasks || []).filter(function (t) { return t.type === 'daily'; });
        var html = '<div class="tomb-add-row"><button class="r8-btn r8-btn--primary r8-btn--sm" onclick="TaskSystem.addDaily()">+ 添加日常</button></div>';

        if (tasks.length === 0) {
            return html + '<p class="tomb-empty">还没有日常任务。</p>';
        }

        tasks.forEach(function (t) {
            var attrs = attrBadge(t);
            var streak = t.streak > 0 ? '<span class="tomb-streak">🔥' + t.streak + '天</span>' : '';
            var status = t.completed ? '<span class="tomb-done-badge">✓ 今日已完成</span>' : '';
            html +=
                '<div class="tomb-task-item' + (t.completed ? ' tomb-task-done' : '') + '">' +
                '<div class="tomb-task-main">' +
                '<span class="tomb-task-name">' + t.name + '</span>' +
                attrs + streak + status +
                '</div>' +
                '<div class="tomb-task-meta">' + t.duration + '分钟/天</div>' +
                '<div class="tomb-task-actions">' +
                (!t.completed ? '<button class="r8-btn r8-btn--primary r8-btn--sm" onclick="TaskSystem.completeDaily(' + t.id + ')">完成</button>' : '') +
                '<button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="TaskSystem.editDaily(' + t.id + ')">编辑</button>' +
                '<button class="r8-btn r8-btn--danger r8-btn--sm tomb-del-btn" onclick="TaskSystem.removeDaily(' + t.id + ')">✕</button>' +
                '</div></div>';
        });
        return html;
    }

    function renderProjectList() {
        var allProjects = GameState.projects || [];
        var projects = allProjects.filter(function (p) { return !p.completed; });
        var completed = allProjects.filter(function (p) { return p.completed; });
        var html = '<div class="tomb-add-row"><button class="r8-btn r8-btn--primary r8-btn--sm" onclick="TaskSystem.addProject()">+ 添加项目</button></div>';

        if (projects.length === 0 && completed.length === 0) {
            return html + '<p class="tomb-empty">还没有进行中的项目。</p>';
        }

        // 排序：逾期 > 截止日近 > 高重要 > 无截止
        projects.sort(function (a, b) {
            return todoSortScore(a) - todoSortScore(b);
        });

        projects.forEach(function (p) {
            var ms = p.milestones[p.currentMilestone];
            var progress = p.currentMilestone + '/' + p.milestones.length;
            var msProgress = ms && ms.progress ? ms.progress + '%' : '0%';
            var attrs = attrBadge(p);
            var deadlineStr = p.deadline ? '<span class="tomb-deadline">' + daysUntil(p.deadline) + '</span>' : '';
            html +=
                '<div class="tomb-task-item">' +
                '<div class="tomb-task-main">' +
                '<span class="tomb-task-name">' + p.name + '</span>' +
                attrs + deadlineStr +
                '</div>' +
                '<div class="tomb-task-meta">节点 ' + progress + (ms ? ' · ' + ms.name + '（' + msProgress + '）' : '') + '</div>' +
                '<div class="tomb-task-actions">' +
                (ms ? '<button class="r8-btn r8-btn--primary r8-btn--sm" onclick="TaskSystem.completeMilestone(' + p.id + ')">更新进度</button>' : '') +
                '<button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="TaskSystem.editProject(' + p.id + ')">编辑</button>' +
                '<button class="r8-btn r8-btn--danger r8-btn--sm tomb-del-btn" onclick="TaskSystem.removeProject(' + p.id + ')">✕</button>' +
                '</div></div>';
        });

        html += renderCompletedSection(completed, 'project');
        return html;
    }

    function renderTodoList() {
        var allTodos = GameState.todos || [];
        var todos = allTodos.filter(function (t) { return !t.completed; });
        var completed = allTodos.filter(function (t) { return t.completed; });
        var html = '<div class="tomb-add-row"><button class="r8-btn r8-btn--primary r8-btn--sm" onclick="TaskSystem.addTodo()">+ 添加待办</button></div>';

        if (todos.length === 0 && completed.length === 0) {
            return html + '<p class="tomb-empty">没有待办事项。</p>';
        }

        // 排序：逾期 > 今天截止 > 高重要 > 有截止日期（按日期升序） > 无截止日期
        todos.sort(function (a, b) {
            return todoSortScore(a) - todoSortScore(b);
        });

        todos.forEach(function (t) {
            var attrs = attrBadge(t);
            var deadlineStr = t.deadline ? '<span class="tomb-deadline">' + daysUntil(t.deadline) + '</span>' : '';
            html +=
                '<div class="tomb-task-item">' +
                '<div class="tomb-task-main">' +
                '<span class="tomb-task-name">' + t.name + '</span>' +
                attrs + deadlineStr +
                '</div>' +
                '<div class="tomb-task-meta">预计 ' + t.duration + '分钟</div>' +
                '<div class="tomb-task-actions">' +
                '<button class="r8-btn r8-btn--primary r8-btn--sm" onclick="TaskSystem.completeTodo(' + t.id + ')">完成</button>' +
                '<button class="r8-btn r8-btn--secondary r8-btn--sm" onclick="TaskSystem.editTodo(' + t.id + ')">编辑</button>' +
                '<button class="r8-btn r8-btn--danger r8-btn--sm tomb-del-btn" onclick="TaskSystem.removeTodo(' + t.id + ')">✕</button>' +
                '</div></div>';
        });

        html += renderCompletedSection(completed, 'todo');
        return html;
    }

    function todoSortScore(t) {
        var score = 0;
        if (t.deadline) {
            var days = Math.ceil((new Date(t.deadline) - new Date()) / 86400000);
            if (days < 0) score = -1000 + days; // 逾期的排最前
            else if (days === 0) score = -500;   // 今天截止
            else score = days;                    // 按剩余天数
        } else {
            score = 9999; // 无截止日期排后面
        }
        // 高重要性提前
        if (t.importance === 'high') score -= 100;
        return score;
    }

    // ========== 辅助 ==========

    function attrBadge(task) {
        var html = '';
        if (task.importance === 'high' && task.interest === 'low') {
            html += '<span class="tomb-badge tomb-badge-blackdog">黑狗</span>';
        } else if (task.importance === 'high') {
            html += '<span class="tomb-badge tomb-badge-important">重要</span>';
        }
        return html;
    }

    function daysUntil(dateStr) {
        if (!dateStr) return '';
        var diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
        if (diff < 0) return '逾期' + Math.abs(diff) + '天';
        if (diff === 0) return '今天截止';
        return '还有' + diff + '天';
    }

    // ========== 已完成折叠区 ==========

    var completedExpanded = {};

    function renderCompletedSection(items, type) {
        if (!items || items.length === 0) return '';

        // 只保留最近 7 天完成的
        var cutoff = Date.now() - 7 * 86400000;
        var recent = items.filter(function (t) {
            var at = t.completedAt ? new Date(t.completedAt).getTime() : 0;
            return at > cutoff;
        }).sort(function (a, b) {
            return (new Date(b.completedAt || 0)).getTime() - (new Date(a.completedAt || 0)).getTime();
        });

        if (recent.length === 0) return '';

        var expanded = completedExpanded[type] || false;
        var html = '<div class="tomb-completed-section">';
        html += '<button class="tomb-completed-toggle" onclick="TaskSystem.toggleCompleted(\'' + type + '\')">';
        html += '<span class="tomb-completed-arrow">' + (expanded ? '▼' : '▶') + '</span>';
        html += '已完成（' + recent.length + '）';
        html += '</button>';

        if (expanded) {
            html += '<div class="tomb-completed-list">';
            recent.forEach(function (t) {
                var dateStr = '';
                if (t.completedAt) {
                    var d = new Date(t.completedAt);
                    dateStr = (d.getMonth() + 1) + '/' + d.getDate();
                }
                var extra = '';
                if (type === 'project') {
                    extra = ' · ' + (t.milestones ? t.milestones.length : 0) + '个里程碑';
                }
                html += '<div class="tomb-task-item tomb-task-completed">' +
                    '<div class="tomb-task-main">' +
                    '<span class="tomb-completed-check">✅</span>' +
                    '<span class="tomb-task-name">' + t.name + '</span>' +
                    '</div>' +
                    '<div class="tomb-task-meta">' + dateStr + ' 完成' + extra + '</div>' +
                    '</div>';
            });
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    function toggleCompleted(type) {
        completedExpanded[type] = !completedExpanded[type];
        render();
    }

    // ========== 编辑待办 ==========

    function editTodo(id) {
        var todos = GameState.todos || [];
        var todo = todos.find(function (t) { return t.id === id; });
        if (!todo) return;

        var overlay = document.createElement('div');
        overlay.id = 'edit-todo-overlay';
        overlay.className = 'timer-overlay';
        overlay.innerHTML =
            '<div class="timer-content task-setup-content">' +
            '<h2 class="timer-task-name">编辑待办</h2>' +
            '<div class="task-form-fields">' +
            '<div class="task-form-field"><label class="task-form-label">名称</label>' +
            '<input type="text" id="edit-todo-name" class="r8-input task-form-input" value="' + (todo.name || '') + '"></div>' +
            '<div class="task-form-field"><label class="task-form-label">截止日期（可留空）</label>' +
            '<input type="date" id="edit-todo-deadline" class="r8-input task-form-input" value="' + (todo.deadline || '') + '"></div>' +
            '<div class="task-form-field"><label class="task-form-label">预计时长（分钟）</label>' +
            '<input type="number" id="edit-todo-duration" class="r8-input task-form-input" value="' + (todo.duration || 30) + '" min="5" max="480"></div>' +
            '<div class="task-form-field"><label class="task-form-label">重要性</label>' +
            '<div class="task-form-select">' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm' + (todo.importance === 'high' ? ' task-form-opt-active' : '') + '" onclick="TaskSystem._editOpt(\'importance\',\'high\',this)">高</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm' + (todo.importance === 'medium' ? ' task-form-opt-active' : '') + '" onclick="TaskSystem._editOpt(\'importance\',\'medium\',this)">中</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm' + (todo.importance === 'low' ? ' task-form-opt-active' : '') + '" onclick="TaskSystem._editOpt(\'importance\',\'low\',this)">低</button>' +
            '</div></div>' +
            '<div class="task-form-field"><label class="task-form-label">兴趣度</label>' +
            '<div class="task-form-select">' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm' + (todo.interest === 'high' ? ' task-form-opt-active' : '') + '" onclick="TaskSystem._editOpt(\'interest\',\'high\',this)">高</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm' + (todo.interest === 'medium' ? ' task-form-opt-active' : '') + '" onclick="TaskSystem._editOpt(\'interest\',\'medium\',this)">中</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm' + (todo.interest === 'low' ? ' task-form-opt-active' : '') + '" onclick="TaskSystem._editOpt(\'interest\',\'low\',this)">低</button>' +
            '</div></div>' +
            '</div>' +
            '<div class="timer-buttons">' +
            '<button class="r8-btn r8-btn--secondary" onclick="TaskSystem._cancelEdit()">取消</button>' +
            '<button class="r8-btn r8-btn--primary" onclick="TaskSystem._confirmEdit(' + id + ')">保存</button>' +
            '</div></div>';
        document.body.appendChild(overlay);
        window._editState = { importance: todo.importance, interest: todo.interest };
    }

    function _editOpt(field, value, btn) {
        if (!window._editState) return;
        window._editState[field] = value;
        var parent = btn.parentElement;
        var btns = parent.querySelectorAll('.r8-btn');
        btns.forEach(function (b) { b.classList.remove('task-form-opt-active'); });
        btn.classList.add('task-form-opt-active');
    }

    function editDaily(id) {
        var tasks = GameState.dailyTasks || [];
        var task = tasks.find(function (t) { return t.id === id; });
        if (!task) return;

        var overlay = document.createElement('div');
        overlay.id = 'edit-todo-overlay';
        overlay.className = 'timer-overlay';
        overlay.innerHTML =
            '<div class="timer-content task-setup-content">' +
            '<h2 class="timer-task-name">编辑日常</h2>' +
            '<div class="task-form-fields">' +
            '<div class="task-form-field"><label class="task-form-label">名称</label>' +
            '<input type="text" id="edit-todo-name" class="r8-input task-form-input" value="' + (task.name || '') + '"></div>' +
            '<div class="task-form-field"><label class="task-form-label">每次时长（分钟）</label>' +
            '<input type="number" id="edit-todo-duration" class="r8-input task-form-input" value="' + (task.duration || 30) + '" min="5" max="480"></div>' +
            '<div class="task-form-field"><label class="task-form-label">重要性</label>' +
            '<div class="task-form-select">' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm' + (task.importance === 'high' ? ' task-form-opt-active' : '') + '" onclick="TaskSystem._editOpt(\'importance\',\'high\',this)">高</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm' + (task.importance === 'medium' ? ' task-form-opt-active' : '') + '" onclick="TaskSystem._editOpt(\'importance\',\'medium\',this)">中</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm' + (task.importance === 'low' ? ' task-form-opt-active' : '') + '" onclick="TaskSystem._editOpt(\'importance\',\'low\',this)">低</button>' +
            '</div></div>' +
            '<div class="task-form-field"><label class="task-form-label">兴趣度</label>' +
            '<div class="task-form-select">' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm' + (task.interest === 'high' ? ' task-form-opt-active' : '') + '" onclick="TaskSystem._editOpt(\'interest\',\'high\',this)">高</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm' + (task.interest === 'medium' ? ' task-form-opt-active' : '') + '" onclick="TaskSystem._editOpt(\'interest\',\'medium\',this)">中</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm' + (task.interest === 'low' ? ' task-form-opt-active' : '') + '" onclick="TaskSystem._editOpt(\'interest\',\'low\',this)">低</button>' +
            '</div></div>' +
            '</div>' +
            '<div class="timer-buttons">' +
            '<button class="r8-btn r8-btn--secondary" onclick="TaskSystem._cancelEdit()">取消</button>' +
            '<button class="r8-btn r8-btn--primary" onclick="TaskSystem._confirmEditDaily(' + id + ')">保存</button>' +
            '</div></div>';
        document.body.appendChild(overlay);
        window._editState = { importance: task.importance, interest: task.interest };
    }

    function _confirmEditDaily(id) {
        var tasks = GameState.dailyTasks || [];
        var task = tasks.find(function (t) { return t.id === id; });
        if (!task) return;

        var name = document.getElementById('edit-todo-name').value.trim();
        var duration = parseInt(document.getElementById('edit-todo-duration').value) || 30;
        if (!name) { alert('名称不能为空'); return; }

        task.name = name;
        task.duration = duration;
        task.importance = window._editState ? window._editState.importance : task.importance;
        task.interest = window._editState ? window._editState.interest : task.interest;

        var el = document.getElementById('edit-todo-overlay');
        if (el) el.remove();
        window._editState = null;
        saveGame();
        render();
        renderTasks();
    }

    function editProject(id) {
        var projects = GameState.projects || [];
        var project = projects.find(function (p) { return p.id === id; });
        if (!project) return;

        var overlay = document.createElement('div');
        overlay.id = 'edit-todo-overlay';
        overlay.className = 'timer-overlay';
        overlay.innerHTML =
            '<div class="timer-content task-setup-content">' +
            '<h2 class="timer-task-name">编辑项目</h2>' +
            '<div class="task-form-fields">' +
            '<div class="task-form-field"><label class="task-form-label">项目名称</label>' +
            '<input type="text" id="edit-todo-name" class="r8-input task-form-input" value="' + (project.name || '') + '"></div>' +
            '<div class="task-form-field"><label class="task-form-label">截止日期（可留空）</label>' +
            '<input type="date" id="edit-todo-deadline" class="r8-input task-form-input" value="' + (project.deadline || '') + '"></div>' +
            '<div class="task-form-field"><label class="task-form-label">重要性</label>' +
            '<div class="task-form-select">' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm' + (project.importance === 'high' ? ' task-form-opt-active' : '') + '" onclick="TaskSystem._editOpt(\'importance\',\'high\',this)">高</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm' + (project.importance === 'medium' ? ' task-form-opt-active' : '') + '" onclick="TaskSystem._editOpt(\'importance\',\'medium\',this)">中</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm' + (project.importance === 'low' ? ' task-form-opt-active' : '') + '" onclick="TaskSystem._editOpt(\'importance\',\'low\',this)">低</button>' +
            '</div></div>' +
            '<div class="task-form-field"><label class="task-form-label">兴趣度</label>' +
            '<div class="task-form-select">' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm' + (project.interest === 'high' ? ' task-form-opt-active' : '') + '" onclick="TaskSystem._editOpt(\'interest\',\'high\',this)">高</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm' + (project.interest === 'medium' ? ' task-form-opt-active' : '') + '" onclick="TaskSystem._editOpt(\'interest\',\'medium\',this)">中</button>' +
            '<button class="r8-btn r8-btn--secondary r8-btn--sm' + (project.interest === 'low' ? ' task-form-opt-active' : '') + '" onclick="TaskSystem._editOpt(\'interest\',\'low\',this)">低</button>' +
            '</div></div>' +
            '</div>' +
            '<div class="timer-buttons">' +
            '<button class="r8-btn r8-btn--secondary" onclick="TaskSystem._cancelEdit()">取消</button>' +
            '<button class="r8-btn r8-btn--primary" onclick="TaskSystem._confirmEditProject(' + id + ')">保存</button>' +
            '</div></div>';
        document.body.appendChild(overlay);
        window._editState = { importance: project.importance, interest: project.interest };
    }

    function _confirmEditProject(id) {
        var projects = GameState.projects || [];
        var project = projects.find(function (p) { return p.id === id; });
        if (!project) return;

        var name = document.getElementById('edit-todo-name').value.trim();
        var deadline = document.getElementById('edit-todo-deadline').value;
        if (!name) { alert('名称不能为空'); return; }

        project.name = name;
        project.deadline = deadline || null;
        project.importance = window._editState ? window._editState.importance : project.importance;
        project.interest = window._editState ? window._editState.interest : project.interest;

        var el = document.getElementById('edit-todo-overlay');
        if (el) el.remove();
        window._editState = null;
        saveGame();
        render();
    }

    function _cancelEdit() {
        var el = document.getElementById('edit-todo-overlay');
        if (el) el.remove();
        window._editState = null;
    }

    function _confirmEdit(id) {
        var todos = GameState.todos || [];
        var todo = todos.find(function (t) { return t.id === id; });
        if (!todo) return;

        var name = document.getElementById('edit-todo-name').value.trim();
        var deadline = document.getElementById('edit-todo-deadline').value;
        var duration = parseInt(document.getElementById('edit-todo-duration').value) || 30;

        if (!name) { alert('名称不能为空'); return; }

        todo.name = name;
        todo.deadline = deadline || null;
        todo.duration = duration;
        todo.importance = window._editState ? window._editState.importance : todo.importance;
        todo.interest = window._editState ? window._editState.interest : todo.interest;

        var el = document.getElementById('edit-todo-overlay');
        if (el) el.remove();
        window._editState = null;

        saveGame();
        render();
    }


    // ========== 每日重置 ==========

    function resetDaily() {
        var tasks = GameState.dailyTasks || [];
        tasks.forEach(function (t) {
            if (t.type === 'daily') t.completed = false;
        });
    }

    return {
        switchTab: switchTab,
        render: render,
        addDaily: addDaily,
        addProject: addProject,
        addTodo: addTodo,
        completeDaily: completeDaily,
        completeMilestone: completeMilestone,
        completeTodo: completeTodo,
        editTodo: editTodo,
        editDaily: editDaily,
        editProject: editProject,
        removeDaily: removeDaily,
        removeProject: removeProject,
        removeTodo: removeTodo,
        toggleCompleted: toggleCompleted,
        resetDaily: resetDaily,
        _setQc: _setQc,
        _cancelComplete: _cancelComplete,
        _confirmComplete: _confirmComplete,
        _selectOpt: _selectOpt,
        _closeForm: _closeForm,
        _submitForm: _submitForm,
        _setMsProgress: _setMsProgress,
        _setMsMinutes: _setMsMinutes,
        _cancelMsProgress: _cancelMsProgress,
        _confirmMsProgress: _confirmMsProgress,
        _editOpt: _editOpt,
        _cancelEdit: _cancelEdit,
        _confirmEdit: _confirmEdit,
        _confirmEditDaily: _confirmEditDaily,
        _confirmEditProject: _confirmEditProject,
    };
})();

window.TaskSystem = TaskSystem;
