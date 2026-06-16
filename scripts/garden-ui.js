/**
 * 种子花园 UI 控制
 * Tab 切换、渲染种子卡片、评分交互、埋种子表单
 */
var GardenUI = (function () {

    let currentTab = 'browse';
    let visibility = 'public';
    let publicPage = 1;
    let publicPageSize = 10;
    let publicTotal = 0;
    let randomSeedsCache = null;

    const VIS_DESC = {
        public: '所有人可在花园中看到',
        bottle: '随机出现在别人的漂流种子中',
        private: '只有自己能看到',
    };

    function init() {
        SupabaseClient.init();
        loadBrowseTab();
        updatePlantRemain();
        bindTextareaCount();
    }

    function bindTextareaCount() {
        const textarea = document.getElementById('seed-content');
        if (textarea) {
            textarea.addEventListener('input', () => {
                const count = document.getElementById('seed-char-count');
                if (count) count.textContent = textarea.value.length;
            });
        }
    }

    // ========== Tab 切换 ==========

    function switchTab(tab) {
        currentTab = tab;
        document.querySelectorAll('.garden-tab').forEach(b => {
            b.classList.toggle('garden-tab-active', b.dataset.tab === tab);
        });
        document.querySelectorAll('.garden-tab-content').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById('garden-tab-' + tab);
        if (target) target.classList.remove('hidden');

        if (tab === 'browse') loadBrowseTab();
        if (tab === 'mine') loadMySeeds();
        if (tab === 'plant') updatePlantRemain();
    }

    // ========== 浏览 ==========

    async function loadBrowseTab() {
        if (!SupabaseClient.isReady()) {
            renderEmpty('garden-random-seeds', '网络未连接');
            renderEmpty('garden-public-seeds', '网络未连接');
            return;
        }

        // 随机种子（缓存每次进入花园只刷新一次）
        if (!randomSeedsCache) {
            randomSeedsCache = await SeedSocial.fetchRandomSeeds(5);
        }
        renderSeedList('garden-random-seeds', randomSeedsCache, true);

        // 公开种子
        const result = await SeedSocial.fetchPublicSeeds(publicPage, publicPageSize);
        publicTotal = result.total;
        renderSeedList('garden-public-seeds', result.seeds, true);
        updatePager();
    }

    async function loadMySeeds() {
        if (!SupabaseClient.isReady()) {
            renderEmpty('garden-my-seeds', '网络未连接');
            return;
        }
        const seeds = await SeedSocial.fetchMySeeds();
        renderSeedList('garden-my-seeds', seeds, false);
    }

    function renderSeedList(containerId, seeds, showRating) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!seeds || seeds.length === 0) {
            container.innerHTML = '<p class="garden-empty">暂无种子</p>';
            return;
        }

        container.innerHTML = seeds.map(seed => renderSeedCard(seed, showRating)).join('');
    }

    function renderSeedCard(seed, showRating) {
        const time = new Date(seed.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
        const avgStars = seed.stars_count > 0 ? (seed.stars_total / seed.stars_count).toFixed(1) : '-';
        const visLabel = { public: '公开', bottle: '漂流瓶', private: '私密' }[seed.visibility] || '';

        let ratingHtml = '';
        if (showRating) {
            ratingHtml = `
                <div class="seed-rating" data-seed-id="${seed.id}">
                    <button class="seed-star-btn" onclick="GardenUI.rate('${seed.id}', 1)">★</button>
                    <button class="seed-star-btn" onclick="GardenUI.rate('${seed.id}', 2)">★★</button>
                    <button class="seed-star-btn" onclick="GardenUI.rate('${seed.id}', 3)">★★★</button>
                    <button class="seed-star-btn" onclick="GardenUI.rate('${seed.id}', 4)">★★★★</button>
                    <button class="seed-star-btn" onclick="GardenUI.rate('${seed.id}', 5)">★★★★★</button>
                </div>`;
        }

        return `
            <div class="seed-card">
                <div class="seed-card-header">
                    <span class="seed-author">${escapeHtml(seed.user_name)}</span>
                    <span class="seed-meta">${time} · ${visLabel} · ${avgStars}★ (${seed.stars_count}人)</span>
                </div>
                <p class="seed-content">${escapeHtml(seed.content)}</p>
                ${ratingHtml}
            </div>`;
    }

    function renderEmpty(containerId, msg) {
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = `<p class="garden-empty">${msg}</p>`;
    }

    // ========== 分页 ==========

    function updatePager() {
        const totalPages = Math.max(1, Math.ceil(publicTotal / publicPageSize));
        const info = document.getElementById('garden-page-info');
        if (info) info.textContent = `${publicPage} / ${totalPages}`;
    }

    async function prevPage() {
        if (publicPage <= 1) return;
        publicPage--;
        const result = await SeedSocial.fetchPublicSeeds(publicPage, publicPageSize);
        renderSeedList('garden-public-seeds', result.seeds, true);
        updatePager();
    }

    async function nextPage() {
        const totalPages = Math.ceil(publicTotal / publicPageSize);
        if (publicPage >= totalPages) return;
        publicPage++;
        const result = await SeedSocial.fetchPublicSeeds(publicPage, publicPageSize);
        renderSeedList('garden-public-seeds', result.seeds, true);
        updatePager();
    }

    // ========== 评分 ==========

    async function rate(seedId, stars) {
        const result = await SeedSocial.rateSeed(seedId, stars);
        const ratingEl = document.querySelector(`[data-seed-id="${seedId}"]`);

        if (result.success) {
            if (ratingEl) ratingEl.innerHTML = `<span class="seed-rated">已评 ${stars}★</span>`;
            if (window.Analytics) Analytics.trackSeedRate(seedId, stars);
        } else {
            if (ratingEl) {
                const msg = document.createElement('span');
                msg.className = 'seed-rate-error';
                msg.textContent = result.reason;
                ratingEl.appendChild(msg);
                setTimeout(() => msg.remove(), 3000);
            }
        }
    }

    // ========== 埋种子 ==========

    function setVisibility(vis) {
        visibility = vis;
        document.querySelectorAll('.garden-vis-btn').forEach(b => {
            b.classList.toggle('garden-vis-active', b.dataset.vis === vis);
        });
        const desc = document.getElementById('garden-vis-desc');
        if (desc) desc.textContent = VIS_DESC[vis] || '';
    }

    function updatePlantRemain() {
        const key = 'seed_' + new Date().toISOString().slice(0, 10) + '_plant';
        const used = parseInt(localStorage.getItem(key) || '0');
        const remain = Math.max(0, SeedSocial.MAX_SEEDS_PER_DAY - used);
        const el = document.getElementById('seed-remain');
        if (el) el.textContent = remain;
    }

    async function submitSeed() {
        const textarea = document.getElementById('seed-content');
        const content = textarea ? textarea.value.trim() : '';
        const msgEl = document.getElementById('garden-plant-msg');

        if (!content) {
            showMsg(msgEl, '写点什么再埋吧', 'error');
            return;
        }

        showMsg(msgEl, '种子正在扎根…', 'info');

        const result = await SeedSocial.plantSeed(content, visibility);

        if (result.success) {
            showMsg(msgEl, '种子已埋下。愿它在某人的梦中发芽。', 'success');
            textarea.value = '';
            document.getElementById('seed-char-count').textContent = '0';
            updatePlantRemain();
            randomSeedsCache = null;
            if (window.Analytics) Analytics.trackSeedPlant(visibility);
        } else {
            showMsg(msgEl, result.reason, 'error');
        }
    }

    function showMsg(el, text, type) {
        if (!el) return;
        el.classList.remove('hidden');
        el.className = 'garden-msg garden-msg-' + type;
        el.textContent = text;
        if (type === 'success' || type === 'info') {
            setTimeout(() => el.classList.add('hidden'), 4000);
        }
    }

    // ========== 工具 ==========

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function refreshRandomCache() {
        randomSeedsCache = null;
    }

    return {
        init,
        switchTab,
        setVisibility,
        submitSeed,
        rate,
        prevPage,
        nextPage,
        refreshRandomCache,
    };
})();

window.GardenUI = GardenUI;
