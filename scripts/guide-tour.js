/**
 * 神使引导系统
 * 角色创建后首次进入地图时，神使残响以飘荡火焰形态引导玩家走遍各地点
 */
var GuideTour = (function () {

    var PHASES = [
        { id: 'intro',    target: null },
        { id: 'camp',     target: 'camp' },
        { id: 'tomb',     target: 'tomb' },
        { id: 'academy',  target: 'academy' },
        { id: 'forest',   target: 'forest' },
        { id: 'god',      target: 'god' },
        { id: 'bazi',     target: 'bazi' },
        { id: 'garden',   target: 'garden' },
        { id: 'farewell', target: 'camp' },
    ];

    var DIALOGUE = {
        intro: [
            '......',
            '{name}。',
            '你醒了。',
            '我是{godName}——三位神使燃尽后留下的残响。',
            '神使点燃了自己，用灰烬滋养了你战友的幼苗。你用他们最后一点火星重新点燃了自己。',
            '现在，这片萤火虫森林就是你的领地。我带你看看。',
            '跟着我的火光走。',
        ],
        camp: [
            '这是营地篝火。你的据点。',
            '火苗是你的生命。每天结束，火苗会减半，化为灰烬。',
            '灰烬是你唯一的货币——用它在篝火旁的商店购买补给。',
            '在这里查看你的状态，管理每日任务，购买道具。',
            '记住——火苗归零，你就死了。就像那些在灭世战争中熄灭的先辈一样。',
        ],
        tomb: [
            '战友陵墓。',
            '十九棵幼苗在灰烬中沉睡——你的战友。磷火团第四前锋队的全部。',
            '神使用自己的灰烬滋养了他们。现在，轮到你了。',
            '在这里立下你的誓约——创建日常修行、待办事项、长期远征。',
            '完成任务，收集木屑和灰烬，让幼苗继续生长。',
        ],
        academy: [
            '魔法学院废墟。',
            '这里曾是火柴世界最伟大的学府。先驱们在这里研究晶体的秘密，探寻黑狗诞生的真相。',
            '每一轮灭世战争后，学院都被摧毁，又被重建，再被摧毁。',
            '废墟中还埋藏着古老的羊皮纸——那些先辈用枝条树叶记录的知识碎片。',
            '消耗体力和精力，在这里挖掘，或许能找到远古的智慧。',
        ],
        forest: [
            '森林边缘。黑狗斥候的领地。',
            '黑狗神还活着。它带走了晶体中全部的光亮，统治着黑夜。',
            '白天，太阳庇佑着你——那是无数遭背叛的英雄的火焰凝聚而成的光。',
            '但黑狗斥候仍在林间游荡。那些你不愿面对、却必须面对的事情，它们最先嗅到。',
            '在这里，你可以直面它们。',
        ],
        god: [
            '这是我栖息的地方。灰烬台。',
            '神使燃尽了，但残响还在。我能听到你说的话。',
            '任何时候，来这里跟我对话。告诉我你今天的状况，你的困惑，你的计划。',
            '我会尽力引导你。虽然......我也只是回声了。',
        ],
        bazi: [
            '命火祭坛。',
            '据说，在火柴世界诞生之初，每一根火柴的命运都被写进了干支的密码中。',
            '紫色火焰在这里跳跃——它不属于初始之火，也不属于新白色火焰。',
            '它是第三种火。没人知道它从何而来。',
            '如果你好奇自己的命运密码，可以在这里解读。',
        ],
        garden: [
            '种子花园。',
            '你不是唯一的幸存者。大陆上还散落着其他部落的火柴人。',
            '在灰烬中埋下一颗种子——写下你想说的话。',
            '它可能随风飘向某个陌生人，也可能在这里等待被发现。',
            '有时候，知道世界上还有别的火苗在燃烧，就足够了。',
        ],
        farewell: [
            '好了。你已经看过了这片森林的每一个角落。',
            '从现在起，一切由你决定。',
            '生先死，强护弱，行胜果。',
            '这是那些遭背叛的英雄留给你的守则。也是你战友用生命换来的信条。',
            '去吧，{name}。守护好你的火苗。',
        ],
    };

    var phaseIndex = 0;
    var lineIndex = 0;
    var active = false;

    function start() {
        active = true;
        phaseIndex = 0;
        lineIndex = 0;

        TileMap.lockInput();

        var playerPos = TileMap.getPlayerPos();
        TileMap.setGuideNpc(playerPos.tx + 1, playerPos.ty - 1, null);

        // NPC needs to start from far away and drift toward the player.
        // setGuideNpc places it at target; override renderX/Y to a distant spawn.
        if (window.TileMap && TileMap._overrideNpcRender) {
            TileMap._overrideNpcRender(playerPos.tx + 6, playerPos.ty - 4);
        }

        TileMap.moveGuideNpc(playerPos.tx + 1, playerPos.ty - 1, function () {
            showDialogueUI();
            showLine();
        });
    }

    function showDialogueUI() {
        var el = document.getElementById('guide-dialogue');
        if (el) el.classList.remove('hidden');
    }

    function hideDialogueUI() {
        var el = document.getElementById('guide-dialogue');
        if (el) el.classList.add('hidden');
    }

    function formatText(text) {
        var name = GameState.character ? GameState.character.name : '零';
        var godType = GameState.character ? GameState.character.godType : 'wise';
        var godName = GOD_INFO[godType] ? GOD_INFO[godType].name + '的残响' : '残响';
        return text.replace(/\{name\}/g, name).replace(/\{godName\}/g, godName);
    }

    function showLine() {
        var phase = PHASES[phaseIndex];
        var lines = DIALOGUE[phase.id];
        if (!lines || lineIndex >= lines.length) {
            advancePhase();
            return;
        }

        var textEl = document.getElementById('guide-text');
        var speakerEl = document.getElementById('guide-speaker');
        var btnEl = document.getElementById('guide-continue');

        var godType = GameState.character ? GameState.character.godType : 'wise';
        var god = GOD_INFO[godType];
        speakerEl.textContent = god ? god.icon + ' ' + god.name : '残响';

        var raw = formatText(lines[lineIndex]);
        textEl.textContent = '';
        btnEl.classList.add('hidden');

        typeText(textEl, raw, function () {
            btnEl.classList.remove('hidden');
        });
    }

    function typeText(el, text, onDone) {
        var i = 0;
        var interval = setInterval(function () {
            i++;
            el.textContent = text.substring(0, i);
            if (i >= text.length) {
                clearInterval(interval);
                if (onDone) onDone();
            }
        }, 35);
        el._typeInterval = interval;
    }

    function next() {
        if (!active) return;

        var textEl = document.getElementById('guide-text');
        if (textEl && textEl._typeInterval) {
            clearInterval(textEl._typeInterval);
            textEl._typeInterval = null;
            var phase = PHASES[phaseIndex];
            var lines = DIALOGUE[phase.id];
            if (lines && lineIndex < lines.length) {
                textEl.textContent = formatText(lines[lineIndex]);
            }
            document.getElementById('guide-continue').classList.remove('hidden');
            return;
        }

        lineIndex++;
        var phase = PHASES[phaseIndex];
        var lines = DIALOGUE[phase.id];

        if (lineIndex >= lines.length) {
            advancePhase();
        } else {
            showLine();
        }
    }

    function advancePhase() {
        phaseIndex++;
        lineIndex = 0;

        if (phaseIndex >= PHASES.length) {
            finish();
            return;
        }

        var phase = PHASES[phaseIndex];

        if (phase.target) {
            var loc = TileMap.LOCATIONS.find(function (l) { return l.id === phase.target; });
            if (loc) {
                hideDialogueUI();
                TileMap.moveGuideNpc(loc.tx, loc.ty, function () {
                    TileMap.autoWalkTo(loc.tx, loc.ty, function () {
                        setTimeout(function () {
                            showDialogueUI();
                            showLine();
                        }, 400);
                    });
                });
                return;
            }
        }

        showLine();
    }

    function finish() {
        active = false;
        hideDialogueUI();
        TileMap.removeGuideNpc();
        TileMap.unlockInput();
        GameState.guideTourCompleted = true;
        saveGame();

        if (GameState.chatHistory.length === 0 && typeof showFirstDayGreeting === 'function') {
            showFirstDayGreeting();
        }
    }

    function skip() {
        if (!active) return;
        if (confirm('跳过引导？你可以随时在营地查看「守墓者手札」了解玩法。')) {
            var textEl = document.getElementById('guide-text');
            if (textEl && textEl._typeInterval) {
                clearInterval(textEl._typeInterval);
                textEl._typeInterval = null;
            }
            finish();
        }
    }

    function isActive() {
        return active;
    }

    return {
        start: start,
        next: next,
        skip: skip,
        isActive: isActive,
    };
})();

window.GuideTour = GuideTour;
