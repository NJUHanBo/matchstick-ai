-- ============================================
-- AI 记忆表
-- 在 Supabase SQL Editor 中运行
-- ============================================

CREATE TABLE user_memory (
    user_id TEXT PRIMARY KEY,
    memory TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memory_select_all" ON user_memory FOR SELECT USING (true);
CREATE POLICY "memory_insert_all" ON user_memory FOR INSERT WITH CHECK (true);
CREATE POLICY "memory_update_all" ON user_memory FOR UPDATE USING (true);
