-- ============================================
-- 火柴人轻社交种子系统 · Supabase 建表 SQL
-- 在 Supabase Dashboard > SQL Editor 中运行
-- ============================================

-- 种子表
CREATE TABLE seeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL DEFAULT '匿名守墓者',
    content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'bottle', 'private')),
    status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
    stars_total INT NOT NULL DEFAULT 0,
    stars_count INT NOT NULL DEFAULT 0,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 评分表
CREATE TABLE ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seed_id UUID NOT NULL REFERENCES seeds(id) ON DELETE CASCADE,
    rater_id TEXT NOT NULL,
    stars INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(seed_id, rater_id)
);

-- 索引
CREATE INDEX idx_seeds_user_id ON seeds(user_id);
CREATE INDEX idx_seeds_visibility_status ON seeds(visibility, status);
CREATE INDEX idx_seeds_created_at ON seeds(created_at DESC);
CREATE INDEX idx_ratings_seed_id ON ratings(seed_id);
CREATE INDEX idx_ratings_rater_id ON ratings(rater_id);

-- ============================================
-- RLS 策略（Row Level Security）
-- ============================================

ALTER TABLE seeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

-- seeds: 任何人可读公开/漂流瓶种子（已审核通过的）
CREATE POLICY "seeds_read_public" ON seeds
    FOR SELECT USING (
        (visibility IN ('public', 'bottle') AND status = 'approved')
        OR user_id = current_setting('request.headers', true)::json->>'x-user-id'
    );

-- seeds: 任何人可插入自己的种子
CREATE POLICY "seeds_insert_own" ON seeds
    FOR INSERT WITH CHECK (
        user_id = current_setting('request.headers', true)::json->>'x-user-id'
    );

-- seeds: 只能更新自己种子的 settled_at / stars
CREATE POLICY "seeds_update" ON seeds
    FOR UPDATE USING (true);

-- ratings: 任何人可读
CREATE POLICY "ratings_read" ON ratings
    FOR SELECT USING (true);

-- ratings: 任何人可插入评分（不能给自己评）
CREATE POLICY "ratings_insert" ON ratings
    FOR INSERT WITH CHECK (
        rater_id = current_setting('request.headers', true)::json->>'x-user-id'
    );

-- ============================================
-- 注意事项：
-- 1. 先在 Supabase 创建项目，获取 URL 和 anon key
-- 2. 将 URL 和 key 填入 scripts/supabase-client.js
-- 3. 由于前端直连，RLS 是安全保障
-- 4. 如果 RLS header 方式太复杂，可以简化为完全开放读取 + 前端控制写入
-- ============================================
