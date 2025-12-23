-- AI-Redactor Database Schema
-- Migration 002: Social Media Integrations

-- Social media integrations configuration
CREATE TABLE IF NOT EXISTS social_media_integrations (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(36) REFERENCES sessions(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL, -- 'instagram', 'telegram', 'facebook', 'tiktok'
    enabled BOOLEAN DEFAULT FALSE,
    access_token TEXT, -- Platform API access token
    account_id VARCHAR(255), -- Platform account/page ID
    default_language VARCHAR(10) DEFAULT 'ru',
    webhook_verify_token VARCHAR(255), -- Token for webhook verification
    settings JSONB DEFAULT '{}', -- Platform-specific settings
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(session_id, platform)
);

-- Social media posts log (for tracking published posts)
CREATE TABLE IF NOT EXISTS social_media_posts (
    id SERIAL PRIMARY KEY,
    integration_id INTEGER REFERENCES social_media_integrations(id) ON DELETE CASCADE,
    archive_issue_id INTEGER REFERENCES archive_issues(id) ON DELETE SET NULL,
    platform VARCHAR(50) NOT NULL,
    external_post_id VARCHAR(255), -- ID from the social platform
    post_type VARCHAR(50) DEFAULT 'article', -- 'article', 'issue', 'announcement'
    content TEXT, -- Post content/caption
    media_url TEXT, -- URL of attached media
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'published', 'failed', 'deleted'
    error_message TEXT,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Instagram webhook events log (for debugging and audit)
CREATE TABLE IF NOT EXISTS instagram_webhook_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(100), -- 'comments', 'mentions', 'story_insights', etc.
    object_type VARCHAR(50), -- 'instagram' or 'page'
    sender_id VARCHAR(255),
    recipient_id VARCHAR(255),
    payload JSONB,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for social media tables
CREATE INDEX IF NOT EXISTS idx_social_media_session ON social_media_integrations(session_id);
CREATE INDEX IF NOT EXISTS idx_social_media_platform ON social_media_integrations(platform);
CREATE INDEX IF NOT EXISTS idx_social_posts_integration ON social_media_posts(integration_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_media_posts(status);
CREATE INDEX IF NOT EXISTS idx_instagram_events_type ON instagram_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_instagram_events_processed ON instagram_webhook_events(processed);

-- Trigger for updated_at on social_media_integrations
DROP TRIGGER IF EXISTS update_social_media_integrations_updated_at ON social_media_integrations;
CREATE TRIGGER update_social_media_integrations_updated_at
    BEFORE UPDATE ON social_media_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
