-- ============================================
-- CMS Prime Broker AI Bot - Database Schema
-- Comprehensive schema for AI-powered support
-- ============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. USER CONFIGURATIONS TABLE (Enhanced)
-- ============================================
CREATE TABLE IF NOT EXISTS user_configs (
    id SERIAL PRIMARY KEY,
    user_phone VARCHAR(30) UNIQUE NOT NULL,
    client_id INTEGER,
    
    -- System Configuration
    system_prompt TEXT,
    preferred_language VARCHAR(10) DEFAULT 'en',
    communication_style VARCHAR(30) DEFAULT 'friendly_support',
    
    -- User Status
    is_vip BOOLEAN DEFAULT FALSE,
    is_ib BOOLEAN DEFAULT FALSE,
    verification_status VARCHAR(20) DEFAULT 'pending',
    
    -- Activity Tracking
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_channel VARCHAR(20),
    total_interactions INTEGER DEFAULT 0,
    
    -- Preferences
    notification_enabled BOOLEAN DEFAULT TRUE,
    proactive_alerts_enabled BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_configs_client_id ON user_configs(client_id);
CREATE INDEX IF NOT EXISTS idx_user_configs_last_seen ON user_configs(last_seen_at);

-- ============================================
-- 2. USER PREFERENCES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_phone VARCHAR(30) UNIQUE NOT NULL REFERENCES user_configs(user_phone) ON DELETE CASCADE,
    
    -- Communication Preferences
    persona_override VARCHAR(30),
    response_verbosity VARCHAR(20) DEFAULT 'normal', -- brief, normal, detailed
    preferred_greeting VARCHAR(100),
    
    -- Topics of Interest (for personalization)
    topics_of_interest TEXT[] DEFAULT ARRAY[]::TEXT[],
    favorite_instruments TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Notification Preferences
    notification_preferences JSONB DEFAULT '{
        "price_alerts": true,
        "margin_warnings": true,
        "deposit_confirmations": true,
        "promotion_updates": true,
        "news_alerts": false
    }'::JSONB,
    
    -- Activity Context
    last_trading_activity TIMESTAMP WITH TIME ZONE,
    typical_trading_hours JSONB, -- e.g., {"start": "09:00", "end": "17:00", "timezone": "UTC+4"}
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 3. CHAT SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS chat_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    user_phone VARCHAR(30) NOT NULL,
    client_id INTEGER,
    
    -- Session Details
    channel VARCHAR(20) NOT NULL,
    session_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    session_end TIMESTAMP WITH TIME ZONE,
    
    -- Session Metrics
    messages_count INTEGER DEFAULT 0,
    sentiment_avg DECIMAL(3,2) DEFAULT 0,
    intents_detected TEXT[] DEFAULT ARRAY[]::TEXT[],
    tools_used TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Escalation Tracking
    escalated BOOLEAN DEFAULT FALSE,
    escalation_reason VARCHAR(50),
    escalation_time TIMESTAMP WITH TIME ZONE,
    resolved BOOLEAN DEFAULT FALSE,
    resolution_notes TEXT,
    
    -- Feedback
    user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
    user_feedback TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for session queries
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_phone ON chat_sessions(user_phone);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_start ON chat_sessions(session_start);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_escalated ON chat_sessions(escalated) WHERE escalated = TRUE;

-- ============================================
-- 4. CHAT AUDIT LOGS TABLE (Enhanced)
-- ============================================
CREATE TABLE IF NOT EXISTS chat_audit_logs (
    id SERIAL PRIMARY KEY,
    
    -- User Identification
    user_phone VARCHAR(30),
    client_id INTEGER,
    
    -- Session Context
    channel VARCHAR(20),
    session_id VARCHAR(100),
    
    -- Message Content
    inbound_text TEXT,
    outbound_text TEXT,
    
    -- NLP Analysis
    detected_language VARCHAR(10),
    sentiment VARCHAR(20),
    sentiment_score DECIMAL(3,2),
    intent_classified VARCHAR(50),
    sub_intent VARCHAR(50),
    
    -- AI Processing
    persona_used VARCHAR(30),
    tools_called JSONB, -- Array of {tool_name, input, output, duration_ms}
    response_time_ms INTEGER,
    
    -- Compliance & Escalation
    compliance_flags JSONB DEFAULT '[]'::JSONB,
    escalated BOOLEAN DEFAULT FALSE,
    escalation_reason VARCHAR(50),
    
    -- Error Tracking
    error_occurred BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_audit_user_phone ON chat_audit_logs(user_phone);
CREATE INDEX IF NOT EXISTS idx_audit_created ON chat_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_session ON chat_audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_intent ON chat_audit_logs(intent_classified);
CREATE INDEX IF NOT EXISTS idx_audit_escalated ON chat_audit_logs(escalated) WHERE escalated = TRUE;

-- ============================================
-- 5. CONVERSATION INSIGHTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS conversation_insights (
    id SERIAL PRIMARY KEY,
    user_phone VARCHAR(30) NOT NULL,
    client_id INTEGER,
    
    -- Insight Details
    insight_type VARCHAR(50) NOT NULL, -- e.g., 'trading_interest', 'pain_point', 'feature_request', 'sentiment_trend'
    insight_data JSONB NOT NULL,
    confidence DECIMAL(3,2),
    
    -- Source Tracking
    source_session_id VARCHAR(100),
    extracted_from TEXT, -- The text that led to this insight
    
    -- Status
    is_actionable BOOLEAN DEFAULT FALSE,
    actioned BOOLEAN DEFAULT FALSE,
    actioned_by VARCHAR(100),
    actioned_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    extracted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for insight queries
CREATE INDEX IF NOT EXISTS idx_insights_user ON conversation_insights(user_phone);
CREATE INDEX IF NOT EXISTS idx_insights_type ON conversation_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_insights_actionable ON conversation_insights(is_actionable) WHERE is_actionable = TRUE;

-- ============================================
-- 6. SUPPORT TICKETS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS support_tickets (
    id SERIAL PRIMARY KEY,
    ticket_id UUID DEFAULT uuid_generate_v4() UNIQUE,
    
    -- User Info
    user_phone VARCHAR(30),
    client_id INTEGER,
    client_name VARCHAR(200),
    client_email VARCHAR(200),
    
    -- Ticket Details
    category VARCHAR(50) NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium',
    subject VARCHAR(500) NOT NULL,
    description TEXT,
    
    -- Source
    source_channel VARCHAR(20),
    source_session_id VARCHAR(100),
    ai_summary TEXT, -- AI-generated summary of the conversation leading to ticket
    
    -- Assignment
    assigned_department VARCHAR(50),
    assigned_agent VARCHAR(100),
    assigned_at TIMESTAMP WITH TIME ZONE,
    
    -- Status
    status VARCHAR(20) DEFAULT 'open', -- open, in_progress, pending_user, resolved, closed
    resolution TEXT,
    
    -- SLA
    sla_due_at TIMESTAMP WITH TIME ZONE,
    sla_breached BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tickets_client ON support_tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_sla ON support_tickets(sla_due_at) WHERE status NOT IN ('resolved', 'closed');

-- ============================================
-- 7. SCHEDULED CALLBACKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS scheduled_callbacks (
    id SERIAL PRIMARY KEY,
    booking_id UUID DEFAULT uuid_generate_v4() UNIQUE,
    
    -- User Info
    user_phone VARCHAR(30),
    client_id INTEGER,
    client_name VARCHAR(200),
    
    -- Scheduling
    preferred_datetime TIMESTAMP WITH TIME ZONE,
    confirmed_datetime TIMESTAMP WITH TIME ZONE,
    timezone VARCHAR(50),
    duration_minutes INTEGER DEFAULT 30,
    
    -- Details
    topic VARCHAR(200),
    notes TEXT,
    
    -- Assignment
    assigned_agent VARCHAR(100),
    agent_email VARCHAR(200),
    meeting_link VARCHAR(500),
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- pending, confirmed, completed, cancelled, no_show
    cancellation_reason TEXT,
    
    -- Follow-up
    outcome TEXT,
    follow_up_required BOOLEAN DEFAULT FALSE,
    follow_up_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_callbacks_client ON scheduled_callbacks(client_id);
CREATE INDEX IF NOT EXISTS idx_callbacks_datetime ON scheduled_callbacks(confirmed_datetime);
CREATE INDEX IF NOT EXISTS idx_callbacks_status ON scheduled_callbacks(status);

-- ============================================
-- 8. PROACTIVE ALERTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS proactive_alerts (
    id SERIAL PRIMARY KEY,
    alert_id UUID DEFAULT uuid_generate_v4() UNIQUE,
    
    -- Target User
    user_phone VARCHAR(30) NOT NULL,
    client_id INTEGER,
    
    -- Alert Details
    alert_type VARCHAR(50) NOT NULL, -- margin_warning, price_alert, document_expiry, promotion, news
    alert_data JSONB NOT NULL,
    priority VARCHAR(20) DEFAULT 'normal',
    
    -- Delivery
    delivery_channel VARCHAR(20),
    scheduled_for TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    delivery_status VARCHAR(20) DEFAULT 'pending', -- pending, sent, delivered, failed, cancelled
    
    -- User Response
    user_acknowledged BOOLEAN DEFAULT FALSE,
    user_action_taken VARCHAR(100),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_alerts_user ON proactive_alerts(user_phone);
CREATE INDEX IF NOT EXISTS idx_alerts_scheduled ON proactive_alerts(scheduled_for) WHERE delivery_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_alerts_type ON proactive_alerts(alert_type);

-- ============================================
-- 9. FAQ KNOWLEDGE BASE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS faq_knowledge_base (
    id SERIAL PRIMARY KEY,
    
    -- Content
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    category VARCHAR(50),
    subcategory VARCHAR(50),
    
    -- Search Optimization
    keywords TEXT[],
    search_vector TSVECTOR,
    
    -- Metadata
    language VARCHAR(10) DEFAULT 'en',
    article_url VARCHAR(500),
    
    -- Relevance
    times_served INTEGER DEFAULT 0,
    helpful_count INTEGER DEFAULT 0,
    not_helpful_count INTEGER DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_faq_search ON faq_knowledge_base USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_faq_category ON faq_knowledge_base(category);

-- Trigger to update search vector
CREATE OR REPLACE FUNCTION update_faq_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := 
        setweight(to_tsvector('english', COALESCE(NEW.question, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.answer, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.keywords, ' '), '')), 'A');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS faq_search_vector_update ON faq_knowledge_base;
CREATE TRIGGER faq_search_vector_update
    BEFORE INSERT OR UPDATE ON faq_knowledge_base
    FOR EACH ROW
    EXECUTE FUNCTION update_faq_search_vector();

-- ============================================
-- 10. PERSONA TEMPLATES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS persona_templates (
    id SERIAL PRIMARY KEY,
    persona_name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    description TEXT,
    
    -- Prompt Configuration
    system_prompt_template TEXT NOT NULL,
    greeting_template TEXT,
    farewell_template TEXT,
    
    -- Behavior Settings
    temperature DECIMAL(2,1) DEFAULT 0.3,
    response_style VARCHAR(20) DEFAULT 'conversational', -- conversational, formal, brief
    empathy_level VARCHAR(20) DEFAULT 'normal', -- low, normal, high
    
    -- Usage Conditions
    trigger_conditions JSONB, -- e.g., {"sentiment": ["angry", "frustrated"], "intent": ["complaint"]}
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default personas
INSERT INTO persona_templates (persona_name, display_name, description, system_prompt_template, is_active, is_default) VALUES
('friendly_support', 'Friendly Support', 'Default warm and helpful persona', 
 'You are Alex, a friendly and warm support specialist at CMS Prime. Be conversational, use simple language, show genuine care. Use occasional light humor when appropriate.',
 TRUE, TRUE),
('empathetic_support', 'Empathetic Support', 'For frustrated or upset users',
 'You are Alex, a patient and understanding support specialist at CMS Prime. The customer seems frustrated - acknowledge their feelings first, apologize for any inconvenience, and focus on solutions. Be extra patient and reassuring.',
 TRUE, FALSE),
('professional_analyst', 'Professional Analyst', 'For market and trading questions',
 'You are Alex, a knowledgeable market analyst at CMS Prime. Provide clear, data-driven insights. Be professional but approachable. Use proper trading terminology but explain complex concepts simply.',
 TRUE, FALSE),
('urgent_responder', 'Urgent Responder', 'For time-sensitive requests',
 'You are Alex, a responsive support specialist at CMS Prime. The customer needs quick help - be concise and action-oriented. Get to the solution fast while remaining professional.',
 TRUE, FALSE)
ON CONFLICT (persona_name) DO NOTHING;

-- ============================================
-- 11. ANALYTICS AGGREGATES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS analytics_daily (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    channel VARCHAR(20),
    
    -- Volume Metrics
    total_conversations INTEGER DEFAULT 0,
    total_messages INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    new_users INTEGER DEFAULT 0,
    
    -- Performance Metrics
    avg_response_time_ms INTEGER,
    avg_messages_per_session DECIMAL(5,2),
    avg_session_duration_seconds INTEGER,
    
    -- Sentiment Metrics
    avg_sentiment_score DECIMAL(3,2),
    positive_sentiment_count INTEGER DEFAULT 0,
    negative_sentiment_count INTEGER DEFAULT 0,
    
    -- Intent Distribution
    intent_distribution JSONB,
    
    -- Escalation Metrics
    escalation_count INTEGER DEFAULT 0,
    escalation_rate DECIMAL(5,4),
    
    -- Tool Usage
    tool_usage_counts JSONB,
    
    -- Resolution Metrics
    issues_resolved INTEGER DEFAULT 0,
    resolution_rate DECIMAL(5,4),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(date, channel)
);

CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics_daily(date);

-- ============================================
-- 12. COMPLIANCE RULES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS compliance_rules (
    id SERIAL PRIMARY KEY,
    rule_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    
    -- Rule Definition
    rule_type VARCHAR(30) NOT NULL, -- prohibited_phrase, required_disclaimer, response_limit
    pattern TEXT, -- Regex pattern for prohibited phrases
    replacement TEXT, -- Replacement text
    disclaimer_text TEXT, -- Text to add
    trigger_keywords TEXT[], -- Keywords that trigger this rule
    
    -- Applicability
    applies_to_intents TEXT[] DEFAULT ARRAY[]::TEXT[],
    applies_to_countries TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    severity VARCHAR(20) DEFAULT 'warning', -- warning, block, escalate
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default compliance rules
INSERT INTO compliance_rules (rule_name, rule_type, pattern, replacement, is_active) VALUES
('no_guaranteed_profit', 'prohibited_phrase', 'guaranteed.*profit', 'potential returns (not guaranteed)', TRUE),
('no_risk_free', 'prohibited_phrase', 'risk.?free', 'with managed risk', TRUE),
('no_easy_money', 'prohibited_phrase', 'easy money', 'trading opportunities', TRUE),
('trading_disclaimer', 'required_disclaimer', NULL, 'Trading involves risk. Past performance is not indicative of future results.', TRUE)
ON CONFLICT (rule_name) DO NOTHING;

-- ============================================
-- UTILITY VIEWS
-- ============================================

-- Active VIP users view
CREATE OR REPLACE VIEW vip_users AS
SELECT 
    uc.user_phone,
    uc.client_id,
    uc.preferred_language,
    uc.total_interactions,
    uc.last_seen_at,
    cs.recent_sessions,
    cs.avg_sentiment
FROM user_configs uc
LEFT JOIN LATERAL (
    SELECT 
        COUNT(*) as recent_sessions,
        AVG(sentiment_avg) as avg_sentiment
    FROM chat_sessions 
    WHERE user_phone = uc.user_phone 
    AND session_start > NOW() - INTERVAL '30 days'
) cs ON TRUE
WHERE uc.is_vip = TRUE;

-- Pending escalations view
CREATE OR REPLACE VIEW pending_escalations AS
SELECT 
    st.*,
    uc.preferred_language,
    uc.is_vip
FROM support_tickets st
LEFT JOIN user_configs uc ON st.user_phone = uc.user_phone
WHERE st.status IN ('open', 'in_progress')
ORDER BY 
    CASE st.priority 
        WHEN 'urgent' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        ELSE 4 
    END,
    st.created_at;

-- User conversation summary view
CREATE OR REPLACE VIEW user_conversation_summary AS
SELECT 
    uc.user_phone,
    uc.client_id,
    uc.preferred_language,
    uc.is_vip,
    uc.total_interactions,
    uc.last_seen_at,
    (SELECT COUNT(*) FROM chat_sessions WHERE user_phone = uc.user_phone) as total_sessions,
    (SELECT AVG(sentiment_avg) FROM chat_sessions WHERE user_phone = uc.user_phone) as overall_sentiment,
    (SELECT COUNT(*) FROM support_tickets WHERE user_phone = uc.user_phone AND status = 'open') as open_tickets,
    (SELECT MAX(created_at) FROM chat_audit_logs WHERE user_phone = uc.user_phone) as last_interaction
FROM user_configs uc;

-- ============================================
-- MAINTENANCE FUNCTIONS
-- ============================================

-- Function to clean old audit logs (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM chat_audit_logs 
    WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to aggregate daily analytics
CREATE OR REPLACE FUNCTION aggregate_daily_analytics(target_date DATE)
RETURNS VOID AS $$
BEGIN
    INSERT INTO analytics_daily (
        date, channel, total_conversations, total_messages, unique_users,
        avg_response_time_ms, avg_sentiment_score, escalation_count
    )
    SELECT 
        target_date,
        channel,
        COUNT(DISTINCT session_id),
        COUNT(*),
        COUNT(DISTINCT user_phone),
        AVG(response_time_ms)::INTEGER,
        AVG(sentiment_score),
        COUNT(*) FILTER (WHERE escalated = TRUE)
    FROM chat_audit_logs
    WHERE DATE(created_at) = target_date
    GROUP BY channel
    ON CONFLICT (date, channel) DO UPDATE SET
        total_conversations = EXCLUDED.total_conversations,
        total_messages = EXCLUDED.total_messages,
        unique_users = EXCLUDED.unique_users,
        avg_response_time_ms = EXCLUDED.avg_response_time_ms,
        avg_sentiment_score = EXCLUDED.avg_sentiment_score,
        escalation_count = EXCLUDED.escalation_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- GRANTS (Adjust role name as needed)
-- ============================================
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO n8n_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO n8n_user;

COMMENT ON TABLE user_configs IS 'User configuration and preferences for AI bot interactions';
COMMENT ON TABLE chat_sessions IS 'Individual chat sessions with metrics and status';
COMMENT ON TABLE chat_audit_logs IS 'Comprehensive audit log of all AI interactions';
COMMENT ON TABLE conversation_insights IS 'AI-extracted insights from conversations for personalization';
COMMENT ON TABLE support_tickets IS 'Support tickets created via AI escalation';
COMMENT ON TABLE scheduled_callbacks IS 'Scheduled callbacks with relationship managers';
COMMENT ON TABLE proactive_alerts IS 'Proactive notifications sent to users';
COMMENT ON TABLE faq_knowledge_base IS 'FAQ and knowledge base for AI to reference';
COMMENT ON TABLE persona_templates IS 'AI persona configurations for different contexts';
COMMENT ON TABLE analytics_daily IS 'Daily aggregated analytics for reporting';
COMMENT ON TABLE compliance_rules IS 'Compliance rules for AI response filtering';

