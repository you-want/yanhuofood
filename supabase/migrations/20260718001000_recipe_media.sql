ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS video_search_keyword TEXT;

COMMENT ON COLUMN recipes.image_url IS 'Public http(s) image displayed in recipe cards and details.';
COMMENT ON COLUMN recipes.video_url IS 'Optional external cooking video URL.';
COMMENT ON COLUMN recipes.video_search_keyword IS 'Optional keyword used to build a Douyin recipe search URL.';
