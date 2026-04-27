-- Cloudflare Scheduler MVP schema
-- 适用于 xchatbot 的定时任务中心。

CREATE TABLE IF NOT EXISTS scheduler_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    namespace TEXT NOT NULL,
    job_key TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
    executor_key TEXT NOT NULL,
    schedule_type TEXT NOT NULL CHECK (schedule_type IN ('cron', 'once', 'delay')),
    cron_expr TEXT,
    timezone TEXT,
    payload_json TEXT NOT NULL,
    misfire_policy TEXT NOT NULL DEFAULT 'fire_once',
    retry_limit INTEGER NOT NULL DEFAULT 0 CHECK (retry_limit >= 0),
    retry_backoff_sec INTEGER NOT NULL DEFAULT 60 CHECK (retry_backoff_sec >= 1),
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    concurrency_policy TEXT NOT NULL DEFAULT 'forbid' CHECK (concurrency_policy IN ('forbid')),
    next_run_at INTEGER,
    last_run_at INTEGER,
    last_success_at INTEGER,
    last_error TEXT,
    lease_token TEXT,
    lease_until INTEGER,
    version INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(namespace, job_key),
    CHECK (schedule_type != 'cron' OR cron_expr IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_scheduler_jobs_status_next_run
    ON scheduler_jobs (status, next_run_at, id);

CREATE INDEX IF NOT EXISTS idx_scheduler_jobs_lease_until
    ON scheduler_jobs (lease_until);

CREATE INDEX IF NOT EXISTS idx_scheduler_jobs_executor_key
    ON scheduler_jobs (executor_key);

CREATE TABLE IF NOT EXISTS scheduler_job_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    trigger_source TEXT NOT NULL CHECK (trigger_source IN ('scheduled', 'manual', 'retry')),
    scheduled_at INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'skipped')),
    attempt_no INTEGER NOT NULL DEFAULT 1 CHECK (attempt_no >= 1),
    worker_invocation_id TEXT,
    duration_ms INTEGER,
    result_json TEXT,
    error_text TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (job_id) REFERENCES scheduler_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scheduler_job_runs_job_id_created_at
    ON scheduler_job_runs (job_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_scheduler_job_runs_status_created_at
    ON scheduler_job_runs (status, created_at DESC, id DESC);

