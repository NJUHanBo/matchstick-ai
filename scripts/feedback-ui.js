/**
 * 意见反馈 UI
 */
var FeedbackUI = (function () {

    function open() {
        document.getElementById('feedback-modal').classList.remove('hidden');
        setTimeout(function () {
            document.getElementById('feedback-text').focus();
        }, 100);
    }

    function close() {
        document.getElementById('feedback-modal').classList.add('hidden');
        document.getElementById('feedback-text').value = '';
        var msg = document.getElementById('feedback-msg');
        msg.classList.add('hidden');
    }

    async function submit() {
        var text = document.getElementById('feedback-text').value.trim();
        var msg = document.getElementById('feedback-msg');

        if (!text) {
            showMsg(msg, '写点什么再提交吧', 'error');
            return;
        }

        // 存入 Supabase events 表
        if (SupabaseClient.isReady()) {
            var db = SupabaseClient.getClient();
            await db.from('events').insert({
                user_id: SupabaseClient.isLoggedIn() ? SupabaseClient.getUserId() : null,
                session_id: window.Analytics ? window.Analytics._sessionId || 'unknown' : 'unknown',
                event_type: 'feedback',
                event_data: {
                    text: text,
                    page: window.MapUI ? MapUI.current : null,
                    day: GameState && GameState.stats ? GameState.stats.totalDays : null,
                },
                created_at: new Date().toISOString(),
            });
        }

        showMsg(msg, '感谢反馈！我们会认真阅读。', 'success');
        document.getElementById('feedback-text').value = '';
        setTimeout(close, 2000);
    }

    function showMsg(el, text, type) {
        el.textContent = text;
        el.className = 'feedback-msg feedback-msg-' + type;
        el.classList.remove('hidden');
    }

    return { open, close, submit };
})();

window.FeedbackUI = FeedbackUI;
