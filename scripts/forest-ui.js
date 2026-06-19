/**
 * 森林边缘 · 黑狗斥候
 * 聚合所有"高重要·低兴趣"的黑狗任务，提供专属面对空间
 */
var ForestUI = (function () {

    var TIPS = [
        '黑狗最喜欢你逃避的东西。面对它，它就缩小。',
        '每征服一只黑狗，灰烬中的火苗就更亮一些。',
        '它们看起来很大。但你比它们活得更久。',
        '不需要喜欢。只需要开始。',
        '黑狗闻到了你的犹豫。但它也闻到了你的勇气。',
        '连续征服黑狗，奖励叠加。这是你应得的。',
        '最难的一步是第一步。之后就只是惯性。',
        '完成它不会让你爱上它。但会让你不再怕它。',
    ];

    function getBlackDogTasks() {
        var result = [];

        (GameState.dailyTasks || []).forEach(function (t) {
            if (t.importance === 'high' && t.interest === 'low') {
                result.push({ task: t, source: 'daily' });
            }
        });

        (GameState.projects || []).forEach(function (p) {
            if (!p.completed && p.importance === 'high' && p.interest === 'low') {
                result.push({ task: p, source: 'project' });
            }
        });

        (GameState.todos || []).forEach(function (t) {
            if (!t.completed && t.importance === 'high' && t.interest === 'low') {
                result.push({ task: t, source: 'todo' });
            }
        });

        return result;
    }

    function getStats() {
        var combo = GameState.blackDogCombo || 0;
        var total = GameState.blackDogTotalCompleted || 0;
        var rank = '流浪者';
        if (total >= 50) rank = '驯狗大师';
        else if (total >= 30) rank = '黑狗克星';
        else if (total >= 15) rank = '暗影猎手';
        else if (total >= 5) rank = '初入林地';
        return { combo: combo, total: total, rank: rank };
    }

    function sourceLabel(source) {
        var map = { daily: '日常', project: '项目', todo: '待办' };
        return map[source] || source;
    }

    function render() {
        var container = document.getElementById('forest-content');
        if (!container) return;

        var dogs = getBlackDogTasks();
        var stats = getStats();
        var tip = TIPS[Math.floor(Math.random() * TIPS.length)];

        var html = '';

        // 黑狗状态卡片
        html += '<div class="forest-stats">';
        html += '<div class="forest-stat-item"><span class="forest-stat-label">称号</span><span class="forest-stat-value">' + stats.rank + '</span></div>';
        html += '<div class="forest-stat-item"><span class="forest-stat-label">累计征服</span><span class="forest-stat-value">' + stats.total + '</span></div>';
        html += '<div class="forest-stat-item"><span class="forest-stat-label">当前连击</span><span class="forest-stat-value forest-combo' + (stats.combo > 0 ? ' forest-combo-active' : '') + '">' + stats.combo + '</span></div>';
        html += '</div>';

        // 黑狗围猎入口
        html += '<div class="forest-hunt-section">';
        html += '<button class="r8-btn r8-btn--primary forest-hunt-btn" onclick="BlackDogGame.launch()">⚔ 黑狗围猎</button>';
        html += '<p class="forest-hunt-desc">用拼音打碎涌来的负面念头</p>';
        var bdg = (typeof GameState !== 'undefined' && GameState.blackDogGame) || {};
        if (bdg.highScore) {
            html += '<div class="forest-hunt-records">';
            html += '<span>最高分 ' + bdg.highScore + '</span>';
            html += '<span>最高波次 ' + (bdg.highWave || 0) + '</span>';
            html += '<span>累计击杀 ' + (bdg.totalKilled || 0) + '</span>';
            html += '</div>';
        }
        html += '</div>';

        // 提示
        html += '<p class="forest-tip">「' + tip + '」</p>';

        // 任务列表
        if (dogs.length === 0) {
            html += '<div class="forest-empty">';
            html += '<p>黑狗的足迹消散了。</p>';
            html += '<p class="forest-empty-sub">没有高重要·低兴趣的任务。在战友陵墓中创建任务时，将重要性设为"高"、兴趣度设为"低"，它就会出现在这里。</p>';
            html += '</div>';
        } else {
            html += '<div class="forest-list">';
            dogs.forEach(function (entry) {
                var t = entry.task;
                var done = entry.source === 'daily' ? t.completed : false;
                var meta = sourceLabel(entry.source);

                if (entry.source === 'daily') {
                    meta += ' · ' + (t.duration || 30) + '分钟';
                    if (t.streak > 0) meta += ' · 🔥' + t.streak + '天';
                } else if (entry.source === 'project') {
                    var ms = t.milestones[t.currentMilestone];
                    meta += ' · ' + t.currentMilestone + '/' + t.milestones.length;
                    if (ms) meta += ' · ' + ms.name + '（' + (ms.progress || 0) + '%）';
                } else if (entry.source === 'todo') {
                    meta += ' · ' + (t.duration || 60) + '分钟';
                    if (t.deadline) {
                        var diff = Math.ceil((new Date(t.deadline) - new Date()) / 86400000);
                        if (diff < 0) meta += ' · 逾期' + Math.abs(diff) + '天';
                        else if (diff === 0) meta += ' · 今天截止';
                        else meta += ' · 还有' + diff + '天';
                    }
                }

                html += '<div class="forest-task' + (done ? ' forest-task-done' : '') + '">';
                html += '<div class="forest-task-icon">🐕</div>';
                html += '<div class="forest-task-body">';
                html += '<div class="forest-task-name">' + t.name + (done ? ' <span class="forest-done-tag">✓ 已征服</span>' : '') + '</div>';
                html += '<div class="forest-task-meta">' + meta + '</div>';
                html += '</div>';

                if (!done) {
                    html += '<div class="forest-task-actions">';
                    if (entry.source === 'daily') {
                        html += '<button class="r8-btn r8-btn--primary r8-btn--sm" onclick="TaskSystem.completeDaily(' + t.id + ')">面对它</button>';
                    } else if (entry.source === 'project') {
                        html += '<button class="r8-btn r8-btn--primary r8-btn--sm" onclick="TaskSystem.completeMilestone(' + t.id + ')">推进</button>';
                    } else {
                        html += '<button class="r8-btn r8-btn--primary r8-btn--sm" onclick="TaskSystem.completeTodo(' + t.id + ')">面对它</button>';
                    }
                    html += '</div>';
                }

                html += '</div>';
            });
            html += '</div>';
        }

        // 奖励说明
        html += '<div class="forest-bonus-info">';
        html += '<p>🐕 黑狗任务完成后获得 <strong>双倍</strong> 木屑与火苗</p>';
        html += '<p>连续完成黑狗任务可累积连击加成</p>';
        html += '</div>';

        container.innerHTML = html;
    }

    return {
        render: render,
    };
})();

window.ForestUI = ForestUI;
