/**
 * 任务完成反馈系统
 * - 奖励弹幕（浮动数字 + 全屏闪光）
 * - 资源栏脉冲动画
 * - 8-bit 音效合成（Web Audio API，无需音频文件）
 * - 连击/streak 升级特效
 */
var GameFeedback = (function () {

    var audioCtx = null;

    function getAudioCtx() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
            catch (e) { return null; }
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }

    // ========== 8-bit 音效合成 ==========

    function playNote(freq, duration, type, volume, delay) {
        var ctx = getAudioCtx();
        if (!ctx) return;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = type || 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(volume || 0.08, ctx.currentTime + (delay || 0));
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (delay || 0) + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + (delay || 0));
        osc.stop(ctx.currentTime + (delay || 0) + duration);
    }

    function sfxComplete() {
        playNote(523, 0.08, 'square', 0.07, 0);
        playNote(659, 0.08, 'square', 0.07, 0.08);
        playNote(784, 0.12, 'square', 0.09, 0.16);
    }

    function sfxBlackDog(combo) {
        playNote(196, 0.12, 'sawtooth', 0.06, 0);
        playNote(262, 0.1, 'square', 0.07, 0.1);
        playNote(330, 0.1, 'square', 0.07, 0.18);
        playNote(392, 0.15, 'square', 0.09, 0.26);
        if (combo >= 3) {
            playNote(523, 0.2, 'square', 0.1, 0.4);
        }
    }

    function sfxMilestone() {
        playNote(392, 0.1, 'square', 0.06, 0);
        playNote(494, 0.1, 'square', 0.06, 0.1);
        playNote(587, 0.1, 'square', 0.07, 0.2);
        playNote(784, 0.15, 'square', 0.08, 0.3);
        playNote(1047, 0.25, 'triangle', 0.1, 0.45);
    }

    function sfxProject() {
        var notes = [523, 659, 784, 1047, 784, 1047, 1319];
        for (var i = 0; i < notes.length; i++) {
            playNote(notes[i], 0.12, 'square', 0.07 + i * 0.005, i * 0.1);
        }
        playNote(1319, 0.4, 'triangle', 0.12, 0.7);
    }

    // ========== 奖励弹幕 ==========

    function showRewardBurst(opts) {
        var overlay = document.createElement('div');
        overlay.className = 'reward-burst';

        var flash = document.createElement('div');
        flash.className = 'reward-flash' + (opts.isBlackDog ? ' reward-flash--blackdog' : '') + (opts.isProject ? ' reward-flash--project' : '');
        overlay.appendChild(flash);

        var card = document.createElement('div');
        card.className = 'reward-card';

        var title = opts.title || '任务完成';
        var titleClass = 'reward-title';
        if (opts.isBlackDog) titleClass += ' reward-title--blackdog';
        if (opts.isProject) titleClass += ' reward-title--project';
        card.innerHTML = '<div class="' + titleClass + '">' + title + '</div>';

        if (opts.subtitle) {
            card.innerHTML += '<div class="reward-subtitle">' + opts.subtitle + '</div>';
        }

        var rewardsHtml = '<div class="reward-items">';
        if (opts.sawdust) {
            rewardsHtml += '<div class="reward-item reward-item--sawdust"><span class="reward-icon">🪵</span><span class="reward-num">+' + opts.sawdust + '</span></div>';
        }
        if (opts.flame) {
            rewardsHtml += '<div class="reward-item reward-item--flame"><span class="reward-icon">🔥</span><span class="reward-num">+' + opts.flame + '</span></div>';
        }
        rewardsHtml += '</div>';
        card.innerHTML += rewardsHtml;

        if (opts.isBlackDog && opts.combo) {
            var comboClass = 'reward-combo';
            if (opts.combo >= 3) comboClass += ' reward-combo--high';
            card.innerHTML += '<div class="' + comboClass + '">⚡ 黑狗征服者 x' + opts.combo + '</div>';
        }

        if (opts.streak && opts.streak > 1) {
            card.innerHTML += '<div class="reward-streak">🔥 连续 ' + opts.streak + ' 天</div>';
        }

        if (opts.energyCost) {
            card.innerHTML += '<div class="reward-cost">-' + opts.energyCost + ' 体力</div>';
        }

        overlay.appendChild(card);

        // 浮动粒子
        var particleCount = opts.isProject ? 16 : (opts.isBlackDog ? 12 : 8);
        for (var i = 0; i < particleCount; i++) {
            var p = document.createElement('div');
            p.className = 'reward-particle';
            var angle = (i / particleCount) * 360;
            var dist = 60 + Math.random() * 80;
            var dx = Math.cos(angle * Math.PI / 180) * dist;
            var dy = Math.sin(angle * Math.PI / 180) * dist;
            p.style.setProperty('--dx', dx + 'px');
            p.style.setProperty('--dy', dy + 'px');
            p.style.animationDelay = (Math.random() * 0.15) + 's';
            if (opts.isBlackDog) p.style.background = '#d06060';
            else if (opts.isProject) p.style.background = '#ffd166';
            overlay.appendChild(p);
        }

        document.body.appendChild(overlay);

        // 资源栏脉冲
        pulseResource('res-sawdust', opts.sawdust);
        pulseResource('res-flame', opts.flame);

        setTimeout(function () {
            overlay.classList.add('reward-burst--out');
        }, 1600);
        setTimeout(function () {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 2200);
    }

    // ========== 资源栏脉冲 ==========

    function pulseResource(id, amount) {
        if (!amount || amount <= 0) return;
        var el = document.getElementById(id);
        if (!el) return;
        var wrapper = el.closest('.resource') || el.parentElement;
        if (wrapper) {
            wrapper.classList.remove('resource--pulse');
            void wrapper.offsetWidth;
            wrapper.classList.add('resource--pulse');
            setTimeout(function () { wrapper.classList.remove('resource--pulse'); }, 800);
        }
    }

    // ========== 屏幕震动（大奖励） ==========

    function screenShake(intensity) {
        var el = document.querySelector('.main-layout') || document.body;
        el.classList.remove('screen-shake', 'screen-shake--heavy');
        void el.offsetWidth;
        el.classList.add(intensity === 'heavy' ? 'screen-shake--heavy' : 'screen-shake');
        setTimeout(function () {
            el.classList.remove('screen-shake', 'screen-shake--heavy');
        }, 400);
    }

    // ========== 对外接口 ==========

    function onDailyComplete(task, sawdust, flame, energyCost, isBlackDog, combo) {
        if (isBlackDog) sfxBlackDog(combo);
        else sfxComplete();

        showRewardBurst({
            title: '「' + task.name + '」',
            sawdust: sawdust,
            flame: flame,
            energyCost: energyCost,
            isBlackDog: isBlackDog,
            combo: combo,
            streak: task.streak,
        });

        if (isBlackDog && combo >= 2) screenShake('light');
    }

    function onTodoComplete(todo, sawdust, flame, energyCost, isBlackDog, combo) {
        if (isBlackDog) sfxBlackDog(combo);
        else sfxComplete();

        showRewardBurst({
            title: '「' + todo.name + '」',
            subtitle: '待办完成',
            sawdust: sawdust,
            flame: flame,
            energyCost: energyCost,
            isBlackDog: isBlackDog,
            combo: combo,
        });
    }

    function onMilestoneProgress(project, ms, sawdust, flame, energyCost, oldProgress, newProgress) {
        sfxComplete();

        showRewardBurst({
            title: '「' + project.name + '」',
            subtitle: ms.name + ' ' + oldProgress + '% → ' + newProgress + '%',
            sawdust: sawdust,
            flame: flame,
            energyCost: energyCost,
        });
    }

    function onMilestoneComplete(project, ms, sawdust, flame, energyCost, isBlackDog, combo) {
        sfxMilestone();
        screenShake('light');

        showRewardBurst({
            title: '里程碑达成',
            subtitle: '「' + project.name + '」· ' + ms.name,
            sawdust: sawdust,
            flame: flame,
            energyCost: energyCost,
            isBlackDog: isBlackDog,
            combo: combo,
        });
    }

    function onProjectComplete(project, sawdust, flame, energyCost, isBlackDog, combo) {
        sfxProject();
        screenShake('heavy');

        showRewardBurst({
            title: '🏆 项目完成',
            subtitle: '「' + project.name + '」',
            sawdust: sawdust,
            flame: flame,
            energyCost: energyCost,
            isBlackDog: isBlackDog,
            combo: combo,
            isProject: true,
        });
    }

    return {
        onDailyComplete: onDailyComplete,
        onTodoComplete: onTodoComplete,
        onMilestoneProgress: onMilestoneProgress,
        onMilestoneComplete: onMilestoneComplete,
        onProjectComplete: onProjectComplete,
        pulseResource: pulseResource,
        screenShake: screenShake,
    };

})();

window.GameFeedback = GameFeedback;
