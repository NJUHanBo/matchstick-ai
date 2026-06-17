/**
 * AI 记忆管理模块
 * 持久化存储在 Supabase user_memory 表
 * 两种触发：对话后追加 + 结束一天时压缩
 */
var AIMemory = (function () {

    let memoryCache = null;
    let loaded = false;

    const MAX_MEMORY_LENGTH = 3000;

    // ========== 读取 ==========

    async function load() {
        if (!SupabaseClient.isReady()) return '';
        const db = SupabaseClient.getClient();
        const userId = SupabaseClient.getUserId();

        const { data } = await db
            .from('user_memory')
            .select('memory')
            .eq('user_id', userId)
            .maybeSingle();

        memoryCache = data ? data.memory : '';
        loaded = true;
        return memoryCache;
    }

    function get() {
        return memoryCache || '';
    }

    function isLoaded() {
        return loaded;
    }

    // ========== 保存 ==========

    async function save(newMemory) {
        if (!SupabaseClient.isReady()) return;
        const db = SupabaseClient.getClient();
        const userId = SupabaseClient.getUserId();

        memoryCache = newMemory;

        await db.from('user_memory').upsert({
            user_id: userId,
            memory: newMemory,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    }

    // ========== 对话后追加（轻量） ==========

    async function appendAfterChat(userMsg, aiReply) {
        if (!SupabaseClient.isReady()) return;

        const prompt = `你是一个记忆管理助手。根据以下对话，提取值得记住的关键信息（用户的意图、情绪状态、提到的具体事项、偏好等），用1-2句话追加到已有记忆末尾。如果对话是闲聊无实质内容，返回空字符串。

已有记忆：
${memoryCache || '（空）'}

最新对话：
用户：${userMsg}
AI：${aiReply}

只返回需要追加的文本（不要返回已有记忆），如果无需追加返回空。`;

        const result = await callAIForMemory(prompt);
        if (result && result.trim()) {
            const appended = (memoryCache || '') + '\n' + result.trim();
            // 如果太长了，等 endDay 时再压缩
            await save(appended.substring(0, MAX_MEMORY_LENGTH * 2));
        }
    }

    // ========== 结束一天时压缩 ==========

    async function compressAtEndDay(dayStats) {
        if (!SupabaseClient.isReady()) return;
        if (!memoryCache && !dayStats) return;

        const statsStr = dayStats
            ? `今日统计：第${dayStats.day}天，火苗${dayStats.flame}，灰烬${dayStats.ash}，完成${dayStats.tasksCompleted}个任务，燃烧天数${dayStats.burningDays}`
            : '';

        const prompt = `你是记忆管理助手。请将以下用户记忆整理压缩为结构化的简洁摘要，保留所有重要信息（用户性格特点、长期目标、关键事件、偏好、情绪变化趋势），删除重复和过时内容。控制在800字以内。

${statsStr}

当前记忆内容：
${memoryCache || '（空）'}

返回压缩后的记忆文本：`;

        const result = await callAIForMemory(prompt);
        if (result && result.trim()) {
            await save(result.trim());
        }
    }

    // ========== 记录游戏事件（非对话） ==========

    function recordEvent(eventText) {
        if (!memoryCache) memoryCache = '';
        memoryCache += '\n[事件] ' + eventText;
        // 延迟保存，避免频繁写入
        clearTimeout(AIMemory._saveTimer);
        AIMemory._saveTimer = setTimeout(function () {
            save(memoryCache);
        }, 5000);
    }

    // ========== AI 调用 ==========

    async function callAIForMemory(prompt) {
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: AIChat.MODEL,
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 500,
                    temperature: 0.3,
                }),
            });

            if (!response.ok) return null;
            const data = await response.json();
            return data.choices?.[0]?.message?.content || null;
        } catch (e) {
            console.error('AIMemory call failed:', e);
            return null;
        }
    }

    return {
        load,
        get,
        isLoaded,
        save,
        appendAfterChat,
        compressAtEndDay,
        recordEvent,
        _saveTimer: null,
    };
})();

window.AIMemory = AIMemory;
