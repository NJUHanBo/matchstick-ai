/**
 * 黑狗围猎 · 打字驱狗
 * 拼音打碎涌来的负面念头，在森林深处驱散黑狗群
 */
var BlackDogGame = (function () {
    'use strict';

    var W = 384, H = 272;
    var CX = W / 2, CY = H / 2 + 8;
    var HIT_RADIUS = 18;
    var MAX_LIVES = 3;
    var FONT_CN = '"PingFang SC","Microsoft YaHei",sans-serif';
    var FONT_PX = '"Press Start 2P",monospace';

    // ===== 词库 =====
    var POOL_S = [
        ['焦虑','jiaolv'],['逃避','taobi'],['拖延','tuoyan'],['放弃','fangqi'],
        ['摆烂','bailan'],['废物','feiwu'],['不配','bupei'],['太难','tainan'],
        ['算了','suanle'],['没用','meiyong'],['好累','haolei'],['不行','buxing'],
        ['害怕','haipa'],['烦死','fansi'],['完蛋','wandan'],['自卑','zibei'],
        ['孤独','gudu'],['失败','shibai'],['无聊','wuliao'],['厌倦','yanjuan'],
    ];
    var POOL_M = [
        ['做不到','zuobudao'],['没意义','meiyiyi'],['来不及','laibuji'],
        ['太迟了','taichile'],['没希望','meixiwang'],['不可能','bukeneng'],
        ['全完了','quanwanle'],['好丢人','haodiuren'],['受不了','shoubuliao'],
        ['都怪我','douguaiwo'],['白费了','baifeile'],['好烦啊','haofana'],
        ['没人管','meirenguan'],['活该的','huogaide'],
    ];
    var POOL_L = [
        ['毫无意义','haowuyiyi'],['一事无成','yishiwucheng'],
        ['无可救药','wukejiuyao'],['自作自受','zizuozishou'],
        ['前功尽弃','qiangongjinqi'],['心灰意冷','xinhuiyileng'],
        ['万念俱灰','wannianjuhui'],['碌碌无为','luluwuwei'],
        ['一无是处','yiwushichu'],['得过且过','deguoqieguo'],
    ];

    // ===== Boss 词库 =====
    // 疾影型：短句，极快
    var BOSS_FAST = [
        { name: '疾影·焦', text: '你不行的', pinyin: 'nibuxingde' },
        { name: '疾影·惧', text: '别挣扎了', pinyin: 'biezhengzhale' },
        { name: '疾影·怯', text: '你会搞砸', pinyin: 'nihuigaoza' },
        { name: '疾影·躁', text: '来不及了', pinyin: 'laibujile' },
        { name: '疾影·厌', text: '没人在意', pinyin: 'meirenzaiyi' },
        { name: '疾影·惰', text: '明天再说', pinyin: 'mingtianzaishuo' },
        { name: '疾影·疑', text: '都在笑你', pinyin: 'douzaixiaoni' },
        { name: '疾影·寒', text: '不值一提', pinyin: 'buzhiyiti' },
    ];
    // 深渊型：长句，极慢，巨大
    var BOSS_SLOW = [
        { name: '深渊·绝望', text: '你永远不会好起来的', pinyin: 'niyongyuanbuhuihaoqilaide' },
        { name: '深渊·虚无', text: '做什么都没有意义', pinyin: 'zuoshenmadoumeiyouyiyi' },
        { name: '深渊·否定', text: '你从来就不够好', pinyin: 'niconglaijiubugouhao' },
        { name: '深渊·孤寂', text: '没有人真的在乎你', pinyin: 'meiyourenzhendezaihuni' },
        { name: '深渊·倦怠', text: '再努力也改变不了什么', pinyin: 'zainuliyegaibianbuliaoshenme' },
        { name: '深渊·自毁', text: '你活该过得这么差', pinyin: 'nihuogaiguodezhemecha' },
        { name: '深渊·深渊', text: '一切都已经太迟了', pinyin: 'yiqiedouyijingtaichile' },
        { name: '深渊·空洞', text: '你就是个彻头彻尾的失败者', pinyin: 'nijiushigechetoucheweideshibaizhe' },
    ];

    var DOG_SCORES = { s: 10, m: 25, l: 50, boss_fast: 80, boss_slow: 120 };
    var DOG_SPEEDS = { s: 28, m: 20, l: 14, boss_fast: 45, boss_slow: 8 };
    var DOG_COLORS = {
        s: { body: '#1a1a2e', eye: '#ff3344', glow: '#ff334480' },
        m: { body: '#12102a', eye: '#cc22ff', glow: '#cc22ff80' },
        l: { body: '#0a0818', eye: '#ff2222', glow: '#ff222280' },
        boss_fast: { body: '#2a1010', eye: '#ff4400', glow: '#ff440088' },
        boss_slow: { body: '#08001a', eye: '#8800ff', glow: '#8800ff88' },
    };

    // ===== 音效 =====
    var audioCtx = null;
    function ac() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
            catch (e) { return null; }
        }
        return audioCtx;
    }

    function sfx(type) {
        var c = ac(); if (!c) return;
        var now = c.currentTime;
        try { _sfx(c, now, type); } catch (e) {}
    }

    function _sfx(c, t, type) {
        var o, g, o2, g2;
        switch (type) {
        case 'type':
            o = c.createOscillator(); g = c.createGain();
            o.type = 'square'; o.frequency.value = 1200;
            g.gain.setValueAtTime(0.06, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
            o.connect(g); g.connect(c.destination);
            o.start(t); o.stop(t + 0.04);
            break;
        case 'kill':
            o = c.createOscillator(); g = c.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(800, t);
            o.frequency.exponentialRampToValueAtTime(120, t + 0.12);
            g.gain.setValueAtTime(0.18, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            o.connect(g); g.connect(c.destination);
            o.start(t); o.stop(t + 0.12);
            var buf = c.createBuffer(1, c.sampleRate * 0.06, c.sampleRate);
            var d = buf.getChannelData(0);
            for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.12;
            var n = c.createBufferSource(); n.buffer = buf;
            g2 = c.createGain();
            g2.gain.setValueAtTime(0.12, t);
            g2.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
            n.connect(g2); g2.connect(c.destination); n.start(t);
            break;
        case 'hit':
            o = c.createOscillator(); g = c.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(90, t);
            o.frequency.exponentialRampToValueAtTime(35, t + 0.25);
            g.gain.setValueAtTime(0.25, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            o.connect(g); g.connect(c.destination);
            o.start(t); o.stop(t + 0.3);
            break;
        case 'combo':
            var base = Math.min(400 + combo * 60, 1200);
            o = c.createOscillator(); g = c.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(base, t);
            o.frequency.setValueAtTime(base * 1.5, t + 0.04);
            g.gain.setValueAtTime(0.08, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
            o.connect(g); g.connect(c.destination);
            o.start(t); o.stop(t + 0.1);
            break;
        case 'wrong':
            o = c.createOscillator(); g = c.createGain();
            o.type = 'sawtooth'; o.frequency.value = 120;
            g.gain.setValueAtTime(0.08, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
            o.connect(g); g.connect(c.destination);
            o.start(t); o.stop(t + 0.06);
            break;
        case 'waveClear':
            [0, 0.07, 0.14].forEach(function (dl, i) {
                o = c.createOscillator(); g = c.createGain();
                o.type = 'square'; o.frequency.value = [523, 659, 784][i];
                g.gain.setValueAtTime(0.08, t + dl);
                g.gain.exponentialRampToValueAtTime(0.001, t + dl + 0.18);
                o.connect(g); g.connect(c.destination);
                o.start(t + dl); o.stop(t + dl + 0.18);
            });
            break;
        case 'over':
            [0, 0.12, 0.24].forEach(function (dl, i) {
                o = c.createOscillator(); g = c.createGain();
                o.type = 'sine'; o.frequency.value = [300, 200, 100][i];
                g.gain.setValueAtTime(0.12, t + dl);
                g.gain.exponentialRampToValueAtTime(0.001, t + dl + 0.3);
                o.connect(g); g.connect(c.destination);
                o.start(t + dl); o.stop(t + dl + 0.3);
            });
            break;
        }
    }

    // ===== 精灵 =====
    function makeSprite(lines, palette) {
        var pixels = [];
        for (var y = 0; y < lines.length; y++) {
            for (var x = 0; x < lines[y].length; x++) {
                var ch = lines[y][x];
                if (ch !== '.' && palette[ch]) pixels.push([x, y, palette[ch]]);
            }
        }
        return { w: lines[0].length, h: lines.length, px: pixels };
    }

    function buildSprites() {
        var sp = {};
        for (var k in DOG_COLORS) {
            var c = DOG_COLORS[k];
            if (k === 's') {
                sp[k] = makeSprite([
                    '.##..##.',
                    '.######.',
                    '.#E##E#.',
                    '..####..',
                    '.######.',
                    '.#.##.#.',
                    '..#..#..',
                ], { '#': c.body, 'E': c.eye });
            } else if (k === 'm') {
                sp[k] = makeSprite([
                    '..##....##..',
                    '..########..',
                    '..#E.##.E#..',
                    '..########..',
                    '.##########.',
                    '.##..##..##.',
                    '..##....##..',
                    '...#....#...',
                ], { '#': c.body, 'E': c.eye });
            } else if (k === 'l') {
                sp[k] = makeSprite([
                    '...##......##...',
                    '..####....####..',
                    '..##############',
                    '..##E..##..E##..',
                    '.####.####.####.',
                    '.####..##..####.',
                    '..###......###..',
                    '...##......##...',
                    '....#......#....',
                ], { '#': c.body, 'E': c.eye });
            } else if (k === 'boss_fast') {
                sp[k] = makeSprite([
                    '..##......##..',
                    '.####....####.',
                    '.#E.######.E#.',
                    '.##############',
                    '####..####..###',
                    '.###..####..##.',
                    '..##........#..',
                    '...##......#...',
                    '....##...##....',
                    '.....#...#.....',
                ], { '#': c.body, 'E': c.eye });
            } else if (k === 'boss_slow') {
                sp[k] = makeSprite([
                    '....##..........##....',
                    '...####........####...',
                    '..######......######..',
                    '.########....########.',
                    '.##E..############E##.',
                    '.########################',
                    '########..####..########',
                    '.######..........######.',
                    '..#####..........#####..',
                    '...####..........####...',
                    '....###..........###....',
                    '.....##..........##.....',
                    '......#..........#......',
                ], { '#': c.body, 'E': c.eye });
            }
        }
        return sp;
    }

    // ===== 状态 =====
    var canvas, ctx, overlay, scale;
    var phase, phaseTimer, running, lastTS;
    var dogs, particles, flashes, popups;
    var input, targetDog, inputFlash;
    var lives, score, wave, combo, maxCombo, dogsKilled;
    var spawnQueue, spawnTimer, spawnInterval;
    var shakeX, shakeY, shakeT;
    var freezeT, hitFlashT, firePhase;
    var sprites;

    function reset() {
        phase = 'countdown'; phaseTimer = 3000;
        dogs = []; particles = []; flashes = []; popups = [];
        input = ''; targetDog = null; inputFlash = 0;
        lives = MAX_LIVES; score = 0; wave = 1;
        combo = 0; maxCombo = 0; dogsKilled = 0;
        spawnQueue = []; spawnTimer = 0;
        shakeX = 0; shakeY = 0; shakeT = 0;
        freezeT = 0; hitFlashT = 0; firePhase = 0;
        buildWaveQueue();
    }

    // ===== 波次 =====
    function buildWaveQueue() {
        var count;
        if (wave <= 2) count = 4;
        else if (wave <= 4) count = 5;
        else if (wave <= 7) count = 6;
        else count = 7;

        spawnQueue = [];
        for (var i = 0; i < count; i++) {
            var r = Math.random();
            var size;
            if (wave <= 2) { size = 's'; }
            else if (wave <= 4) { size = r < 0.65 ? 's' : 'm'; }
            else { size = r < 0.4 ? 's' : r < 0.75 ? 'm' : 'l'; }
            spawnQueue.push(size);
        }

        // 第3波起每波末尾加一只 boss
        if (wave >= 3) {
            var bossType = Math.random() < 0.5 ? 'boss_fast' : 'boss_slow';
            spawnQueue.push(bossType);
        }

        spawnInterval = Math.max(700, 2500 - (wave - 1) * 200);
        spawnTimer = 800;
    }

    function pickWord(size) {
        if (size === 'boss_fast' || size === 'boss_slow') {
            var bpool = size === 'boss_fast' ? BOSS_FAST : BOSS_SLOW;
            var pick = bpool[Math.floor(Math.random() * bpool.length)];
            return { text: pick.text, pinyin: pick.pinyin, bossName: pick.name };
        }
        var pool = size === 's' ? POOL_S : size === 'm' ? POOL_M : POOL_L;
        var usedFirstLetters = {};
        dogs.forEach(function (d) {
            if (d.alive) usedFirstLetters[d.pinyin[0]] = true;
        });

        var candidates = pool.filter(function (w) { return !usedFirstLetters[w[1][0]]; });
        if (candidates.length === 0) candidates = pool;
        pick = candidates[Math.floor(Math.random() * candidates.length)];
        return { text: pick[0], pinyin: pick[1], bossName: null };
    }

    function spawnDog() {
        if (spawnQueue.length === 0) return;
        var size = spawnQueue.shift();
        var word = pickWord(size);
        var isBoss = size === 'boss_fast' || size === 'boss_slow';
        var angle = Math.random() * Math.PI * 2;
        var dist = Math.max(W, H) * (isBoss ? 0.6 : 0.55);
        var speed = DOG_SPEEDS[size] * (1 + (wave - 1) * 0.04);
        var dog = {
            x: CX + Math.cos(angle) * dist,
            y: CY + Math.sin(angle) * dist,
            speed: speed,
            text: word.text,
            pinyin: word.pinyin,
            typed: 0,
            size: size,
            alive: true,
            flash: 0,
            bobPhase: Math.random() * Math.PI * 2,
            isBoss: isBoss,
            bossName: word.bossName,
        };
        dogs.push(dog);

        // boss 出场提示
        if (isBoss) {
            popups.push({
                text: word.bossName, x: CX, y: 35,
                t: 1500, max: 1500,
                color: size === 'boss_fast' ? '#ff4400' : '#8800ff',
            });
        }
    }

    // ===== 入口 =====
    function launch() {
        if (running) return;
        sprites = buildSprites();
        overlay = document.createElement('div');
        overlay.id = 'bdg-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#030306;z-index:9999;display:flex;align-items:center;justify-content:center;';
        canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        canvas.style.imageRendering = 'pixelated';
        rescale();
        overlay.appendChild(canvas);
        document.body.appendChild(overlay);
        ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        reset();
        running = true;
        lastTS = 0;
        document.addEventListener('keydown', onKey);
        canvas.addEventListener('click', onClick);
        window.addEventListener('resize', rescale);
        requestAnimationFrame(loop);
    }

    function exitGame() {
        running = false;
        document.removeEventListener('keydown', onKey);
        canvas.removeEventListener('click', onClick);
        window.removeEventListener('resize', rescale);
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null; canvas = null; ctx = null;
        if (window.ForestUI && ForestUI.render) ForestUI.render();
    }

    function rescale() {
        if (!canvas) return;
        var vw = window.innerWidth, vh = window.innerHeight;
        scale = Math.max(1, Math.floor(Math.min(vw / W, vh / H)));
        canvas.style.width = (W * scale) + 'px';
        canvas.style.height = (H * scale) + 'px';
    }

    // ===== 主循环 =====
    function loop(ts) {
        if (!running) return;
        var dt = lastTS ? Math.min(ts - lastTS, 50) : 16;
        lastTS = ts;

        if (freezeT > 0) { freezeT -= dt; }
        else { update(dt); }
        draw();
        requestAnimationFrame(loop);
    }

    function update(dt) {
        firePhase += dt * 0.004;

        switch (phase) {
        case 'countdown':
            phaseTimer -= dt;
            if (phaseTimer <= 0) { phase = 'playing'; spawnTimer = 300; }
            break;
        case 'playing': updatePlaying(dt); break;
        case 'waveClear':
            phaseTimer -= dt;
            if (phaseTimer <= 0) {
                wave++;
                buildWaveQueue();
                phase = 'playing';
            }
            break;
        }

        // particles
        for (var i = particles.length - 1; i >= 0; i--) {
            var p = particles[i];
            p.x += p.vx * dt * 0.06;
            p.y += p.vy * dt * 0.06;
            p.vy += 0.08 * dt * 0.06;
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
        // flashes
        for (i = flashes.length - 1; i >= 0; i--) {
            flashes[i].t -= dt;
            if (flashes[i].t <= 0) flashes.splice(i, 1);
        }
        // popups
        for (i = popups.length - 1; i >= 0; i--) {
            popups[i].y -= dt * 0.03;
            popups[i].t -= dt;
            if (popups[i].t <= 0) popups.splice(i, 1);
        }
        // shake decay
        if (shakeT > 0) {
            shakeT -= dt;
            var intensity = shakeT * 0.012;
            shakeX = (Math.random() - 0.5) * intensity;
            shakeY = (Math.random() - 0.5) * intensity;
        } else { shakeX = 0; shakeY = 0; }
        if (hitFlashT > 0) hitFlashT -= dt;
        if (inputFlash > 0) inputFlash -= dt;
    }

    function updatePlaying(dt) {
        // spawn
        spawnTimer -= dt;
        if (spawnTimer <= 0 && spawnQueue.length > 0) {
            spawnDog();
            spawnTimer = spawnInterval;
        }

        // move dogs
        var alive = 0;
        for (var i = 0; i < dogs.length; i++) {
            var d = dogs[i];
            if (!d.alive) continue;
            alive++;
            d.bobPhase += dt * 0.005;
            var dx = CX - d.x, dy = CY - d.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < HIT_RADIUS) {
                damagePlayer(d);
                continue;
            }
            var step = d.speed * dt * 0.001;
            d.x += (dx / dist) * step;
            d.y += (dy / dist) * step;
        }

        // recount alive after damage resolution
        if (phase === 'playing' && spawnQueue.length === 0) {
            var anyAlive = false;
            for (var j = 0; j < dogs.length; j++) {
                if (dogs[j].alive) { anyAlive = true; break; }
            }
            if (!anyAlive) {
                sfx('waveClear');
                phase = 'waveClear';
                phaseTimer = 2200;
            }
        }
    }

    // ===== 输入 =====
    function onKey(e) {
        if (e.repeat) return;
        var key = e.key;

        if (key === 'Escape') {
            if (phase === 'playing' || phase === 'countdown' || phase === 'waveClear') {
                phase = 'settle'; settle();
            } else if (phase === 'settle') {
                exitGame();
            }
            e.preventDefault(); return;
        }

        if (phase !== 'playing') return;

        if (key === 'Backspace') {
            e.preventDefault();
            if (input.length > 0) {
                input = input.slice(0, -1);
                if (input.length === 0) targetDog = null;
            }
            return;
        }

        var k = key.toLowerCase();
        if (k.length !== 1 || k < 'a' || k > 'z') return;
        e.preventDefault();

        if (targetDog) {
            if (!targetDog.alive) { targetDog = null; input = ''; }
        }

        if (targetDog) {
            var expect = targetDog.pinyin[input.length];
            if (k === expect) {
                input += k;
                targetDog.typed = input.length;
                sfx('type');
                if (input.length === targetDog.pinyin.length) {
                    killDog(targetDog);
                }
            } else {
                sfx('wrong');
                inputFlash = 150;
            }
        } else {
            var match = null;
            for (var i = 0; i < dogs.length; i++) {
                if (dogs[i].alive && dogs[i].pinyin[0] === k) {
                    match = dogs[i]; break;
                }
            }
            if (match) {
                targetDog = match;
                input = k;
                targetDog.typed = 1;
                sfx('type');
                if (input.length === targetDog.pinyin.length) {
                    killDog(targetDog);
                }
            } else {
                sfx('wrong');
                inputFlash = 150;
            }
        }
    }

    // ===== 击杀 & 伤害 =====
    function killDog(dog) {
        dog.alive = false;
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        dogsKilled++;

        var pts = DOG_SCORES[dog.size];
        var mult = 1 + (combo - 1) * 0.1;
        var gained = Math.round(pts * mult);
        score += gained;

        // 粒子爆炸（boss 更猛烈）
        var col = DOG_COLORS[dog.size];
        var pCount = dog.isBoss ? 24 : (dog.size === 'l' ? 16 : dog.size === 'm' ? 12 : 8);
        emitParticles(dog.x, dog.y, [col.eye, '#ff8844', '#ffcc44', col.body], pCount);

        // 碎字闪现（boss 更大更持久）
        flashes.push({
            text: dog.text, x: dog.x, y: dog.y,
            t: dog.isBoss ? 1000 : 600,
            max: dog.isBoss ? 1000 : 600,
        });

        // boss 击杀名字弹出
        if (dog.isBoss && dog.bossName) {
            popups.push({
                text: dog.bossName + ' SLAIN',
                x: CX, y: CY - 30,
                t: 1200, max: 1200,
                color: col.eye,
            });
        }

        // 分数弹出
        popups.push({ text: '+' + gained, x: dog.x + 10, y: dog.y - 10, t: 800, max: 800, color: '#ffcc44' });

        // combo 提示
        if (combo >= 2) {
            popups.push({ text: combo + ' COMBO', x: CX, y: 40, t: 900, max: 900, color: '#ff8844' });
            sfx('combo');
        }

        sfx('kill');
        freezeT = dog.isBoss ? 120 : 50;

        input = '';
        targetDog = null;
    }

    function damagePlayer(dog) {
        dog.alive = false;
        if (dog === targetDog) { targetDog = null; input = ''; }
        lives--;
        sfx('hit');
        shakeT = 300;
        hitFlashT = 200;
        combo = 0;

        emitParticles(CX, CY, ['#ff3333', '#ff6644', '#883322'], 6);

        if (lives <= 0) {
            phase = 'settle';
            sfx('over');
            settle();
        }
    }

    function emitParticles(x, y, colors, count) {
        for (var i = 0; i < count; i++) {
            var angle = Math.random() * Math.PI * 2;
            var speed = 1.5 + Math.random() * 3;
            particles.push({
                x: x, y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1,
                life: 400 + Math.random() * 300,
                maxLife: 700,
                color: colors[Math.floor(Math.random() * colors.length)],
                sz: 1 + Math.floor(Math.random() * 2),
            });
        }
    }

    // ===== 结算 =====
    var settleData = null;
    var settleButtons = [];

    function settle() {
        var ashEarned = Math.floor(score / 8) + wave * 5 + maxCombo * 3;
        settleData = {
            score: score, wave: wave, killed: dogsKilled,
            maxCombo: maxCombo, ash: ashEarned,
        };

        // 写入 GameState
        if (typeof GameState !== 'undefined') {
            GameState.stats.ash += ashEarned;
            GameState.blackDogTotalCompleted = (GameState.blackDogTotalCompleted || 0) + dogsKilled;
            if (!GameState.blackDogGame) GameState.blackDogGame = {};
            var g = GameState.blackDogGame;
            g.highScore = Math.max(g.highScore || 0, score);
            g.highWave = Math.max(g.highWave || 0, wave);
            g.highCombo = Math.max(g.highCombo || 0, maxCombo);
            g.totalKilled = (g.totalKilled || 0) + dogsKilled;
            g.totalPlays = (g.totalPlays || 0) + 1;
            if (typeof saveGame === 'function') saveGame();
        }

        settleButtons = [
            { text: '再来一局', x: CX - 72, y: 200, w: 64, h: 20, action: 'retry' },
            { text: '返回森林', x: CX + 8, y: 200, w: 64, h: 20, action: 'exit' },
        ];
    }

    function onClick(e) {
        if (phase !== 'settle' || !settleButtons.length) return;
        var rect = canvas.getBoundingClientRect();
        var mx = (e.clientX - rect.left) * (W / rect.width);
        var my = (e.clientY - rect.top) * (H / rect.height);

        for (var i = 0; i < settleButtons.length; i++) {
            var b = settleButtons[i];
            if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
                if (b.action === 'retry') { reset(); }
                else { exitGame(); }
                return;
            }
        }
    }

    // ===== 渲染 =====
    function draw() {
        ctx.save();
        ctx.translate(Math.round(shakeX), Math.round(shakeY));

        drawBackground();
        drawCampfire();

        // 狗
        for (var i = 0; i < dogs.length; i++) {
            if (dogs[i].alive) drawDog(dogs[i]);
        }

        drawParticles();
        drawFlashes();
        drawPopups();
        drawHUD();

        if (phase === 'playing' || phase === 'waveClear') drawInputBar();
        if (phase === 'countdown') drawCountdown();
        if (phase === 'waveClear') drawWaveClear();
        if (phase === 'settle') drawSettlement();

        // 受击红闪
        if (hitFlashT > 0) {
            ctx.fillStyle = 'rgba(255,30,30,' + (hitFlashT / 200 * 0.25) + ')';
            ctx.fillRect(0, 0, W, H);
        }

        ctx.restore();
    }

    function drawBackground() {
        ctx.fillStyle = '#040608';
        ctx.fillRect(0, 0, W, H);
        // 微弱绿色噪点
        for (var i = 0; i < 40; i++) {
            ctx.fillStyle = 'rgba(30,60,30,' + (0.05 + Math.random() * 0.08) + ')';
            var nx = (Math.sin(i * 137.5 + firePhase * 0.3) * 0.5 + 0.5) * W;
            var ny = (Math.cos(i * 97.3 + firePhase * 0.2) * 0.5 + 0.5) * H;
            ctx.fillRect(Math.floor(nx), Math.floor(ny), 2, 2);
        }
    }

    function drawCampfire() {
        var flicker = Math.sin(firePhase * 2) * 0.08;
        // 光晕
        var grd = ctx.createRadialGradient(CX, CY, 3, CX, CY, 60);
        grd.addColorStop(0, 'rgba(200,90,32,' + (0.18 + flicker) + ')');
        grd.addColorStop(1, 'rgba(200,90,32,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(CX - 60, CY - 60, 120, 120);
        // 火焰像素
        var fh = 4 + Math.sin(firePhase * 3) * 1.5;
        ctx.fillStyle = '#e87030';
        ctx.fillRect(CX - 1, CY - fh, 3, Math.floor(fh));
        ctx.fillStyle = '#c85a20';
        ctx.fillRect(CX - 2, CY - 2, 5, 3);
        ctx.fillStyle = '#8a3810';
        ctx.fillRect(CX - 3, CY + 1, 7, 2);
    }

    function drawDog(dog) {
        var sp = sprites[dog.size];
        if (!sp) return;
        var bobAmp = dog.isBoss ? 2.5 : 1.5;
        var ox = Math.floor(dog.x - sp.w / 2);
        var oy = Math.floor(dog.y - sp.h / 2 + Math.sin(dog.bobPhase) * bobAmp);
        var isTarget = dog === targetDog;
        var col = DOG_COLORS[dog.size];

        // boss 脉动光晕
        if (dog.isBoss) {
            var pulse = 0.12 + Math.sin(dog.bobPhase * 2) * 0.06;
            var radius = sp.w * (dog.size === 'boss_slow' ? 1.2 : 0.9);
            var grd = ctx.createRadialGradient(
                Math.floor(dog.x), Math.floor(dog.y), 2,
                Math.floor(dog.x), Math.floor(dog.y), radius
            );
            grd.addColorStop(0, col.glow);
            grd.addColorStop(1, 'transparent');
            ctx.globalAlpha = pulse;
            ctx.fillStyle = grd;
            ctx.fillRect(dog.x - radius, dog.y - radius, radius * 2, radius * 2);
            ctx.globalAlpha = 1;
        }

        // 目标高亮光圈
        if (isTarget) {
            ctx.strokeStyle = dog.isBoss ? col.eye : '#ffcc44';
            ctx.lineWidth = dog.isBoss ? 1.5 : 1;
            ctx.beginPath();
            ctx.arc(Math.floor(dog.x), Math.floor(dog.y), sp.w * 0.8, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 眼睛光晕
        sp.px.forEach(function (p) {
            if (p[2] === col.eye) {
                ctx.fillStyle = col.glow;
                ctx.fillRect(ox + p[0] - 1, oy + p[1] - 1, 3, 3);
            }
        });

        // 精灵本体
        sp.px.forEach(function (p) {
            ctx.fillStyle = p[2];
            ctx.fillRect(ox + p[0], oy + p[1], 1, 1);
        });

        // boss 名字标签
        if (dog.isBoss && dog.bossName) {
            ctx.font = '5px ' + FONT_PX;
            ctx.textAlign = 'center';
            ctx.fillStyle = col.eye;
            ctx.fillText(dog.bossName, Math.floor(dog.x), oy - 18);
        }

        // 词语
        var wordY = oy - (dog.isBoss ? 12 : 10);
        ctx.textAlign = 'center';

        // 中文词
        var fontSize = dog.isBoss ? 12 : (dog.size === 'l' ? 11 : 9);
        ctx.font = (dog.isBoss ? 'bold ' : '') + fontSize + 'px ' + FONT_CN;
        ctx.fillStyle = isTarget ? (dog.isBoss ? col.eye : '#ff6644') : (dog.isBoss ? '#cc8888' : '#aa8888');
        ctx.fillText(dog.text, Math.floor(dog.x), wordY);

        // 拼音
        var py = dog.pinyin;
        ctx.font = '6px ' + FONT_PX;
        var pyY = wordY + 8;
        var pyW = ctx.measureText(py).width;
        var pyX = Math.floor(dog.x) - pyW / 2;

        for (var ci = 0; ci < py.length; ci++) {
            ctx.fillStyle = ci < dog.typed ? '#44ff44' : (dog.isBoss ? '#666666' : '#555555');
            ctx.fillText(py[ci], pyX, pyY);
            pyX += ctx.measureText(py[ci]).width;
        }
    }

    function drawParticles() {
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            var a = Math.min(1, p.life / p.maxLife);
            ctx.globalAlpha = a;
            ctx.fillStyle = p.color;
            ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.sz, p.sz);
        }
        ctx.globalAlpha = 1;
    }

    function drawFlashes() {
        for (var i = 0; i < flashes.length; i++) {
            var f = flashes[i];
            var prog = 1 - f.t / f.max;
            var a = 1 - prog;
            var sz = 14 + prog * 10;
            ctx.globalAlpha = a * 0.9;
            ctx.font = 'bold ' + Math.floor(sz) + 'px ' + FONT_CN;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ff4444';
            ctx.fillText(f.text, Math.floor(f.x), Math.floor(f.y - prog * 20));
            // 删除线效果
            if (prog > 0.15) {
                ctx.strokeStyle = '#ffcc44';
                ctx.lineWidth = 2;
                var tw = ctx.measureText(f.text).width;
                var lineY = Math.floor(f.y - prog * 20) - sz * 0.3;
                ctx.beginPath();
                ctx.moveTo(f.x - tw / 2 - 4, lineY);
                ctx.lineTo(f.x + tw / 2 + 4, lineY);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawPopups() {
        for (var i = 0; i < popups.length; i++) {
            var p = popups[i];
            var a = Math.min(1, p.t / p.max);
            ctx.globalAlpha = a;
            ctx.font = '7px ' + FONT_PX;
            ctx.textAlign = 'center';
            ctx.fillStyle = p.color;
            ctx.fillText(p.text, Math.floor(p.x), Math.floor(p.y));
        }
        ctx.globalAlpha = 1;
    }

    function drawHUD() {
        // 顶栏背景
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, 18);

        ctx.font = '7px ' + FONT_PX;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#888888';
        ctx.fillText('WAVE', 4, 12);
        ctx.fillStyle = '#dddddd';
        ctx.fillText('' + wave, 40, 12);

        ctx.fillStyle = '#888888';
        ctx.fillText('SCORE', 70, 12);
        ctx.fillStyle = '#ffcc44';
        ctx.fillText('' + score, 115, 12);

        // 连击
        if (combo >= 2) {
            ctx.fillStyle = '#ff8844';
            ctx.fillText('x' + combo, 160, 12);
        }

        // 生命值（右侧）
        ctx.textAlign = 'right';
        var livesStr = '';
        for (var i = 0; i < MAX_LIVES; i++) {
            livesStr += i < lives ? '♥' : '·';
        }
        ctx.fillStyle = lives <= 1 ? '#ff3333' : '#ff8844';
        ctx.fillText(livesStr, W - 4, 12);
    }

    function drawInputBar() {
        var barY = H - 42;
        ctx.fillStyle = 'rgba(8,8,16,0.85)';
        ctx.fillRect(0, barY, W, 42);
        ctx.strokeStyle = '#222233';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, barY); ctx.lineTo(W, barY);
        ctx.stroke();

        var inputColor = inputFlash > 0 ? '#ff4444' : '#44ff44';

        ctx.font = '8px ' + FONT_PX;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#555555';
        ctx.fillText('>', 8, barY + 16);

        // 已输入文字
        ctx.fillStyle = inputColor;
        ctx.fillText(input, 20, barY + 16);

        // 光标闪烁
        if (Math.floor(firePhase * 3) % 2 === 0) {
            var cursorX = 20 + ctx.measureText(input).width;
            ctx.fillStyle = inputColor;
            ctx.fillRect(cursorX + 1, barY + 8, 5, 2);
        }

        // 目标提示
        if (targetDog && targetDog.alive) {
            ctx.font = '10px ' + FONT_CN;
            ctx.fillStyle = '#ff6644';
            ctx.textAlign = 'center';
            ctx.fillText('[ ' + targetDog.text + ' ]', CX, barY + 34);
        } else {
            ctx.font = '6px ' + FONT_PX;
            ctx.fillStyle = '#333344';
            ctx.textAlign = 'center';
            ctx.fillText('TYPE PINYIN TO KILL', CX, barY + 34);
        }
    }

    function drawCountdown() {
        var n = Math.ceil(phaseTimer / 1000);
        var sub = (phaseTimer % 1000) / 1000;
        var sz = 20 + (1 - sub) * 8;
        ctx.globalAlpha = sub;
        ctx.font = Math.floor(sz) + 'px ' + FONT_PX;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff8844';
        ctx.fillText('' + n, CX, CY);
        ctx.globalAlpha = 1;
    }

    function drawWaveClear() {
        var prog = 1 - phaseTimer / 2200;
        ctx.font = '10px ' + FONT_PX;
        ctx.textAlign = 'center';
        if (prog < 0.5) {
            ctx.globalAlpha = Math.min(1, prog * 4);
            ctx.fillStyle = '#44ff44';
            ctx.fillText('WAVE ' + wave + ' CLEAR', CX, CY - 10);
        } else {
            ctx.globalAlpha = Math.min(1, (prog - 0.5) * 4);
            ctx.fillStyle = '#ffcc44';
            ctx.fillText('WAVE ' + (wave + 1), CX, CY - 10);
        }
        ctx.globalAlpha = 1;
    }

    function drawSettlement() {
        if (!settleData) return;
        // 半透明遮罩
        ctx.fillStyle = 'rgba(3,3,6,0.88)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';

        // 标题
        ctx.font = '12px ' + FONT_PX;
        ctx.fillStyle = '#ff8844';
        ctx.fillText(lives <= 0 ? 'GAME OVER' : 'RETREAT', CX, 50);

        // 统计
        ctx.font = '7px ' + FONT_PX;
        var items = [
            ['SCORE', '' + settleData.score, '#ffcc44'],
            ['WAVE', '' + settleData.wave, '#dddddd'],
            ['KILLED', '' + settleData.killed, '#ff8844'],
            ['MAX COMBO', '' + settleData.maxCombo, '#ff6644'],
            ['ASH EARNED', '+' + settleData.ash, '#ccaa66'],
        ];
        items.forEach(function (item, idx) {
            var y = 80 + idx * 18;
            ctx.textAlign = 'right';
            ctx.fillStyle = '#666677';
            ctx.fillText(item[0], CX - 8, y);
            ctx.textAlign = 'left';
            ctx.fillStyle = item[2];
            ctx.fillText(item[1], CX + 8, y);
        });

        // 按钮
        settleButtons.forEach(function (b) {
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(b.x, b.y, b.w, b.h);
            ctx.strokeStyle = '#444466';
            ctx.lineWidth = 1;
            ctx.strokeRect(b.x, b.y, b.w, b.h);
            ctx.font = '11px ' + FONT_CN;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#aaaacc';
            ctx.fillText(b.text, b.x + b.w / 2, b.y + 15);
        });

        // ESC 提示
        ctx.font = '5px ' + FONT_PX;
        ctx.fillStyle = '#333344';
        ctx.textAlign = 'center';
        ctx.fillText('ESC TO EXIT', CX, H - 16);
    }

    return { launch: launch };
})();

window.BlackDogGame = BlackDogGame;
