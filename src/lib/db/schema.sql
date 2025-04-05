-- Schema for the proxy logs table

CREATE TABLE IF NOT EXISTS proxy_logs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  ip VARCHAR(45) NOT NULL,
  url TEXT NOT NULL,
  status INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  user_agent TEXT,
  referer TEXT,
  duration INTEGER NOT NULL
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_proxy_logs_timestamp ON proxy_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_proxy_logs_ip ON proxy_logs(ip);
CREATE INDEX IF NOT EXISTS idx_proxy_logs_status ON proxy_logs(status);
