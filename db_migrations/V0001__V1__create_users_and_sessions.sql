CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    steam_id VARCHAR(32) UNIQUE NOT NULL,
    username VARCHAR(255),
    avatar_url TEXT,
    profile_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '7 days'
);
