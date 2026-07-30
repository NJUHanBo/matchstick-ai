-- ============================================
-- 慢客松报名表
-- 在 Supabase SQL Editor 中运行一次
-- ============================================

CREATE TABLE slowathon_signups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    nickname TEXT NOT NULL,   -- 网名
    wechat TEXT NOT NULL,     -- 微信号（用于拉群）
    idea TEXT                 -- 一句话想做什么（可为空："还在想"）
);

ALTER TABLE slowathon_signups ENABLE ROW LEVEL SECURITY;

-- 只允许匿名写入，不允许读取——表里有微信号，属于联系方式，
-- 不能像 bazi_sessions 那样开 SELECT。数据在 Supabase 后台看。
CREATE POLICY "slowathon_insert_anon" ON slowathon_signups
    FOR INSERT WITH CHECK (true);
