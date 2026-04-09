-- Migration: Create user_quotas table for AI call quota management (P1-1)
-- Date: 2026-04-09
-- Purpose: Track user AI usage quotas and subscription plans

-- Create user_quotas table
CREATE TABLE IF NOT EXISTS user_quotas (
  user_id TEXT PRIMARY KEY,
  organization_id TEXT DEFAULT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('free', 'basic', 'pro', 'enterprise')),
  monthly_quota INTEGER NOT NULL CHECK (monthly_quota >= -1), -- -1 means unlimited
  current_usage INTEGER NOT NULL DEFAULT 0 CHECK (current_usage >= 0),
  reset_date BIGINT NOT NULL, -- Timestamp in milliseconds
  created_at BIGINT NOT NULL,
  last_modified BIGINT NOT NULL
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_quotas_organization_id
ON user_quotas(organization_id)
WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_quotas_plan
ON user_quotas(plan);

CREATE INDEX IF NOT EXISTS idx_user_quotas_reset_date
ON user_quotas(reset_date);

-- Add RLS (Row Level Security) policies
ALTER TABLE user_quotas ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own quota
CREATE POLICY "Users can view own quota"
ON user_quotas
FOR SELECT
USING (auth.uid()::TEXT = user_id);

-- Policy: Users can update their own quota (for usage tracking)
CREATE POLICY "Users can update own quota"
ON user_quotas
FOR UPDATE
USING (auth.uid()::TEXT = user_id);

-- Policy: Users can insert their own quota (first-time creation)
CREATE POLICY "Users can insert own quota"
ON user_quotas
FOR INSERT
WITH CHECK (auth.uid()::TEXT = user_id);

-- Add comments for documentation
COMMENT ON TABLE user_quotas IS 'User AI call quota tracking and subscription plan management';
COMMENT ON COLUMN user_quotas.user_id IS 'Supabase auth user ID (UUID as TEXT)';
COMMENT ON COLUMN user_quotas.organization_id IS 'Organization ID for team accounts (optional)';
COMMENT ON COLUMN user_quotas.plan IS 'Subscription plan: free, basic, pro, or enterprise';
COMMENT ON COLUMN user_quotas.monthly_quota IS 'Total AI calls allowed per month (-1 = unlimited for enterprise)';
COMMENT ON COLUMN user_quotas.current_usage IS 'Number of AI calls used in current billing period';
COMMENT ON COLUMN user_quotas.reset_date IS 'Timestamp (milliseconds) when quota resets (typically 1st of next month)';
COMMENT ON COLUMN user_quotas.created_at IS 'Timestamp (milliseconds) when quota config was created';
COMMENT ON COLUMN user_quotas.last_modified IS 'Timestamp (milliseconds) of last update';

-- Optional: Create a function to automatically reset quotas at the start of each month
-- This would be called by a Supabase Edge Function or cron job
CREATE OR REPLACE FUNCTION reset_expired_quotas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  now_ms BIGINT := EXTRACT(EPOCH FROM NOW())::BIGINT * 1000;
BEGIN
  -- Reset quotas where reset_date has passed
  UPDATE user_quotas
  SET
    current_usage = 0,
    reset_date = EXTRACT(EPOCH FROM (DATE_TRUNC('month', NOW()) + INTERVAL '1 month'))::BIGINT * 1000,
    last_modified = now_ms
  WHERE reset_date <= now_ms;
END;
$$;

COMMENT ON FUNCTION reset_expired_quotas IS 'Resets quotas for users whose reset_date has passed. Should be called daily by a cron job.';
