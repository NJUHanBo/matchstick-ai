-- ============================================
-- 八字排盘用户数据收集表
-- 在 Supabase SQL Editor 中运行
-- ============================================

CREATE TABLE bazi_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- 出生信息
    birth_year INT,
    birth_month INT,
    birth_day INT,
    birth_hour INT,
    gender TEXT,

    -- 四柱结果
    four_pillars TEXT,
    day_master TEXT,

    -- 锚点信息
    anchor_marriage TEXT,
    anchor_marriage_year INT,
    anchor_career TEXT,
    anchor_career_year INT,
    anchor_goal TEXT,

    -- AI 分析记录
    analyses JSONB DEFAULT '[]'
);

ALTER TABLE bazi_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bazi_insert_anon" ON bazi_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "bazi_update_anon" ON bazi_sessions FOR UPDATE USING (true);
CREATE POLICY "bazi_select_anon" ON bazi_sessions FOR SELECT USING (true);

-- ============================================
-- 激活码表
-- ============================================

CREATE TABLE activation_codes (
    code TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    type TEXT NOT NULL DEFAULT 'vip',  -- 'vip' = 无限次
    is_active BOOLEAN NOT NULL DEFAULT true,
    used_by TEXT,  -- 记录谁用了（可选）
    note TEXT      -- 备注
);

ALTER TABLE activation_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "codes_select_anon" ON activation_codes FOR SELECT USING (true);
CREATE POLICY "codes_update_anon" ON activation_codes FOR UPDATE USING (true);

-- 给自己先插一个码
INSERT INTO activation_codes (code, type, note) VALUES ('HANBO-VIP-2026', 'vip', '韩博自用');
