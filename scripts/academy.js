/**
 * 魔法学院废墟 — 羊皮纸挖掘 & 收藏系统
 * 支持多章节：守门人日记全部收集后解锁微光石档案
 */
var Academy = {
    DIG_COST: { energy: 5, spirit: 5, ash: 50 },

    // 获取当前可用的所有故事（含章节解锁逻辑）
    getAllStories() {
        var stories = [];
        if (typeof PARCHMENT_STORIES !== 'undefined') {
            stories = stories.concat(PARCHMENT_STORIES);
        }
        if (this.isCrystalChapterUnlocked() && typeof CRYSTAL_FRAGMENTS !== 'undefined') {
            stories = stories.concat(CRYSTAL_FRAGMENTS);
        }
        return stories;
    },

    // 守门人日记是否全部收集
    isGatekeeperComplete() {
        if (typeof PARCHMENT_STORIES === 'undefined') return false;
        var gk = PARCHMENT_STORIES.find(function (s) { return s.id === 'gatekeeper_diary'; });
        if (!gk) return false;
        var discovered = this.getDiscovered();
        return gk.fragments.every(function (f) { return discovered.indexOf(f.id) !== -1; });
    },

    // 微光石档案是否已解锁
    isCrystalChapterUnlocked() {
        return GameState.crystalChapterUnlocked === true;
    },

    // 解锁微光石档案
    unlockCrystalChapter() {
        if (GameState.crystalChapterUnlocked) return;
        GameState.crystalChapterUnlocked = true;
        saveGame();
    },

    getTotalFragments() {
        return this.getAllStories().reduce(function (sum, s) { return sum + s.fragments.length; }, 0);
    },

    getDiscovered() {
        if (!GameState.magicAcademy) {
            GameState.magicAcademy = { discoveredParchments: [], lastExcavation: null };
        }
        if (!Array.isArray(GameState.magicAcademy.discoveredParchments)) {
            GameState.magicAcademy.discoveredParchments = [];
        }
        return GameState.magicAcademy.discoveredParchments;
    },

    getUndiscoveredIds() {
        var discovered = this.getDiscovered();
        var all = this.getAllStories().reduce(function (arr, s) {
            return arr.concat(s.fragments.map(function (f) { return f.id; }));
        }, []);
        return all.filter(function (id) { return discovered.indexOf(id) === -1; });
    },

    canDig() {
        var s = GameState.stats;
        var c = this.DIG_COST;
        return s.energy >= c.energy && s.spirit >= c.spirit && s.ash >= c.ash && this.getUndiscoveredIds().length > 0;
    },

    excavate() {
        if (!this.canDig()) return null;

        var s = GameState.stats;
        var c = this.DIG_COST;
        s.energy -= c.energy;
        s.spirit -= c.spirit;
        s.ash -= c.ash;

        var undiscovered = this.getUndiscoveredIds();
        var targetId = undiscovered[Math.floor(Math.random() * undiscovered.length)];
        this.getDiscovered().push(targetId);
        GameState.magicAcademy.lastExcavation = new Date().toISOString();

        saveGame();
        if (typeof updateResources === 'function') updateResources();

        var stories = this.getAllStories();
        for (var i = 0; i < stories.length; i++) {
            var fragment = stories[i].fragments.find(function (f) { return f.id === targetId; });
            if (fragment) return { fragment: fragment, story: stories[i] };
        }
        return null;
    },

    getStoryProgress(story) {
        var discovered = this.getDiscovered();
        var found = story.fragments.filter(function (f) { return discovered.indexOf(f.id) !== -1; }).length;
        return { found: found, total: story.fragments.length };
    },

    render() {
        var stories = this.getAllStories();
        if (stories.length === 0) {
            var el = document.getElementById('academy-stories');
            if (el) {
                el.innerHTML = '<p class="academy-warning">羊皮纸数据加载失败，请强制刷新页面（Cmd+Shift+R）。</p>';
            }
            return;
        }

        this._updateDigSection();
        this._renderStories();
    },

    _updateDigSection() {
        var total = this.getTotalFragments();
        var discoveredCount = this.getDiscovered().length;
        var allDone = this.getUndiscoveredIds().length === 0;
        var canDig = this.canDig();
        var s = GameState.stats;

        var progress = document.getElementById('academy-progress');
        var btn = document.getElementById('academy-dig-btn');
        var warning = document.getElementById('academy-warning');

        if (progress) progress.textContent = discoveredCount + ' / ' + total;
        if (btn) {
            btn.disabled = !canDig;
            btn.textContent = allDone ? '已收集完毕' : '挖掘';
        }
        if (warning) {
            if (!allDone && !canDig) {
                warning.textContent = '资源不足（体力 ' + s.energy + '，精力 ' + s.spirit + '，灰烬 ' + s.ash + '）';
                warning.classList.remove('hidden');
            } else {
                warning.textContent = '';
                warning.classList.add('hidden');
            }
        }
    },

    _renderStories() {
        var container = document.getElementById('academy-stories');
        if (!container) return;

        var stories = this.getAllStories();
        var html = '';
        for (var i = 0; i < stories.length; i++) {
            var story = stories[i];
            var progress = this.getStoryProgress(story);
            var pct = progress.total > 0 ? Math.round((progress.found / progress.total) * 100) : 0;
            var colorVar = this._cssColor(story.color);

            html += '<div class="academy-story" data-story="' + story.id + '">';
            html += '<button type="button" class="academy-story-header" onclick="Academy.toggleStory(\'' + story.id + '\')" style="--story-color: ' + colorVar + '">';
            html += '<div class="academy-story-left">';
            html += '<span class="academy-story-dot" style="background: ' + colorVar + '"></span>';
            html += '<span class="academy-story-name">' + story.name + '</span>';
            html += '</div>';
            html += '<div class="academy-story-right">';
            html += '<span class="academy-story-count">' + progress.found + '/' + progress.total + '</span>';
            html += '<span class="academy-story-arrow">▼</span>';
            html += '</div>';
            html += '</button>';
            html += '<div class="academy-progress-bar"><div class="academy-progress-fill" style="width:' + pct + '%; background:' + colorVar + '"></div></div>';
            html += '<p class="academy-story-desc">' + story.description + '</p>';
            html += '<div class="academy-fragments hidden" id="fragments-' + story.id + '">';
            for (var j = 0; j < story.fragments.length; j++) {
                var frag = story.fragments[j];
                var isFound = this.getDiscovered().indexOf(frag.id) !== -1;
                html += '<button type="button" class="academy-frag ' + (isFound ? 'found' : 'locked') + '" ' + (isFound ? 'onclick="Academy.viewFragment(\'' + frag.id + '\')"' : 'disabled') + ' style="--story-color: ' + colorVar + '">';
                html += isFound ? frag.title : '???';
                html += '</button>';
            }
            html += '</div></div>';
        }
        container.innerHTML = html;
    },

    toggleStory(storyId) {
        var el = document.getElementById('fragments-' + storyId);
        if (el) el.classList.toggle('hidden');
    },

    handleDig() {
        var result = this.excavate();
        if (!result) return;
        this.showDigResult(result);
        this.render();

        // 挖掘后检查守门人日记是否全部收集
        if (!this.isCrystalChapterUnlocked() && this.isGatekeeperComplete()) {
            var self = this;
            setTimeout(function () {
                self.showChapterTransition();
            }, 800);
        }
    },

    // 章节过渡：零的独白
    showChapterTransition() {
        this.unlockCrystalChapter();

        var overlay = document.createElement('div');
        overlay.id = 'chapter-transition-overlay';
        overlay.className = 'chapter-transition';

        var lines = [
            '……',
            '守门人提到了"终极火种"。',
            '它是神光晶体的碎片。院长用最后的力量，将七个火种碎片分离，交由守门人保管。',
            '可晶体本身是什么？它从何而来？',
            '这个词……我在别的地方好像也见过。',
            '在部落长老的口述里，在矿工的闲谈中，在废墟的裂缝上。',
            '它们叫它不同的名字——"暖石"、"天降之骨"、"河心石"、"镇宅石"。',
            '说的是不是同一种东西？',
            '我需要继续挖下去。',
        ];

        var html = '<div class="chapter-transition-content">';
        for (var i = 0; i < lines.length; i++) {
            html += '<p class="chapter-line" style="animation-delay: ' + (i * 1200) + 'ms">' + lines[i] + '</p>';
        }
        var totalDelay = lines.length * 1200 + 500;
        html += '<div class="chapter-unlock" style="animation-delay: ' + totalDelay + 'ms">';
        html += '<p class="chapter-unlock-text">新的挖掘方向已解锁</p>';
        html += '<p class="chapter-unlock-name">📜 微光石档案</p>';
        html += '<button class="r8-btn r8-btn--primary" onclick="Academy.closeTransition()">继续挖掘</button>';
        html += '</div>';
        html += '</div>';

        overlay.innerHTML = html;
        document.body.appendChild(overlay);

        this.render();
    },

    closeTransition() {
        var el = document.getElementById('chapter-transition-overlay');
        if (el) el.remove();
    },

    showDigResult(result) {
        var fragment = result.fragment;
        var story = result.story;
        var colorVar = this._cssColor(story.color);
        var colorName = PARCHMENT_COLORS[story.color] || '';

        var overlay = document.createElement('div');
        overlay.id = 'parchment-reveal-overlay';
        overlay.className = 'timer-overlay';
        overlay.innerHTML =
            '<div class="parchment-reveal" style="--story-color: ' + colorVar + '">' +
            '<div class="parchment-reveal-header">' +
            '<span class="parchment-reveal-badge" style="background: ' + colorVar + '">发现新碎片</span>' +
            '<span class="parchment-reveal-from">来自「' + story.name + '」· ' + colorName + '羊皮纸</span>' +
            '</div>' +
            '<h3 class="parchment-reveal-title" style="color: ' + colorVar + '">' + fragment.title + '</h3>' +
            '<div class="parchment-reveal-content">' + fragment.content.replace(/\n/g, '<br>') + '</div>' +
            '<button class="r8-btn r8-btn--primary" type="button" onclick="Academy.closeReveal()">收下</button>' +
            '</div>';
        document.body.appendChild(overlay);
    },

    closeReveal() {
        var el = document.getElementById('parchment-reveal-overlay');
        if (el) el.remove();
    },

    viewFragment(fragId) {
        var fragment = null;
        var story = null;
        var stories = this.getAllStories();
        for (var i = 0; i < stories.length; i++) {
            var f = stories[i].fragments.find(function (x) { return x.id === fragId; });
            if (f) { fragment = f; story = stories[i]; break; }
        }
        if (!fragment || !story) return;

        var colorVar = this._cssColor(story.color);
        var colorName = PARCHMENT_COLORS[story.color] || '';

        var overlay = document.createElement('div');
        overlay.id = 'parchment-read-overlay';
        overlay.className = 'timer-overlay';
        overlay.innerHTML =
            '<div class="parchment-reveal" style="--story-color: ' + colorVar + '">' +
            '<div class="parchment-reveal-header">' +
            '<span class="parchment-reveal-badge" style="background: ' + colorVar + '">' + story.name + '</span>' +
            '<span class="parchment-reveal-from">' + colorName + '羊皮纸</span>' +
            '</div>' +
            '<h3 class="parchment-reveal-title" style="color: ' + colorVar + '">' + fragment.title + '</h3>' +
            '<div class="parchment-reveal-content">' + fragment.content.replace(/\n/g, '<br>') + '</div>' +
            '<button class="r8-btn r8-btn--secondary" type="button" onclick="Academy.closeRead()">关闭</button>' +
            '</div>';
        document.body.appendChild(overlay);
    },

    closeRead() {
        var el = document.getElementById('parchment-read-overlay');
        if (el) el.remove();
    },

    _cssColor(colorName) {
        var map = {
            brown: '#a0522d', gray: '#808080', red: '#dc3545',
            blue: '#4a90d9', gold: '#d4a017', purple: '#8b5cf6',
            green: '#5aaa50', silver: '#a0a0a0', orange: '#e87030',
            yellow: '#d4b000', crimson: '#dc143c', teal: '#2d9999',
            indigo: '#6366f1', white: '#c8c0b0',
        };
        return map[colorName] || '#808080';
    },
};

window.Academy = Academy;
