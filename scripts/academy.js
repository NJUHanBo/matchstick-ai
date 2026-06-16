/**
 * 魔法学院废墟 — 羊皮纸挖掘 & 收藏系统
 */
var Academy = {
    DIG_COST: { energy: 5, spirit: 5, ash: 50 },

    getTotalFragments() {
        if (typeof PARCHMENT_STORIES === 'undefined') return 0;
        return PARCHMENT_STORIES.reduce((sum, s) => sum + s.fragments.length, 0);
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
        if (typeof PARCHMENT_STORIES === 'undefined') return [];
        const discovered = this.getDiscovered();
        const all = PARCHMENT_STORIES.flatMap(s => s.fragments.map(f => f.id));
        return all.filter(id => !discovered.includes(id));
    },

    canDig() {
        const s = GameState.stats;
        const c = this.DIG_COST;
        return s.energy >= c.energy && s.spirit >= c.spirit && s.ash >= c.ash && this.getUndiscoveredIds().length > 0;
    },

    excavate() {
        if (!this.canDig()) return null;

        const s = GameState.stats;
        const c = this.DIG_COST;
        s.energy -= c.energy;
        s.spirit -= c.spirit;
        s.ash -= c.ash;

        const undiscovered = this.getUndiscoveredIds();
        const targetId = undiscovered[Math.floor(Math.random() * undiscovered.length)];
        this.getDiscovered().push(targetId);
        GameState.magicAcademy.lastExcavation = new Date().toISOString();

        saveGame();
        if (typeof updateResources === 'function') updateResources();

        for (const story of PARCHMENT_STORIES) {
            const fragment = story.fragments.find(f => f.id === targetId);
            if (fragment) return { fragment, story };
        }
        return null;
    },

    getStoryProgress(story) {
        const discovered = this.getDiscovered();
        const found = story.fragments.filter(f => discovered.includes(f.id)).length;
        return { found, total: story.fragments.length };
    },

    render() {
        if (typeof PARCHMENT_STORIES === 'undefined') {
            const stories = document.getElementById('academy-stories');
            if (stories) {
                stories.innerHTML = '<p class="academy-warning">羊皮纸数据加载失败，请强制刷新页面（Cmd+Shift+R）。</p>';
            }
            return;
        }

        this._updateDigSection();
        this._renderStories();
    },

    _updateDigSection() {
        const total = this.getTotalFragments();
        const discoveredCount = this.getDiscovered().length;
        const allDone = this.getUndiscoveredIds().length === 0;
        const canDig = this.canDig();
        const s = GameState.stats;

        const progress = document.getElementById('academy-progress');
        const btn = document.getElementById('academy-dig-btn');
        const warning = document.getElementById('academy-warning');

        if (progress) progress.textContent = `${discoveredCount} / ${total}`;
        if (btn) {
            btn.disabled = !canDig;
            btn.textContent = allDone ? '已收集完毕' : '挖掘';
        }
        if (warning) {
            if (!allDone && !canDig) {
                warning.textContent = `资源不足（体力 ${s.energy}，精力 ${s.spirit}，灰烬 ${s.ash}）`;
                warning.classList.remove('hidden');
            } else {
                warning.textContent = '';
                warning.classList.add('hidden');
            }
        }
    },

    _renderStories() {
        const container = document.getElementById('academy-stories');
        if (!container) return;

        let html = '';
        for (const story of PARCHMENT_STORIES) {
            const { found, total: stotal } = this.getStoryProgress(story);
            const pct = stotal > 0 ? Math.round((found / stotal) * 100) : 0;
            const colorVar = this._cssColor(story.color);

            html += `<div class="academy-story" data-story="${story.id}">`;
            html += `<button type="button" class="academy-story-header" onclick="Academy.toggleStory('${story.id}')" style="--story-color: ${colorVar}">`;
            html += `<div class="academy-story-left">`;
            html += `<span class="academy-story-dot" style="background: ${colorVar}"></span>`;
            html += `<span class="academy-story-name">${story.name}</span>`;
            html += `</div>`;
            html += `<div class="academy-story-right">`;
            html += `<span class="academy-story-count">${found}/${stotal}</span>`;
            html += `<span class="academy-story-arrow">▼</span>`;
            html += `</div>`;
            html += `</button>`;
            html += `<div class="academy-progress-bar"><div class="academy-progress-fill" style="width:${pct}%; background:${colorVar}"></div></div>`;
            html += `<p class="academy-story-desc">${story.description}</p>`;
            html += `<div class="academy-fragments hidden" id="fragments-${story.id}">`;
            for (const frag of story.fragments) {
                const isFound = this.getDiscovered().includes(frag.id);
                html += `<button type="button" class="academy-frag ${isFound ? 'found' : 'locked'}" ${isFound ? `onclick="Academy.viewFragment('${frag.id}')"` : 'disabled'} style="--story-color: ${colorVar}">`;
                html += isFound ? frag.title : '???';
                html += `</button>`;
            }
            html += `</div></div>`;
        }
        container.innerHTML = html;
    },

    toggleStory(storyId) {
        const el = document.getElementById('fragments-' + storyId);
        if (el) el.classList.toggle('hidden');
    },

    handleDig() {
        const result = this.excavate();
        if (!result) return;
        this.showDigResult(result);
        this.render();
    },

    showDigResult(result) {
        const { fragment, story } = result;
        const colorVar = this._cssColor(story.color);
        const colorName = PARCHMENT_COLORS[story.color] || '';

        const overlay = document.createElement('div');
        overlay.id = 'parchment-reveal-overlay';
        overlay.className = 'timer-overlay';
        overlay.innerHTML = `
            <div class="parchment-reveal" style="--story-color: ${colorVar}">
                <div class="parchment-reveal-header">
                    <span class="parchment-reveal-badge" style="background: ${colorVar}">发现新碎片</span>
                    <span class="parchment-reveal-from">来自「${story.name}」· ${colorName}羊皮纸</span>
                </div>
                <h3 class="parchment-reveal-title" style="color: ${colorVar}">${fragment.title}</h3>
                <div class="parchment-reveal-content">${fragment.content}</div>
                <button class="r8-btn r8-btn--primary" type="button" onclick="Academy.closeReveal()">收下</button>
            </div>
        `;
        document.body.appendChild(overlay);
    },

    closeReveal() {
        const el = document.getElementById('parchment-reveal-overlay');
        if (el) el.remove();
    },

    viewFragment(fragId) {
        let fragment = null;
        let story = null;
        for (const s of PARCHMENT_STORIES) {
            const f = s.fragments.find(x => x.id === fragId);
            if (f) { fragment = f; story = s; break; }
        }
        if (!fragment || !story) return;

        const colorVar = this._cssColor(story.color);
        const colorName = PARCHMENT_COLORS[story.color] || '';

        const overlay = document.createElement('div');
        overlay.id = 'parchment-read-overlay';
        overlay.className = 'timer-overlay';
        overlay.innerHTML = `
            <div class="parchment-reveal" style="--story-color: ${colorVar}">
                <div class="parchment-reveal-header">
                    <span class="parchment-reveal-badge" style="background: ${colorVar}">${story.name}</span>
                    <span class="parchment-reveal-from">${colorName}羊皮纸</span>
                </div>
                <h3 class="parchment-reveal-title" style="color: ${colorVar}">${fragment.title}</h3>
                <div class="parchment-reveal-content">${fragment.content}</div>
                <button class="r8-btn r8-btn--secondary" type="button" onclick="Academy.closeRead()">关闭</button>
            </div>
        `;
        document.body.appendChild(overlay);
    },

    closeRead() {
        const el = document.getElementById('parchment-read-overlay');
        if (el) el.remove();
    },

    _cssColor(colorName) {
        const map = {
            brown: '#a0522d', gray: '#808080', red: '#dc3545',
            blue: '#4a90d9', gold: '#d4a017', purple: '#8b5cf6',
            green: '#5aaa50', silver: '#a0a0a0', orange: '#e87030',
            yellow: '#d4b000', crimson: '#dc143c', teal: '#2d9999',
            indigo: '#6366f1',
        };
        return map[colorName] || '#808080';
    },
};

window.Academy = Academy;
