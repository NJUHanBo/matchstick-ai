-- ============================================
-- 游戏云存档表
-- 在 Supabase SQL Editor 中运行
-- ============================================

CREATE TABLE game_saves (
    user_id TEXT PRIMARY KEY,
    save_data JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE game_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saves_select_all" ON game_saves FOR SELECT USING (true);
CREATE POLICY "saves_insert_all" ON game_saves FOR INSERT WITH CHECK (true);
CREATE POLICY "saves_update_all" ON game_saves FOR UPDATE USING (true);
