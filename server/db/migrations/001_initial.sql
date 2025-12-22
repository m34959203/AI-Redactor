-- AI-Redactor Database Schema
-- Migration 001: Initial schema

-- Sessions table for tracking user work sessions
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settings JSONB DEFAULT '{}',
    onboarding_seen BOOLEAN DEFAULT FALSE
);

-- Articles table for current work
CREATE TABLE IF NOT EXISTS articles (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(36) REFERENCES sessions(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    title VARCHAR(1000),
    author VARCHAR(500),
    section VARCHAR(200),
    content TEXT,
    keywords TEXT,
    language VARCHAR(10) DEFAULT 'ru',
    file_data BYTEA, -- Original file bytes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Special pages (cover, description, final)
CREATE TABLE IF NOT EXISTS special_pages (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(36) REFERENCES sessions(id) ON DELETE CASCADE,
    page_type VARCHAR(50) NOT NULL, -- 'cover', 'description', 'final'
    filename VARCHAR(500),
    file_data BYTEA,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(session_id, page_type)
);

-- Archive issues (published journals)
CREATE TABLE IF NOT EXISTS archive_issues (
    id SERIAL PRIMARY KEY,
    issue_number VARCHAR(100),
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    title VARCHAR(500),
    article_count INTEGER DEFAULT 0,
    pdf_filename VARCHAR(500),
    pdf_data BYTEA,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Spell check results cache
CREATE TABLE IF NOT EXISTS spell_check_results (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(36) REFERENCES sessions(id) ON DELETE CASCADE,
    article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
    errors JSONB DEFAULT '[]',
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Review results cache
CREATE TABLE IF NOT EXISTS review_results (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(36) REFERENCES sessions(id) ON DELETE CASCADE,
    result JSONB,
    reviewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_articles_session ON articles(session_id);
CREATE INDEX IF NOT EXISTS idx_articles_section ON articles(section);
CREATE INDEX IF NOT EXISTS idx_special_pages_session ON special_pages(session_id);
CREATE INDEX IF NOT EXISTS idx_archive_year_month ON archive_issues(year, month);
CREATE INDEX IF NOT EXISTS idx_spell_check_session ON spell_check_results(session_id);
CREATE INDEX IF NOT EXISTS idx_review_session ON review_results(session_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_sessions_updated_at ON sessions;
CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_articles_updated_at ON articles;
CREATE TRIGGER update_articles_updated_at
    BEFORE UPDATE ON articles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
