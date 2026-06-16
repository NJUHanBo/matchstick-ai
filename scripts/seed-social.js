/**
 * 种子社交系统核心逻辑
 * 埋种子、AI 审核、查询、评分、结算
 */
var SeedSocial = (function () {

    const ASH_COST = 80;
    const MAX_SEEDS_PER_DAY = 3;
    const MAX_RATINGS_PER_DAY = 10;
    const FLAME_PER_STAR = 3;

    // ========== AI 内容审核 ==========

    async function moderateContent(text) {
        try {
            const response = await fetch(AIChat.BASE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: AIChat.MODEL,
                    messages: [
                        {
                            role: 'system',
                            content: `你是内容安全审核员。判断用户提交的短文本是否含有以下违规内容：色情/裸露、暴力/血腥、辱骂/仇恨言论、违法信息。
只返回 JSON 格式：{"pass": true} 或 {"pass": false, "reason": "简短原因"}
灰色地带（如轻微负面情绪、吐槽）应放行。只拦截明确违规。`,
                        },
                        { role: 'user', content: text },
                    ],
                    max_tokens: 100,
                    temperature: 0,
                }),
            });

            if (!response.ok) {
                console.error('Moderation API error:', response.status);
                return { pass: true };
            }

            const data = await response.json();
            const raw = data.choices?.[0]?.message?.content || '';
            try {
                const jsonMatch = raw.match(/\{[\s\S]*\}/);
                return jsonMatch ? JSON.parse(jsonMatch[0]) : { pass: true };
            } catch (e) {
                return { pass: true };
            }
        } catch (err) {
            console.error('Moderation request failed:', err);
            return { pass: true };
        }
    }

    // ========== 埋种子 ==========

    async function plantSeed(content, visibility) {
        if (!SupabaseClient.isReady()) {
            return { success: false, reason: '网络连接未就绪' };
        }

        if (!content || content.trim().length === 0) {
            return { success: false, reason: '种子内容不能为空' };
        }

        if (content.length > 500) {
            return { success: false, reason: '内容不能超过500字' };
        }

        // 检查今日次数
        const todayCount = getTodayPlantCount();
        if (todayCount >= MAX_SEEDS_PER_DAY) {
            return { success: false, reason: `今天已经埋了${MAX_SEEDS_PER_DAY}颗种子，明天再来` };
        }

        // AI 审核
        const modResult = await moderateContent(content.trim());
        if (!modResult.pass) {
            return { success: false, reason: `内容未通过审核：${modResult.reason || '含有不当内容'}` };
        }

        // 写入 Supabase
        const db = SupabaseClient.getClient();
        const userId = SupabaseClient.getUserId();
        const userName = GameState.character ? GameState.character.name : '匿名守墓者';

        const { data, error } = await db.from('seeds').insert({
            user_id: userId,
            user_name: userName,
            content: content.trim(),
            visibility: visibility || 'public',
            status: 'approved',
        }).select().single();

        if (error) {
            console.error('Plant seed error:', error);
            return { success: false, reason: '种子埋入失败，请稍后再试' };
        }

        // 记录今日种植次数
        incrementTodayPlantCount();

        return { success: true, seed: data };
    }

    // ========== 查询种子 ==========

    async function fetchRandomSeeds(count) {
        if (!SupabaseClient.isReady()) return [];

        const db = SupabaseClient.getClient();
        const userId = SupabaseClient.getUserId();

        // 获取公开和漂流瓶种子（不包括自己的）
        const { data, error } = await db
            .from('seeds')
            .select('*')
            .in('visibility', ['public', 'bottle'])
            .eq('status', 'approved')
            .neq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error || !data) return [];

        // 随机抽取
        const shuffled = data.sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count || 5);
    }

    async function fetchPublicSeeds(page, pageSize) {
        if (!SupabaseClient.isReady()) return { seeds: [], total: 0 };

        const db = SupabaseClient.getClient();
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const { data, error, count } = await db
            .from('seeds')
            .select('*', { count: 'exact' })
            .eq('visibility', 'public')
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) return { seeds: [], total: 0 };
        return { seeds: data || [], total: count || 0 };
    }

    async function fetchMySeeds() {
        if (!SupabaseClient.isReady()) return [];

        const db = SupabaseClient.getClient();
        const userId = SupabaseClient.getUserId();

        const { data, error } = await db
            .from('seeds')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);

        return error ? [] : (data || []);
    }

    // ========== 评分 ==========

    async function rateSeed(seedId, stars) {
        if (!SupabaseClient.isReady()) {
            return { success: false, reason: '网络未就绪' };
        }

        if (stars < 1 || stars > 5) {
            return { success: false, reason: '评分必须在1-5之间' };
        }

        const todayRatings = getTodayRatingCount();
        if (todayRatings >= MAX_RATINGS_PER_DAY) {
            return { success: false, reason: `今天已经评了${MAX_RATINGS_PER_DAY}颗种子了` };
        }

        const db = SupabaseClient.getClient();
        const raterId = SupabaseClient.getUserId();

        // 插入评分
        const { error: ratingError } = await db.from('ratings').insert({
            seed_id: seedId,
            rater_id: raterId,
            stars: stars,
        });

        if (ratingError) {
            if (ratingError.code === '23505') {
                return { success: false, reason: '你已经评过这颗种子了' };
            }
            console.error('Rate seed error:', ratingError);
            return { success: false, reason: '评分失败' };
        }

        // 更新种子的累计星星
        const { error: updateError } = await db.rpc('increment_seed_stars', {
            p_seed_id: seedId,
            p_stars: stars,
        });

        // 如果 RPC 不存在，用直接查询方式
        if (updateError) {
            const { data: seed } = await db.from('seeds').select('stars_total, stars_count').eq('id', seedId).single();
            if (seed) {
                await db.from('seeds').update({
                    stars_total: seed.stars_total + stars,
                    stars_count: seed.stars_count + 1,
                }).eq('id', seedId);
            }
        }

        incrementTodayRatingCount();
        return { success: true };
    }

    // ========== 结算 ==========

    async function settleSeeds() {
        if (!SupabaseClient.isReady()) return { flame: 0, details: [] };

        const db = SupabaseClient.getClient();
        const userId = SupabaseClient.getUserId();

        // 查询未结算的种子评分
        const { data: mySeeds, error } = await db
            .from('seeds')
            .select('id, content, stars_total, stars_count, settled_at')
            .eq('user_id', userId)
            .gt('stars_count', 0);

        if (error || !mySeeds) return { flame: 0, details: [] };

        let totalFlame = 0;
        const details = [];
        const now = new Date().toISOString();

        for (const seed of mySeeds) {
            // 查询自上次结算后的新评分
            let query = db.from('ratings').select('stars').eq('seed_id', seed.id);
            if (seed.settled_at) {
                query = query.gt('created_at', seed.settled_at);
            }
            const { data: newRatings } = await query;

            if (newRatings && newRatings.length > 0) {
                const starsSum = newRatings.reduce((sum, r) => sum + r.stars, 0);
                const flame = starsSum * FLAME_PER_STAR;
                totalFlame += flame;
                details.push({
                    content: seed.content.substring(0, 20) + (seed.content.length > 20 ? '…' : ''),
                    newRatings: newRatings.length,
                    starsGained: starsSum,
                    flameGained: flame,
                });

                // 标记已结算
                await db.from('seeds').update({ settled_at: now }).eq('id', seed.id);
            }
        }

        return { flame: totalFlame, details };
    }

    // ========== 本地计数（防刷） ==========

    function getTodayKey() {
        return 'seed_' + new Date().toISOString().slice(0, 10);
    }

    function getTodayPlantCount() {
        const data = JSON.parse(localStorage.getItem(getTodayKey() + '_plant') || '0');
        return data;
    }

    function incrementTodayPlantCount() {
        const key = getTodayKey() + '_plant';
        const count = parseInt(localStorage.getItem(key) || '0') + 1;
        localStorage.setItem(key, count.toString());
    }

    function getTodayRatingCount() {
        return parseInt(localStorage.getItem(getTodayKey() + '_rate') || '0');
    }

    function incrementTodayRatingCount() {
        const key = getTodayKey() + '_rate';
        const count = parseInt(localStorage.getItem(key) || '0') + 1;
        localStorage.setItem(key, count.toString());
    }

    // ========== 检查是否已评 ==========

    async function hasRated(seedId) {
        if (!SupabaseClient.isReady()) return false;
        const db = SupabaseClient.getClient();
        const raterId = SupabaseClient.getUserId();

        const { data } = await db
            .from('ratings')
            .select('id')
            .eq('seed_id', seedId)
            .eq('rater_id', raterId)
            .limit(1);

        return data && data.length > 0;
    }

    return {
        plantSeed,
        fetchRandomSeeds,
        fetchPublicSeeds,
        fetchMySeeds,
        rateSeed,
        settleSeeds,
        hasRated,
        ASH_COST,
        MAX_SEEDS_PER_DAY,
        MAX_RATINGS_PER_DAY,
        FLAME_PER_STAR,
    };
})();

window.SeedSocial = SeedSocial;
