-- ============================================================
-- Void Checks Table
-- Run this SQL in your Supabase SQL Editor (Dashboard > SQL)
-- ============================================================

CREATE TABLE IF NOT EXISTS void_checks (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_number  TEXT NOT NULL,
  check_number  TEXT NOT NULL,
  check_amount  NUMERIC(12, 2) NOT NULL,
  check_date    DATE NOT NULL,
  notes         TEXT DEFAULT '',
  request_date  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completion_status TEXT NOT NULL DEFAULT 'Pending'
    CHECK (completion_status IN ('Pending', 'Complete', 'Request Invalidated')),
  sign_off_date TIMESTAMPTZ,
  created_by    TEXT NOT NULL,
  attachments   JSONB DEFAULT '[]'::JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX idx_void_checks_status ON void_checks (completion_status);
CREATE INDEX idx_void_checks_request_date ON void_checks (request_date DESC);

-- Enable Row Level Security (optional — adjust policies to your auth setup)
ALTER TABLE void_checks ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read all rows
CREATE POLICY "Allow read for all" ON void_checks
  FOR SELECT USING (true);

-- Allow all authenticated users to insert
CREATE POLICY "Allow insert for all" ON void_checks
  FOR INSERT WITH CHECK (true);

-- Allow all authenticated users to update
CREATE POLICY "Allow update for all" ON void_checks
  FOR UPDATE USING (true);

-- Allow all authenticated users to delete
CREATE POLICY "Allow delete for all" ON void_checks
  FOR DELETE USING (true);
