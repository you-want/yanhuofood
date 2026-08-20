-- Aggregate-only daily quota counter for the optional server-side AMap WebService key.
-- It stores no user identifiers, addresses, coordinates, or API keys.
CREATE TABLE IF NOT EXISTS nearby_public_amap_daily_usage (
  quota_key TEXT NOT NULL,
  usage_date DATE NOT NULL,
  request_units INTEGER NOT NULL DEFAULT 0 CHECK (request_units >= 0),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (quota_key, usage_date)
);

REVOKE ALL ON TABLE nearby_public_amap_daily_usage FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE nearby_public_amap_daily_usage TO service_role;

CREATE OR REPLACE FUNCTION consume_nearby_public_amap_quota(
  p_quota_key TEXT,
  p_usage_date DATE,
  p_limit INTEGER,
  p_units INTEGER
)
RETURNS TABLE (allowed BOOLEAN, used INTEGER, remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_used INTEGER;
BEGIN
  IF p_quota_key IS NULL OR BTRIM(p_quota_key) = '' OR p_limit <= 0 OR p_units <= 0 THEN
    RAISE EXCEPTION 'Invalid public AMap quota parameters';
  END IF;

  IF p_units <= p_limit THEN
    INSERT INTO nearby_public_amap_daily_usage (
      quota_key,
      usage_date,
      request_units,
      updated_at
    )
    VALUES (p_quota_key, p_usage_date, p_units, NOW())
    ON CONFLICT (quota_key, usage_date) DO UPDATE
      SET request_units = nearby_public_amap_daily_usage.request_units + EXCLUDED.request_units,
          updated_at = NOW()
      WHERE nearby_public_amap_daily_usage.request_units + EXCLUDED.request_units <= p_limit
    RETURNING request_units INTO current_used;
  END IF;

  IF current_used IS NOT NULL THEN
    RETURN QUERY SELECT TRUE, current_used, GREATEST(0, p_limit - current_used);
    RETURN;
  END IF;

  SELECT request_units
    INTO current_used
    FROM nearby_public_amap_daily_usage
    WHERE quota_key = p_quota_key AND usage_date = p_usage_date;

  current_used := COALESCE(current_used, 0);
  RETURN QUERY SELECT FALSE, current_used, GREATEST(0, p_limit - current_used);
END;
$$;

REVOKE ALL ON FUNCTION consume_nearby_public_amap_quota(TEXT, DATE, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_nearby_public_amap_quota(TEXT, DATE, INTEGER, INTEGER)
  TO service_role;
