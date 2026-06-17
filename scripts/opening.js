var Opening = (function () {
    var phase = 'narrative'; // 'narrative' | 'dialogue' | 'done'
    var narrativeStep = 0;
    var questionIndex = 0;
    var answers = {};

    var narrativeLines = [
        { text: '萤火虫森林。', cls: 'narr-green' },
        { text: '十九棵幼苗在灰烬中沉睡。' },
        { text: '你是零——磷火团第四前锋队最后的幸存者。' },
        { text: '那场战斗已经过去很久了。你的战友全部阵亡。是你的指挥失误。', cls: '' },
        { text: '三位神使燃尽了自己，将战友化为新芽。', cls: '' },
        { text: '现在，你是守墓者。', cls: 'narr-fire' },
        { text: '' }, // 空行分隔
        { text: '灰烬中传来微弱的声音——', cls: 'narr-bright' },
    ];

    var questions = [
        {
            id: 'body',
            voice: '......零。你的身体，现在是什么状况？',
            choices: [
                { text: '很久没动了。沉重得像生了锈。', value: 'low' },
                { text: '还行，能撑住日常。', value: 'mid' },
                { text: '状态不错，准备好了。', value: 'high' },
            ],
        },
        {
            id: 'mind',
            voice: '脑子呢？能集中注意力吗？',
            choices: [
                { text: '一团浆糊。什么都不想做。', value: 'low' },
                { text: '时好时坏，看心情。', value: 'mid' },
                { text: '清醒。有想做的事。', value: 'high' },
            ],
        },
        {
            id: 'pressure',
            voice: '外面的黑狗......追得紧吗？',
            choices: [
                { text: '每天都在。喘不过气。', value: 'heavy' },
                { text: '能感觉到，但还没被咬住。', value: 'moderate' },
                { text: '暂时远了。', value: 'light' },
            ],
        },
        {
            id: 'approach',
            voice: '你打算怎么守护这些幼苗？',
            choices: [
                { text: '先弄清楚发生了什么。理解才能行动。', value: 'wise' },
                { text: '制定计划，每天执行。不能再犯错。', value: 'king' },
                { text: '用最少的力气换最大的结果。活下去再说。', value: 'rich' },
            ],
        },
        {
            id: 'rhythm',
            voice: '太阳快升起了。新的一天，你习惯怎么开始？',
            choices: [
                { text: '先做最难的。趁还有力气。', value: 'hard_first' },
                { text: '先做点小事热身。', value: 'warmup' },
                { text: '不确定，走一步看一步。', value: 'flexible' },
            ],
        },
    ];

    function advance() {
        if (phase === 'narrative') {
            showNextNarrative();
        }
    }

    function start() {
        phase = 'narrative';
        narrativeStep = 0;
        questionIndex = 0;
        answers = {};
        showNarrativeBatch();
    }

    function showNarrativeBatch() {
        var container = document.getElementById('opening-narrative');
        var btn = document.getElementById('opening-continue-btn');
        container.innerHTML = '';

        var lines = narrativeLines;
        var delay = 0;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (!line.text) {
                delay += 400;
                continue;
            }
            var el = document.createElement('p');
            el.className = 'narr-line' + (line.cls ? ' ' + line.cls : '');
            el.textContent = line.text;
            el.style.animationDelay = delay + 'ms';
            container.appendChild(el);
            delay += 600;
        }

        btn.classList.remove('hidden');
        btn.style.animationDelay = delay + 'ms';
        btn.textContent = '继续';
    }

    function showNextNarrative() {
        phase = 'dialogue';
        document.getElementById('opening-narrative').innerHTML = '';
        document.getElementById('opening-continue-btn').classList.add('hidden');
        document.getElementById('opening-dialogue').classList.remove('hidden');
        showQuestion();
    }

    function showQuestion() {
        if (questionIndex >= questions.length) {
            showNameInput();
            return;
        }

        var q = questions[questionIndex];
        var qEl = document.getElementById('opening-question');
        var cEl = document.getElementById('opening-choices');

        qEl.textContent = q.voice;
        qEl.style.animation = 'none';
        qEl.offsetHeight; // reflow
        qEl.style.animation = '';

        cEl.innerHTML = '';
        for (var i = 0; i < q.choices.length; i++) {
            (function (choice, idx) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'opening-choice-btn';
                btn.textContent = choice.text;
                btn.style.animationDelay = (150 + idx * 120) + 'ms';
                btn.onclick = function () { selectChoice(q.id, choice.value, btn); };
                cEl.appendChild(btn);
            })(q.choices[i], i);
        }
    }

    function showNameInput() {
        var qEl = document.getElementById('opening-question');
        var cEl = document.getElementById('opening-choices');

        qEl.textContent = '最后一个问题......你叫什么名字？';
        qEl.style.animation = 'none';
        qEl.offsetHeight;
        qEl.style.animation = '';

        cEl.innerHTML =
            '<div class="opening-name-input">' +
            '<input type="text" id="opening-name" class="r8-input" maxlength="12" placeholder="输入你的名字" style="text-align:center;color:#fff;max-width:200px;">' +
            '<button type="button" class="opening-choice-btn" onclick="Opening._confirmName()" style="margin-top:12px;">就是这个名字</button>' +
            '</div>';

        setTimeout(function () {
            var input = document.getElementById('opening-name');
            if (input) input.focus();
        }, 300);
    }

    function _confirmName() {
        var input = document.getElementById('opening-name');
        var name = input ? input.value.trim() : '';
        if (!name) {
            input.style.borderColor = '#c85a20';
            input.placeholder = '请输入名字';
            return;
        }
        answers.playerName = name;
        finishOpening();
    }

    function selectChoice(questionId, value, btnEl) {
        answers[questionId] = value;

        var allBtns = document.querySelectorAll('.opening-choice-btn');
        for (var i = 0; i < allBtns.length; i++) {
            allBtns[i].style.pointerEvents = 'none';
            if (allBtns[i] !== btnEl) {
                allBtns[i].style.opacity = '0.3';
            }
        }
        btnEl.classList.add('choice-selected');

        setTimeout(function () {
            questionIndex++;
            showQuestion();
        }, 600);
    }

    function finishOpening() {
        var result = mapAnswersToState(answers);

        document.getElementById('opening-dialogue').classList.add('hidden');

        var container = document.getElementById('opening-narrative');
        container.innerHTML = '';

        var concludingLines = getConcludingLines(result);
        var delay = 0;
        for (var i = 0; i < concludingLines.length; i++) {
            var el = document.createElement('p');
            el.className = 'narr-line' + (concludingLines[i].cls ? ' ' + concludingLines[i].cls : '');
            el.textContent = concludingLines[i].text;
            el.style.animationDelay = delay + 'ms';
            container.appendChild(el);
            delay += 700;
        }

        setTimeout(function () {
            var btn = document.getElementById('opening-continue-btn');
            btn.classList.remove('hidden');
            btn.textContent = '点燃火苗';
            btn.style.animation = 'none';
            btn.offsetHeight;
            btn.style.animation = '';
            btn.style.animationDelay = '0ms';
            btn.onclick = function () { initializeGame(result); };
        }, delay + 200);
    }

    function mapAnswersToState(a) {
        var energyMap = { low: 60, mid: 80, high: 100 };
        var spiritMap = { low: 30, mid: 50, high: 70 };
        var pressureMap = {
            heavy: { status: '黑狗缠身', spiritCap: 50, ashBonus: 50, nextMilestone: 7 },
            moderate: { status: '黑狗游荡', spiritCap: 65, ashBonus: 20, nextMilestone: 14 },
            light: { status: '黑狗退后', spiritCap: 80, ashBonus: 0, nextMilestone: 30 },
        };

        var energy = energyMap[a.body] || 80;
        var spirit = spiritMap[a.mind] || 50;
        var pressure = pressureMap[a.pressure] || pressureMap.moderate;
        var godType = a.approach || 'wise';
        var rhythm = a.rhythm || 'flexible';

        spirit = Math.min(spirit, pressure.spiritCap);

        return {
            energy: energy,
            spirit: spirit,
            depressionStatus: pressure.status,
            dailySpirit: pressure.spiritCap,
            nextMilestone: pressure.nextMilestone,
            ash: 500 + pressure.ashBonus,
            godType: godType,
            rhythm: rhythm,
        };
    }

    function getConcludingLines(result) {
        var lines = [];

        if (result.energy <= 60 && result.spirit <= 30) {
            lines.push({ text: '你很疲惫。身体和头脑都是。' });
            lines.push({ text: '但你还在这里。这就够了。', cls: 'narr-bright' });
        } else if (result.energy <= 60 || result.spirit <= 30) {
            lines.push({ text: '不是最好的状态。但够用了。' });
            lines.push({ text: '火苗不需要太旺，只需要不灭。', cls: 'narr-bright' });
        } else {
            lines.push({ text: '你准备好了。', cls: 'narr-bright' });
        }

        var godName = { wise: '智者', king: '国王', rich: '首富' }[result.godType];
        lines.push({ text: '' });
        lines.push({ text: godName + '的残响将陪伴你。', cls: 'narr-fire' });
        lines.push({ text: '' });
        lines.push({ text: '生先死，强护弱，行胜果。', cls: 'narr-green' });

        return lines;
    }

    function initializeGame(result) {
        GameState.character = {
            name: answers.playerName || '零',
            gender: 'other',
            godType: result.godType,
            rhythm: result.rhythm,
            createdAt: new Date().toISOString(),
        };

        GameState.stats.energy = result.energy;
        GameState.stats.spirit = result.spirit;
        GameState.stats.ash = result.ash;
        GameState.stats.flame = 100;
        GameState.stats.sawdust = 100;

        GameState.depression = {
            status: result.depressionStatus,
            dailySpirit: result.dailySpirit,
            nextMilestone: result.nextMilestone,
            milestones: {
                7: { status: '黑狗退后', spirit: 60 },
                14: { status: '黑狗退散', spirit: 75 },
                30: { status: '黑狗远去', spirit: 85 },
                60: { status: '战胜黑狗', spirit: 100 },
            },
        };

        saveGame();
        enterMainScreen();
    }

    return {
        start: start,
        advance: advance,
        _confirmName: _confirmName,
    };
})();

window.Opening = Opening;
