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

        var oldProgress = s.ms.progress || 0;
        s.ms.progress = newProgress;
        var progressDelta = newProgress - oldProgress;
        var minutes = s.minutes || 30;

        // 里程碑完成
        if (newProgress >= 100) {
            s.ms.completed = true;
            s.ms.completedAt = new Date().toISOString();
            s.project.currentMilestone++;

            var isProjectComplete = s.project.currentMilestone >= s.project.milestones.length;
            if (isProjectComplete) s.project.completed = true;

            var sawdust = isProjectComplete ? 200 : 60;
            var flame = isProjectComplete ? 100 : 40;
            var blackDog = isBlackDogTask(s.project);
            if (blackDog) { sawdust *= 2; flame *= 2; GameState.blackDogCombo = (GameState.blackDogCombo || 0) + 1; }
            else { GameState.blackDogCombo = 0; }

            GameState.stats.sawdust += sawdust;
            GameState.stats.flame += flame;
            GameState.stats.energy = Math.max(0, GameState.stats.energy - calcEnergyCost(minutes));
            GameState.stats.spirit = adjustSpirit(GameState.stats.spirit, s.project.interest, minutes);

            var logText = isProjectComplete
                ? '完成项目「' + s.project.name + '」！+' + sawdust + '木屑 +' + flame + '火苗'
                : '完成里程碑「' + s.ms.name + '」+' + sawdust + '木屑 +' + flame + '火苗';
            addLog(logText);
        } else {
            // 未完成，给予进度奖励
            var reward = Math.round(progressDelta * 0.5);
            var flameReward = Math.round(progressDelta * 0.3);
            GameState.stats.sawdust += reward;
            GameState.stats.flame += flameReward;
            GameState.stats.energy = Math.max(0, GameState.stats.energy - calcEnergyCost(minutes));
            GameState.stats.spirit = adjustSpirit(GameState.stats.spirit, s.project.interest, minutes);

            addLog('推进「' + s.project.name + '」里程碑「' + s.ms.name + '」进度 ' + oldProgress + '%→' + newProgress + '% +' + reward + '木屑 +' + flameReward + '火苗');
        }

        saveGame();
        updateResources();
        render();
        renderTasks();
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
        var flame = Math.round(sawdust * 0.5);
        var blackDog = isBlackDogTask(task);
        if (blackDog) {
            sawdust = sawdust * 2;
            flame = flame * 2;
            GameState.blackDogCombo = (GameState.blackDogCombo || 0) + 1;
        } else {
            GameState.blackDogCombo = 0;
        }

        GameState.stats.sawdust += sawdust;
        GameState.stats.flame += flame;
        GameState.stats.energy = Math.max(0, GameState.stats.energy - calcEnergyCost(minutes));
        GameState.stats.spirit = adjustSpirit(GameState.stats.spirit, task.interest, minutes);

        addLog('完成日常「' + task.name + '」' + minutes + '分钟 ' + rating + '星 +' + sawdust + '木屑 +' + flame + '火苗' + (blackDog ? ' [黑狗征服者x' + GameState.blackDogCombo + ']' : ''));
        saveGame();
        updateResources();
        render();
        renderTasks();
    }

    function finishTodo(todo, minutes, rating) {
        todo.completed = true;
        todo.completedAt = new Date().toISOString();

        var baseFlame = 10;
        var flame = Math.round(baseFlame * (rating / 3));
        var sawdust = Math.round(flame * 1.5);

        var blackDog = isBlackDogTask(todo);
        if (blackDog) {
            sawdust *= 2; flame *= 2;
            GameState.blackDogCombo = (GameState.blackDogCombo || 0) + 1;
        } else {
            GameState.blackDogCombo = 0;
        }

        GameState.stats.sawdust += sawdust;
        GameState.stats.flame += flame;
        GameState.stats.energy = Math.max(0, GameState.stats.energy - calcEnergyCost(minutes));
        GameState.stats.spirit = adjustSpirit(GameState.stats.spirit, todo.interest, minutes);

        addLog('完成待办「' + todo.name + '」+' + sawdust + '木屑 +' + flame + '火苗' + (blackDog ? ' [黑狗征服者]' : ''));
        saveGame();
        updateResources();
        render();
    }

    // ========== 计算工具 ==========

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
                '<button class="r8-btn r8-btn--danger r8-btn--sm tomb-del-btn" onclick="TaskSystem.removeDaily(' + t.id + ')">✕</button>' +
                '</div></div>';
        });
        return html;
    }

    function renderProjectList() {
        var projects = (GameState.projects || []).filter(function (p) { return !p.completed; });
        var html = '<div class="tomb-add-row"><button class="r8-btn r8-btn--primary r8-btn--sm" onclick="TaskSystem.addProject()">+ 添加项目</button></div>';

        if (projects.length === 0) {
            return html + '<p class="tomb-empty">还没有进行中的项目。</p>';
        }

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
                '<button class="r8-btn r8-btn--danger r8-btn--sm tomb-del-btn" onclick="TaskSystem.removeProject(' + p.id + ')">✕</button>' +
                '</div></div>';
        });
        return html;
    }

    function renderTodoList() {
        var todos = (GameState.todos || []).filter(function (t) { return !t.completed; });
        var html = '<div class="tomb-add-row"><button class="r8-btn r8-btn--primary r8-btn--sm" onclick="TaskSystem.addTodo()">+ 添加待办</button></div>';

        if (todos.length === 0) {
            return html + '<p class="tomb-empty">没有待办事项。</p>';
        }

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
                '<button class="r8-btn r8-btn--danger r8-btn--sm tomb-del-btn" onclick="TaskSystem.removeTodo(' + t.id + ')">✕</button>' +
                '</div></div>';
        });
        return html;
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
        removeDaily: removeDaily,
        removeProject: removeProject,
        removeTodo: removeTodo,
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
    };
})();

window.TaskSystem = TaskSystem;
