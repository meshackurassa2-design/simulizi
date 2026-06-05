-- ============================================================
-- SIMULIZI - Run this ENTIRE script in Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================

-- 1. Add missing columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';

-- 2. Create comments table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable Row Level Security on comments
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for comments
--    Allow anyone to read comments
DROP POLICY IF EXISTS "comments_select" ON comments;
CREATE POLICY "comments_select" ON comments FOR SELECT USING (true);

--    Allow logged-in users to insert their own comments
DROP POLICY IF EXISTS "comments_insert" ON comments;
CREATE POLICY "comments_insert" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);

--    Allow users to delete their own comments
DROP POLICY IF EXISTS "comments_delete" ON comments;
CREATE POLICY "comments_delete" ON comments FOR DELETE USING (auth.uid() = user_id);

-- 5. Make sure likes table has correct RLS + unique constraint
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

-- Enforce one like per user per video at the database level
ALTER TABLE likes DROP CONSTRAINT IF EXISTS likes_video_user_unique;
ALTER TABLE likes ADD CONSTRAINT likes_video_user_unique UNIQUE (video_id, user_id);

DROP POLICY IF EXISTS "likes_select" ON likes;
CREATE POLICY "likes_select" ON likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "likes_insert" ON likes;
CREATE POLICY "likes_insert" ON likes FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "likes_delete" ON likes;
CREATE POLICY "likes_delete" ON likes FOR DELETE USING (auth.uid() = user_id);

-- 6. Make sure profiles can be updated by owner
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- 7. Enable Realtime on tables (safely - skip if already added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE likes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE comments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 8. Make sure the video details view is fully updated
ALTER TABLE videos ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS watch_seconds INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS edits JSONB DEFAULT '{}'::jsonb;


DROP VIEW IF EXISTS video_details;

CREATE VIEW video_details AS
SELECT 
    v.id,
    v.user_id AS author_id,
    v.video_url,
    v.caption,
    v.created_at,
    v.is_premium,
    v.price,
    v.view_count,
    v.watch_seconds,
    v.edits,
    p.username AS author_username,
    p.avatar_url AS author_avatar_url,
    (SELECT count(*) FROM likes l WHERE l.video_id = v.id) AS like_count,
    (SELECT count(*) FROM comments c WHERE c.video_id = v.id) AS comment_count,
    (
        ( (SELECT count(*) FROM likes l WHERE l.video_id = v.id) * 3 ) +
        ( (SELECT count(*) FROM comments c WHERE c.video_id = v.id) * 5 ) +
        COALESCE(v.view_count, 0) + 1
    ) / POWER(GREATEST(EXTRACT(EPOCH FROM (NOW() - v.created_at))/3600, 0) + 2, 1.5) AS trending_score
FROM videos v
LEFT JOIN profiles p ON v.user_id = p.id;

-- 9. Create follows table
CREATE TABLE IF NOT EXISTS follows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(follower_id, following_id)
);

ALTER TABLE follows ADD COLUMN IF NOT EXISTS source_video_id UUID REFERENCES videos(id) ON DELETE SET NULL;

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follows_select" ON follows;
CREATE POLICY "follows_select" ON follows FOR SELECT USING (true);

DROP POLICY IF EXISTS "follows_insert" ON follows;
CREATE POLICY "follows_insert" ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "follows_delete" ON follows;
CREATE POLICY "follows_delete" ON follows FOR DELETE USING (auth.uid() = follower_id);

-- 10. RPC for incrementing view count securely and uniquely
CREATE TABLE IF NOT EXISTS video_views (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    viewer_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(video_id, viewer_id)
);
ALTER TABLE video_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "video_views_select" ON video_views;
CREATE POLICY "video_views_select" ON video_views FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION record_unique_view(vid UUID, v_id TEXT)
RETURNS void AS $$
BEGIN
  INSERT INTO video_views (video_id, viewer_id)
  VALUES (vid, v_id)
  ON CONFLICT (video_id, viewer_id) DO NOTHING;
  
  IF FOUND THEN
    UPDATE videos SET view_count = COALESCE(view_count, 0) + 1 WHERE id = vid;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- 11. RPC for adding watch time securely
CREATE OR REPLACE FUNCTION add_watch_time(vid UUID, seconds INT)
RETURNS void AS $$
BEGIN
  UPDATE videos SET watch_seconds = COALESCE(watch_seconds, 0) + seconds WHERE id = vid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Force Supabase API schema cache to reload
NOTIFY pgrst, 'reload schema';

-- Done! All tables, views, policies, and functions are now configured correctly.
