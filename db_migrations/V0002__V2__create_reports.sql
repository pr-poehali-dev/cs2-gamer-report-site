CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    reporter_steam_id VARCHAR(32) NOT NULL,
    reporter_username VARCHAR(255),
    target_steam_id VARCHAR(32) NOT NULL,
    target_username VARCHAR(255),
    target_avatar_url TEXT,
    target_profile_url TEXT,
    violation_type VARCHAR(100) NOT NULL,
    description TEXT,
    proof_url TEXT,
    status VARCHAR(32) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);
