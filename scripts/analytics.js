/**
 * 行为分析 SDK
 * 事件上报、停留时长追踪、点击路径记录
 * 仅在用户同意后上报数据
 */
var Analytics = (function () {

    let sessionId = null;
    let pageEnterTime = null;
    let currentPage = null;
    let clickPath = [];
    let buffer = [];
    let flushTimer = null;

    const BUFFER_SIZE = 10;
    const FLUSH_INTERVAL = 30000; // 30s

    function init() {
        sessionId = generateSessionId();
        pageEnterTime = Date.now();
        currentPage = 'init';

        // 定时刷新缓冲区
        flushTimer = setInterval(flush, FLUSH_INTERVAL);

        // 页面关闭时尝试发送剩余事件
        window.addEventListener('beforeunload', () => {
            trackPageLeave();
            flush();
        });

        // 全局点击追踪
        document.addEventListener('click', (e) => {
            if (!isEnabled()) return;
            const target = e.target.closest('button, a, .task-item, .seed-card');
            if (target) {
                const label = target.textContent.trim().substring(0, 30);
                clickPath.push({ t: Date.now(), el: target.tagName, label });
                if (clickPath.length > 50) clickPath.shift();
            }
        });
    }

    function isEnabled() {
        return ConsentManager.isAccepted() && SupabaseClient.isReady();
    }

    function generateSessionId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    }

    // ========== 核心追踪方法 ==========

    function track(eventType, data) {
        if (!isEnabled()) return;

        buffer.push({
            user_id: SupabaseClient.isLoggedIn() ? SupabaseClient.getUserId() : null,
            session_id: sessionId,
            event_type: eventType,
            event_data: data || {},
            page: currentPage,
            created_at: new Date().toISOString(),
        });

        if (buffer.length >= BUFFER_SIZE) {
            flush();
        }
    }

    function trackPageEnter(page) {
        trackPageLeave();
        currentPage = page;
        pageEnterTime = Date.now();
        track('page_enter', { page });
    }

    function trackPageLeave() {
        if (currentPage && pageEnterTime) {
            const duration = Date.now() - pageEnterTime;
            if (duration > 1000) {
                track('page_leave', {
                    page: currentPage,
                    duration_ms: duration,
                });
            }
        }
    }

    function trackTaskComplete(taskName, minutes, rating, rewards) {
        track('task_complete', { taskName, minutes, rating, rewards });
    }

    function trackSeedPlant(visibility) {
        track('seed_plant', { visibility });
    }

    function trackSeedRate(seedId, stars) {
        track('seed_rate', { seedId, stars });
    }

    function trackEndDay(dayNum, flame, ash, burningDays) {
        track('end_day', { dayNum, flame, ash, burningDays });
    }

    function trackLocationEnter(locationId) {
        trackPageEnter('location_' + locationId);
        track('location_enter', { locationId });
    }

    function trackChat(summaryKeywords) {
        track('chat_message', { keywords: summaryKeywords });
    }

    function trackLogin(method) {
        track('login', { method });
    }

    function trackBazi(focus) {
        track('bazi_analyze', { focus });
    }

    // ========== 缓冲区刷新 ==========

    async function flush() {
        if (buffer.length === 0) return;
        if (!SupabaseClient.isReady()) return;

        const events = buffer.splice(0, buffer.length);
        const db = SupabaseClient.getClient();

        try {
            await db.from('events').insert(events);
        } catch (err) {
            console.error('Analytics flush error:', err);
            // 失败的事件丢弃，不重试（避免无限循环）
        }
    }

    // ========== 点击路径快照 ==========

    function getClickPathSnapshot() {
        const snapshot = clickPath.slice(-20);
        clickPath = [];
        return snapshot;
    }

    return {
        init,
        track,
        trackPageEnter,
        trackPageLeave,
        trackTaskComplete,
        trackSeedPlant,
        trackSeedRate,
        trackEndDay,
        trackLocationEnter,
        trackChat,
        trackLogin,
        trackBazi,
        flush,
        getClickPathSnapshot,
    };
})();

window.Analytics = Analytics;
