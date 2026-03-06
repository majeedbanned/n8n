-- Context-aware routing upgrade for MAIN - Broker AI Bot Master
-- Safe to run multiple times (idempotent)

-- 1) Stateful routing table
CREATE TABLE IF NOT EXISTS chat_routing_state (
  session_id TEXT PRIMARY KEY,
  user_phone TEXT NOT NULL,
  last_intent TEXT,
  last_sub_intent TEXT,
  last_route_group TEXT,
  last_tools TEXT[] DEFAULT ARRAY[]::TEXT[],
  last_entities JSONB DEFAULT '{}'::JSONB,
  last_turn_at TIMESTAMPTZ,
  pending_clarification BOOLEAN DEFAULT FALSE,
  clarification_context JSONB DEFAULT '{}'::JSONB,
  clarification_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_routing_state_user_last_turn
  ON chat_routing_state (user_phone, last_turn_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_routing_state_last_turn
  ON chat_routing_state (last_turn_at DESC);

-- Ensure new columns exist on older installs
ALTER TABLE chat_routing_state
  ADD COLUMN IF NOT EXISTS pending_clarification BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS clarification_context JSONB DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS clarification_expires_at TIMESTAMPTZ;

-- 2) Enrich audit log schema for routing diagnostics
ALTER TABLE chat_audit_logs
  ADD COLUMN IF NOT EXISTS intent_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS effective_intent TEXT,
  ADD COLUMN IF NOT EXISTS route_group TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_inherited BOOLEAN,
  ADD COLUMN IF NOT EXISTS allowed_tools JSONB,
  ADD COLUMN IF NOT EXISTS tool_invoked TEXT;

-- 3) Enrich session schema with latest effective intent
ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS latest_effective_intent TEXT;

-- 4) Dead-letter table for undelivered outbound messages
CREATE TABLE IF NOT EXISTS failed_deliveries (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  channel TEXT,
  session_id TEXT,
  user_phone TEXT,
  payload JSONB,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_failed_deliveries_created_at
  ON failed_deliveries (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_failed_deliveries_status
  ON failed_deliveries (status);

-- 5) Error workflow log table
CREATE TABLE IF NOT EXISTS workflow_error_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  workflow_id TEXT,
  workflow_name TEXT,
  execution_id TEXT,
  failed_node TEXT,
  error_message TEXT,
  error_stack TEXT,
  channel TEXT,
  session_id TEXT,
  user_phone TEXT,
  payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_workflow_error_logs_created_at
  ON workflow_error_logs (created_at DESC);
