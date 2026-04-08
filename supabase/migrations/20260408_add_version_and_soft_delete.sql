-- Migration: Add version control and soft delete support to patent_projects table
-- Date: 2026-04-08
-- Purpose: Enable conflict resolution and data recovery features (P0-1)

-- Add version column for conflict detection
ALTER TABLE patent_projects
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL;

-- Add soft delete timestamp column
ALTER TABLE patent_projects
ADD COLUMN IF NOT EXISTS deleted_at BIGINT DEFAULT NULL;

-- Create index for filtering deleted projects
CREATE INDEX IF NOT EXISTS idx_patent_projects_deleted_at
ON patent_projects(deleted_at);

-- Create index for version-based queries
CREATE INDEX IF NOT EXISTS idx_patent_projects_version
ON patent_projects(version DESC);

-- Update existing rows to have version = 1 if NULL
UPDATE patent_projects
SET version = 1
WHERE version IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN patent_projects.version IS 'Version number for conflict detection, incremented on each save';
COMMENT ON COLUMN patent_projects.deleted_at IS 'Soft delete timestamp in milliseconds since epoch; NULL means not deleted';

-- Optional: Create a view that filters out deleted projects by default
CREATE OR REPLACE VIEW active_patent_projects AS
SELECT *
FROM patent_projects
WHERE deleted_at IS NULL;

COMMENT ON VIEW active_patent_projects IS 'View of patent_projects excluding soft-deleted records';
