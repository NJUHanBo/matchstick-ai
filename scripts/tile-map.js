/**
 * 萤火虫森林 · Tile 地图引擎
 * 16px 瓦片，Canvas 像素渲染，点击移动 + 地点交互
 */
(function () {
    const TILE = 16;
    const MAP_W = 24;
    const MAP_H = 14;

    // 瓦片类型：walk 是否可行走
    const TILE_META = {
        0: { walk: false }, // 虚空
        1: { walk: true },  // 深草
        2: { walk: true },  // 浅草
        3: { walk: true },  // 土路
        4: { walk: false }, // 树
        5: { walk: false }, // 深水
        6: { walk: true },  // 营火
        7: { walk: true },  // 废墟地面
        8: { walk: false }, // 废墟墙
        9: { walk: true },  // 陵墓
        10: { walk: false },// 黑森林灌丛
        11: { walk: true }, // 神使灰烬台
        12: { walk: true }, // 苔藓
        13: { walk: true }, // 命火祭坛
    };

    const LOCATIONS = [
        { id: 'camp', name: '营地篝火', tx: 12, ty: 7, icon: '🔥', color: '#c85a20' },
        { id: 'god', name: '神使残响', tx: 19, ty: 3, icon: '🕯️', color: '#5aaa50' },
        { id: 'academy', name: '魔法学院废墟', tx: 5, ty: 3, icon: '📜', color: '#8a7030' },
        { id: 'tomb', name: '战友陵墓', tx: 5, ty: 10, icon: '🌱', color: '#70b050' },
        { id: 'forest', name: '森林边缘', tx: 19, ty: 10, icon: '🐕', color: '#4a4a60' },
        { id: 'bazi', name: '命火祭坛', tx: 15, ty: 2, icon: '☯', color: '#7a50aa' },
        { id: 'garden', name: '种子花园', tx: 9, ty: 11, icon: '🌸', color: '#c070a0' },
    ];

    function buildMapData() {
        const m = [];
        for (let y = 0; y < MAP_H; y++) {
            const row = [];
            for (let x = 0; x < MAP_W; x++) {
                const edge = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;
                if (edge) {
                    row.push(4);
                } else {
                    row.push((x + y) % 3 === 0 ? 2 : 1);
                }
            }
            m.push(row);
        }

        // 中央十字土路
        for (let x = 1; x < MAP_W - 1; x++) m[7][x] = 3;
        for (let y = 1; y < MAP_H - 1; y++) m[y][12] = 3;

        // 营火
        m[7][12] = 6;
        m[7][11] = 3;
        m[7][13] = 3;

        // 魔法学院废墟（左上）
        for (let y = 2; y <= 5; y++) {
            for (let x = 3; x <= 7; x++) m[y][x] = 7;
        }
        m[2][3] = m[2][7] = m[5][3] = m[5][7] = 8;
        m[2][4] = m[2][5] = m[2][6] = 8;
        m[5][4] = m[5][5] = m[5][6] = 8;
        m[3][3] = m[4][3] = m[3][7] = m[4][7] = 8;
        m[3][5] = 7;
        m[4][4] = 7;
        m[3][3] = 7; // 留一个入口
        m[5][5] = 3;

        // 神使残响（右上灰烬台）
        for (let y = 2; y <= 4; y++) {
            for (let x = 17; x <= 20; x++) m[y][x] = 12;
        }
        m[3][19] = 11;

        // 战友陵墓（左下）
        for (let y = 9; y <= 11; y++) {
            for (let x = 3; x <= 7; x++) m[y][x] = 9;
        }
        m[10][5] = 9;
        m[8][5] = 3;

        // 森林边缘（右下黑灌丛）
        for (let y = 9; y <= 11; y++) {
            for (let x = 17; x <= 20; x++) {
                if ((x + y) % 2 === 0) m[y][x] = 10;
                else m[y][x] = 1;
            }
        }
        m[8][19] = 3;
        m[9][19] = 1;

        // 种子花园（下方中部）
        for (let y = 10; y <= 12; y++) {
            for (let x = 8; x <= 10; x++) m[y][x] = 12;
        }
        m[11][9] = 2;
        m[10][9] = 3;

        // 散布树木
        const trees = [
            [2, 10], [2, 12], [21, 5], [21, 7], [10, 2], [14, 2],
            [10, 11], [14, 11], [8, 5], [16, 5], [8, 9], [16, 9],
        ];
        trees.forEach(([x, y]) => { if (m[y][x] !== 3 && m[y][x] !== 6) m[y][x] = 4; });

        // 小水洼
        m[5][15] = 5;
        m[5][16] = 5;

        // 命火祭坛（上方中偏右）
        m[2][15] = 13;
        m[1][14] = 12;
        m[1][15] = 12;
        m[1][16] = 12;
        m[2][14] = 12;
        m[2][16] = 12;
        m[3][15] = 3;

        return m;
    }

    function drawTileset() {
        const cols = 8;
        const size = TILE;
        const ts = document.createElement('canvas');
        ts.width = cols * size;
        ts.height = size * 3;
        const t = ts.getContext('2d');

        function rect(idx, x, y, w, h, color) {
            const col = (idx % cols) * size;
            const row = Math.floor(idx / cols) * size;
            t.fillStyle = color;
            t.fillRect(col + x, row + y, w, h);
        }

        function px(idx, pixels, base) {
            const col = (idx % cols) * size;
            const row = Math.floor(idx / cols) * size;
            pixels.forEach(([dx, dy, c]) => {
                t.fillStyle = c;
                t.fillRect(col + dx, row + dy, 1, 1);
            });
            if (base) {
                t.fillStyle = base;
                t.fillRect(col, row, size, size);
                pixels.forEach(([dx, dy, c]) => {
                    t.fillStyle = c;
                    t.fillRect(col + dx, row + dy, 1, 1);
                });
            }
        }

        // 0 void
        rect(0, 0, 0, size, size, '#050508');
        // 1 dark grass
        px(1, [
            [2,4,'#0f1a0f'],[6,3,'#122012'],[10,8,'#0d180d'],[13,5,'#101c10'],
            [4,10,'#0e190e'],[8,12,'#111d11'],[14,2,'#0f1a0f'],
        ], '#0a120a');
        // 2 light grass
        px(2, [
            [3,5,'#152515'],[7,9,'#182818'],[11,4,'#142214'],[5,12,'#162616'],
        ], '#0d160d');
        // 3 path
        px(3, [
            [1,1,'#3a3020'],[5,4,'#4a3828'],[9,7,'#352818'],[13,3,'#403025'],
            [7,11,'#3a3020'],[2,8,'#453528'],
        ], '#2a2018');
        // 4 tree
        px(4, [
            [7,2,'#1a3018'],[6,3,'#224022'],[8,3,'#224022'],[5,4,'#2a5028'],
            [7,4,'#3a6840'],[9,4,'#2a5028'],[6,5,'#3a6840'],[8,5,'#3a6840'],
            [7,5,'#5aaa50'],[4,6,'#2a5028'],[10,6,'#2a5028'],[7,7,'#1a2818'],
            [6,8,'#1a2818'],[8,8,'#1a2818'],[7,9,'#151f15'],
        ], '#0a120a');
        // 5 water
        px(5, [
            [4,6,'#0a1828'],[8,5,'#0c1a2a'],[11,8,'#081520'],[6,9,'#0a1828'],
        ], '#060e18');
        // 6 campfire
        px(6, [
            [6,8,'#5a2000'],[7,8,'#5a2000'],[8,8,'#5a2000'],
            [5,9,'#8a3810'],[6,9,'#c85a20'],[7,9,'#e87030'],[8,9,'#c85a20'],[9,9,'#8a3810'],
            [6,10,'#5a2000'],[7,10,'#8a3810'],[8,10,'#5a2000'],
            [4,11,'#2a2018'],[5,11,'#3a3020'],[6,11,'#3a3020'],[7,11,'#3a3020'],
            [8,11,'#3a3020'],[9,11,'#3a3020'],[10,11,'#2a2018'],
        ], '#2a2018');
        // 7 ruins floor
        px(7, [
            [2,2,'#1a1a22'],[6,4,'#222230'],[10,7,'#1a1a22'],[13,3,'#252535'],
        ], '#12121a');
        // 8 ruins wall
        px(8, [
            [0,0,'#2a2a38'],[1,0,'#353545'],[2,0,'#2a2a38'],
            [0,1,'#353545'],[2,1,'#353545'],[0,2,'#2a2a38'],[1,2,'#404050'],[2,2,'#2a2a38'],
            [4,4,'#303040'],[8,6,'#353545'],[12,4,'#303040'],
        ], '#1a1a28');
        // 9 tomb
        px(9, [
            [5,4,'#4a4a48'],[6,4,'#5a5a58'],[7,4,'#5a5a58'],[8,4,'#4a4a48'],
            [6,5,'#606060'],[7,5,'#606060'],[6,6,'#505050'],[7,6,'#505050'],
            [3,10,'#406030'],[11,10,'#406030'],[7,11,'#70b050'],
        ], '#0e140e');
        // 10 thicket
        px(10, [
            [3,5,'#0a0a12'],[7,4,'#12121a'],[11,6,'#0a0a12'],[5,9,'#151520'],
            [9,8,'#0a0a12'],[13,4,'#12121a'],
        ], '#060608');
        // 11 god altar
        px(11, [
            [4,6,'#5a5a50'],[5,6,'#6a6a60'],[6,6,'#8a7030'],[7,6,'#6a6a60'],[8,6,'#5a5a50'],
            [5,7,'#4a4a40'],[6,7,'#c85a20'],[7,7,'#4a4a40'],[6,8,'#8a3810'],
        ], '#101018');
        // 12 moss
        px(12, [
            [2,3,'#1a3018'],[8,6,'#224022'],[12,4,'#1a3018'],[5,10,'#224022'],
        ], '#0a120a');
        // 13 fortune altar
        px(13, [
            [5,6,'#3a2858'],[6,6,'#4a3870'],[7,6,'#5a4888'],[8,6,'#4a3870'],[9,6,'#3a2858'],
            [6,7,'#2a1848'],[7,7,'#7a50aa'],[8,7,'#2a1848'],
            [7,8,'#5a3880'],[6,9,'#1a1028'],[8,9,'#1a1028'],
            [5,10,'#12121a'],[6,10,'#1a1a28'],[7,10,'#1a1a28'],[8,10,'#1a1a28'],[9,10,'#12121a'],
        ], '#0a0a12');

        return ts;
    }

    class TileMapEngine {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.map = buildMapData();
            this.tileset = drawTileset();
            this.scale = 3;
            this.player = { tx: 12, ty: 9, path: [], pendingLocation: null };
            this.fireflies = [];
            this.paused = false;
            this.hoverTile = null;
            this.nearLocation = null;
            this.campfirePhase = 0;
            this._bindEvents();
            this._initFireflies();
            this._resize();
            window.addEventListener('resize', () => this._resize());
        }

        _initFireflies() {
            for (let i = 0; i < 24; i++) {
                this.fireflies.push({
                    x: Math.random() * MAP_W * TILE,
                    y: Math.random() * MAP_H * TILE,
                    phase: Math.random() * Math.PI * 2,
                    speed: 0.3 + Math.random() * 0.5,
                });
            }
        }

        _resize() {
            const vp = document.getElementById('map-viewport');
            if (!vp) return;
            const w = vp.clientWidth;
            const h = vp.clientHeight;
            const mapPxW = MAP_W * TILE;
            const mapPxH = MAP_H * TILE;
            const scaleX = w / mapPxW;
            const scaleY = h / mapPxH;
            this.scale = Math.max(1, Math.floor(Math.min(scaleX, scaleY)));
            this.canvas.width = mapPxW;
            this.canvas.height = mapPxH;
            this.canvas.style.width = mapPxW * this.scale + 'px';
            this.canvas.style.height = mapPxH * this.scale + 'px';
            this.ctx.imageSmoothingEnabled = false;
        }

        _bindEvents() {
            this.canvas.addEventListener('click', (e) => this._onClick(e));
            this.canvas.addEventListener('mousemove', (e) => this._onMove(e));
            this.canvas.addEventListener('touchend', (e) => {
                e.preventDefault();
                const t = e.changedTouches[0];
                if (t) this._onClick(t);
            }, { passive: false });
            window.addEventListener('keydown', (e) => {
                if (this.paused) return;
                if (e.key === 'Enter' && this.nearLocation) {
                    MapUI.open(this.nearLocation.id);
                    return;
                }
                if (this.player.path.length) return;
                const keyMap = { ArrowUp: [0,-1], ArrowDown: [0,1], ArrowLeft: [-1,0], ArrowRight: [1,0],
                    w: [0,-1], s: [0,1], a: [-1,0], d: [1,0] };
                const dir = keyMap[e.key] || keyMap[e.key.toLowerCase?.()];
                if (!dir) return;
                e.preventDefault();
                const [dx, dy] = dir;
                const tx = this.player.tx + dx;
                const ty = this.player.ty + dy;
                if (this._isWalkable(tx, ty)) {
                    this.player.tx = tx;
                    this.player.ty = ty;
                    this._updateNearLocation();
                }
            });
        }

        _screenToTile(e) {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / this.scale;
            const y = (e.clientY - rect.top) / this.scale;
            return { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE), px: x, py: y };
        }

        _isWalkable(tx, ty) {
            if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
            const id = this.map[ty][tx];
            return TILE_META[id] && TILE_META[id].walk;
        }

        _dist(a, b) {
            return Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty);
        }

        _adjacentTo(tx, ty, loc) {
            return Math.abs(tx - loc.tx) <= 1 && Math.abs(ty - loc.ty) <= 1;
        }

        _findPath(fromTx, fromTy, toTx, toTy) {
            if (!this._isWalkable(toTx, toTy)) return null;
            const key = (x, y) => x + ',' + y;
            const queue = [{ tx: fromTx, ty: fromTy, path: [] }];
            const seen = new Set([key(fromTx, fromTy)]);
            const dirs = [[0,1],[0,-1],[1,0],[-1,0]];

            while (queue.length) {
                const cur = queue.shift();
                if (cur.tx === toTx && cur.ty === toTy) return cur.path;
                for (const [dx, dy] of dirs) {
                    const nx = cur.tx + dx;
                    const ny = cur.ty + dy;
                    const k = key(nx, ny);
                    if (seen.has(k) || !this._isWalkable(nx, ny)) continue;
                    seen.add(k);
                    queue.push({ tx: nx, ty: ny, path: cur.path.concat([[nx, ny]]) });
                }
            }
            return null;
        }

        _nearestWalkableTo(loc) {
            let best = null;
            let bestD = Infinity;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const tx = loc.tx + dx;
                    const ty = loc.ty + dy;
                    if (!this._isWalkable(tx, ty)) continue;
                    const d = this._dist({ tx, ty }, { tx: this.player.tx, ty: this.player.ty });
                    if (d < bestD) { bestD = d; best = { tx, ty }; }
                }
            }
            return best;
        }

        _goToTile(tx, ty, onArrive) {
            const path = this._findPath(this.player.tx, this.player.ty, tx, ty);
            if (!path || path.length === 0) {
                if (onArrive) onArrive();
                return;
            }
            this.player.path = path;
            this.player.pendingLocation = onArrive || null;
        }

        _onClick(e) {
            if (this.paused || this.player.path.length) return;
            const { tx, ty, px, py } = this._screenToTile(e);

            // 点击地点标记
            for (const loc of LOCATIONS) {
                const lx = loc.tx * TILE + TILE / 2;
                const ly = loc.ty * TILE - 4;
                if (Math.hypot(px - lx, py - ly) < 14) {
                    const dest = this._nearestWalkableTo(loc);
                    if (!dest) return;
                    this._goToTile(dest.tx, dest.ty, () => MapUI.open(loc.id));
                    return;
                }
            }

            if (this._isWalkable(tx, ty)) {
                this._goToTile(tx, ty, null);
            }
        }

        _onMove(e) {
            const { tx, ty } = this._screenToTile(e);
            this.hoverTile = this._isWalkable(tx, ty) ? { tx, ty } : null;
            this._updateHint();
        }

        _updateNearLocation() {
            this.nearLocation = LOCATIONS.find(loc =>
                this._adjacentTo(this.player.tx, this.player.ty, loc)
            ) || null;
            this._updateHint();
        }

        _updateHint() {
            const hint = document.getElementById('map-hint');
            if (!hint) return;
            if (this.player.path.length) {
                hint.textContent = '行走中…';
            } else if (this.nearLocation) {
                hint.textContent = `按 Enter 进入「${this.nearLocation.name}」`;
            } else if (this.hoverTile) {
                hint.textContent = '点击移动 · 点击地点图标可直接前往';
            } else {
                hint.textContent = 'WASD 或点击地图移动 · 走近地点后按 Enter';
            }
        }

        _stepPlayer() {
            if (!this.player.path.length) return;
            const [nx, ny] = this.player.path.shift();
            this.player.tx = nx;
            this.player.ty = ny;
            if (!this.player.path.length && this.player.pendingLocation) {
                const cb = this.player.pendingLocation;
                this.player.pendingLocation = null;
                cb();
            }
            this._updateNearLocation();
        }

        pause() { this.paused = true; }
        resume() { this.paused = false; }

        start() {
            if (this._raf) return;
            let lastStep = 0;
            const loop = (ts) => {
                this._raf = requestAnimationFrame(loop);
                if (this.paused) { this._draw(); return; }
                this.campfirePhase += 0.08;
                if (this.player.path.length && ts - lastStep > 120) {
                    this._stepPlayer();
                    lastStep = ts;
                }
                this._animateFireflies();
                this._draw();
            };
            this._raf = requestAnimationFrame(loop);
            this._updateNearLocation();
        }

        _animateFireflies() {
            const mw = MAP_W * TILE;
            const mh = MAP_H * TILE;
            this.fireflies.forEach(f => {
                f.phase += 0.02;
                f.x += Math.sin(f.phase) * f.speed;
                f.y += Math.cos(f.phase * 0.7) * f.speed * 0.5;
                if (f.x < 0) f.x = mw;
                if (f.x > mw) f.x = 0;
                if (f.y < 0) f.y = mh;
                if (f.y > mh) f.y = 0;
            });
        }

        _drawTile(id, dx, dy) {
            const col = id % 8;
            const row = Math.floor(id / 8);
            this.ctx.drawImage(this.tileset, col * TILE, row * TILE, TILE, TILE, dx, dy, TILE, TILE);
        }

        _draw() {
            const ctx = this.ctx;
            ctx.fillStyle = '#050508';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            for (let y = 0; y < MAP_H; y++) {
                for (let x = 0; x < MAP_W; x++) {
                    this._drawTile(this.map[y][x], x * TILE, y * TILE);
                }
            }

            // 营火微光
            const glow = 0.15 + Math.sin(this.campfirePhase) * 0.08;
            const gx = 12 * TILE + TILE / 2;
            const gy = 7 * TILE + TILE / 2;
            const grd = ctx.createRadialGradient(gx, gy, 2, gx, gy, 48);
            grd.addColorStop(0, `rgba(200, 90, 32, ${glow + 0.1})`);
            grd.addColorStop(1, 'rgba(200, 90, 32, 0)');
            ctx.fillStyle = grd;
            ctx.fillRect(gx - 48, gy - 48, 96, 96);

            // 萤火虫
            this.fireflies.forEach(f => {
                const a = 0.4 + Math.sin(f.phase * 2) * 0.35;
                ctx.fillStyle = `rgba(90, 170, 80, ${a})`;
                ctx.fillRect(Math.floor(f.x), Math.floor(f.y), 2, 2);
            });

            // 悬停高亮
            if (this.hoverTile && !this.player.path.length) {
                ctx.strokeStyle = 'rgba(90, 170, 80, 0.5)';
                ctx.lineWidth = 1;
                ctx.strokeRect(this.hoverTile.tx * TILE + 1, this.hoverTile.ty * TILE + 1, TILE - 2, TILE - 2);
            }

            // 地点标记
            LOCATIONS.forEach(loc => {
                const sx = loc.tx * TILE + TILE / 2;
                const sy = loc.ty * TILE - 2;
                const near = this._adjacentTo(this.player.tx, this.player.ty, loc);
                if (near) {
                    ctx.strokeStyle = loc.color;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(sx, sy, 10, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.font = '10px "Press Start 2P", monospace';
                ctx.textAlign = 'center';
                ctx.fillStyle = near ? loc.color : '#6a6a58';
                ctx.fillText(loc.icon, sx, sy);
            });

            // 玩家（火柴人）
            this._drawPlayer(this.player.tx * TILE + TILE / 2, this.player.ty * TILE + TILE - 2);
        }

        _drawPlayer(cx, footY) {
            const ctx = this.ctx;
            ctx.fillStyle = '#c85a20';
            ctx.fillRect(cx - 1, footY - 10, 2, 6);
            ctx.fillRect(cx - 3, footY - 4, 2, 3);
            ctx.fillRect(cx + 1, footY - 4, 2, 3);
            ctx.fillRect(cx - 4, footY - 8, 8, 2);
            ctx.fillStyle = '#e87030';
            ctx.fillRect(cx - 1, footY - 13, 2, 3);
        }
    }

    let instance = null;

    window.TileMap = {
        LOCATIONS,
        init() {
            const canvas = document.getElementById('game-canvas');
            if (!canvas) return;
            if (!instance) instance = new TileMapEngine(canvas);
            instance._resize();
            instance.start();
        },
        pause() { if (instance) instance.pause(); },
        resume() { if (instance) instance.resume(); },
    };
})();
