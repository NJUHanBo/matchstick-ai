/**
 * 地图地点 Overlay 系统
 */
var MapUI = {
    current: null,

    titles: {
        camp: '🔥 营地篝火',
        god: '🕯️ 神使残响',
        academy: '📜 魔法学院废墟',
        tomb: '🌱 战友陵墓',
        forest: '🐕 森林边缘',
        bazi: '☯ 命火祭坛',
        garden: '🌸 种子花园',
    },

    open(id) {
        if (!this.titles[id]) return;
        this.current = id;
        if (window.Analytics) Analytics.trackLocationEnter(id);
        const root = document.getElementById('loc-overlay-root');
        root.classList.remove('hidden');
        document.querySelectorAll('.loc-panel').forEach(p => p.classList.add('hidden'));
        const panel = document.getElementById('loc-' + id);
        if (panel) panel.classList.remove('hidden');
        document.getElementById('loc-overlay-title').textContent = this.titles[id];
        if (window.TileMap) TileMap.pause();
        if (id === 'god') {
            setTimeout(() => {
                const input = document.getElementById('chat-input');
                if (input) input.focus();
            }, 100);
        }
        if (id === 'academy') {
            requestAnimationFrame(() => {
                if (window.Academy && Academy.render) Academy.render();
            });
        }
        if (id === 'tomb') {
            requestAnimationFrame(() => {
                if (window.TaskSystem && TaskSystem.render) TaskSystem.render();
            });
        }
        if (id === 'bazi') {
            requestAnimationFrame(() => {
                if (window.BaziModule && BaziModule.init) BaziModule.init();
            });
        }
        if (id === 'garden') {
            requestAnimationFrame(() => {
                if (window.GardenUI && GardenUI.init) GardenUI.init();
            });
        }
        if (id === 'forest') {
            requestAnimationFrame(() => {
                if (window.ForestUI && ForestUI.render) ForestUI.render();
            });
        }
    },

    close() {
        this.current = null;
        document.getElementById('loc-overlay-root').classList.add('hidden');
        document.querySelectorAll('.loc-panel').forEach(p => p.classList.add('hidden'));
        if (window.TileMap) TileMap.resume();
    },
};

function closeLocationOverlay() {
    MapUI.close();
}

window.MapUI = MapUI;
