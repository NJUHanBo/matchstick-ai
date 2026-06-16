-- ============================================
-- 用户行为事件表 + Auth 相关配置
-- 在 Supabase SQL Editor 中运行
-- ============================================

-- 行为事件表
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data JSONB DEFAULT '{}',
    page TEXT,
    duration_ms INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_created_at ON events(created_at DESC);
CREATE INDEX idx_events_session ON events(session_id);

-- RLS：允许插入，只有自己能读自己的
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_insert_all" ON events
    FOR INSERT WITH CHECK (true);

CREATE POLICY "events_select_own" ON events
    FOR SELECT USING (user_id = auth.uid());

-- ============================================
-- 更新 seeds 表的 user_id 类型为 UUID（匹配 Auth）
-- 如果你之前已经建了 seeds 表且里面没数据，先删再重建：
-- DROP TABLE IF EXISTS ratings;
-- DROP TABLE IF EXISTS seeds;
-- 然后重新运行 supabase-setup.sql 把 user_id 改为 UUID
--
-- 如果不想动 seeds 表，也可以保持 TEXT 类型，
-- 代码里把 auth.uid() 转成 text 再存入即可（当前方案采用此方式）
-- ============================================

-- ============================================
-- Auth 配置（在 Supabase Dashboard 操作，不是 SQL）：
--
-- 1. 左侧菜单 Authentication → Providers
-- 2. 确认 Email 已启用（默认就是开的）
-- 3. Authentication → Settings：
--    - "Enable email confirmations" → 建议开启
--    - "Mailer OTP Expiration" → 3600（1小时）
--    - Site URL → 填你的 Vercel 域名（如 https://matchstick-ai.vercel.app）
--    - Redirect URLs → 同上
--
-- 这样用户注册/登录时会收到验证邮件
-- ============================================
