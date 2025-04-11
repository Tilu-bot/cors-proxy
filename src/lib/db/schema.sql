-- Proxy logs table for streaming content and metadata
CREATE TABLE IF NOT EXISTS proxy_logs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip VARCHAR(45) NOT NULL,                        -- stored but never shown
  url TEXT NOT NULL,
  method TEXT DEFAULT 'GET',
  status INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  user_agent TEXT,
  referer TEXT,
  duration INTEGER NOT NULL,                      -- in milliseconds
  type TEXT NOT NULL,                             -- e.g., m3u8, vtt, image, json
  sanitized BOOLEAN DEFAULT false,                -- new field
  output_format TEXT,                             -- e.g., rewritten, original, etc.
  edge_cached BOOLEAN DEFAULT false               -- true if served from edge
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON proxy_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_type ON proxy_logs(type);
CREATE INDEX IF NOT EXISTS idx_logs_status ON proxy_logs(status);
CREATE INDEX IF NOT EXISTS idx_logs_ip ON proxy_logs(ip);
CREATE INDEX IF NOT EXISTS idx_logs_sanitized ON proxy_logs(sanitized);
CREATE INDEX IF NOT EXISTS idx_logs_output_format ON proxy_logs(output_format);
