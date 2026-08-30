-- The Wonder Academy — Azure SQL schema v1 (T-SQL).
-- All timestamps are Unix milliseconds (BIGINT), so the application never has to
-- reason about server time zones.

IF OBJECT_ID('dbo.children') IS NULL
CREATE TABLE dbo.children (
  id                NVARCHAR(64)  NOT NULL PRIMARY KEY,   -- 'sol' | 'isaac' | 'sophia'
  display_name      NVARCHAR(100) NOT NULL,
  year_group        INT           NOT NULL,
  key_stage         NVARCHAR(16)  NOT NULL,               -- 'ks1' | 'ks3' | 'gcse'
  curriculum_id     NVARCHAR(32)  NOT NULL,               -- 'year2' | 'year7' | 'year10'
  colour            NVARCHAR(16)  NULL,
  pin_hash          NVARCHAR(128) NOT NULL,
  pin_salt          NVARCHAR(64)  NOT NULL,
  sessions_per_day  INT           NOT NULL DEFAULT 2,
  session_minutes   INT           NULL,                   -- NULL = untimed
  new_items_per_day INT           NOT NULL DEFAULT 4,
  request_retention FLOAT         NOT NULL DEFAULT 0.90,
  fsrs_params       NVARCHAR(MAX) NULL,
  active            INT           NOT NULL DEFAULT 1,
  created_at        BIGINT        NOT NULL
);

IF OBJECT_ID('dbo.parents') IS NULL
CREATE TABLE dbo.parents (
  id         NVARCHAR(32)  NOT NULL PRIMARY KEY,
  pin_hash   NVARCHAR(128) NOT NULL,
  pin_salt   NVARCHAR(64)  NOT NULL,
  created_at BIGINT        NOT NULL
);

IF OBJECT_ID('dbo.auth_sessions') IS NULL
CREATE TABLE dbo.auth_sessions (
  token_hash   NVARCHAR(64)  NOT NULL PRIMARY KEY,
  subject_type NVARCHAR(16)  NOT NULL,
  subject_id   NVARCHAR(64)  NOT NULL,
  issued_at    BIGINT        NOT NULL,
  expires_at   BIGINT        NOT NULL,
  revoked      INT           NOT NULL DEFAULT 0,
  user_agent   NVARCHAR(400) NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_auth_expiry')
CREATE INDEX idx_auth_expiry ON dbo.auth_sessions(expires_at);

IF OBJECT_ID('dbo.api_keys') IS NULL
CREATE TABLE dbo.api_keys (
  id           NVARCHAR(64)  NOT NULL PRIMARY KEY,
  name         NVARCHAR(100) NOT NULL,
  key_hash     NVARCHAR(64)  NOT NULL UNIQUE,
  scope        NVARCHAR(32)  NOT NULL,
  created_at   BIGINT        NOT NULL,
  last_used_at BIGINT        NULL,
  revoked      INT           NOT NULL DEFAULT 0
);

-- Rate limiting. Cloudflare KV's job, done in a table.
IF OBJECT_ID('dbo.rate_limit') IS NULL
CREATE TABLE dbo.rate_limit (
  rl_key     NVARCHAR(128) NOT NULL PRIMARY KEY,
  counter    INT           NOT NULL,
  expires_at BIGINT        NOT NULL
);

-- ─────────────────────── knowledge components ───────────────────────

IF OBJECT_ID('dbo.component') IS NULL
CREATE TABLE dbo.component (
  id                 NVARCHAR(128) NOT NULL PRIMARY KEY,
  curriculum_id      NVARCHAR(32)  NOT NULL,
  curriculum_version NVARCHAR(16)  NOT NULL DEFAULT '2014',
  subject            NVARCHAR(64)  NOT NULL,
  strand             NVARCHAR(64)  NULL,
  key_stage          NVARCHAR(16)  NULL,
  nc_reference       NVARCHAR(200) NULL,
  item_type          NVARCHAR(4)   NOT NULL,   -- A fact | B procedure | C concept | D discrimination
  statement          NVARCHAR(MAX) NOT NULL,
  lesson_id          NVARCHAR(128) NULL,
  term_id            NVARCHAR(32)  NULL,
  week               INT           NULL,
  prereq_ids         NVARCHAR(MAX) NULL,
  generator          NVARCHAR(128) NULL,
  rubric             NVARCHAR(MAX) NULL,
  target_latency_ms  INT           NULL,
  created_at         BIGINT        NOT NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_component_curr')
CREATE INDEX idx_component_curr ON dbo.component(curriculum_id, subject, term_id, week);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_component_lesson')
CREATE INDEX idx_component_lesson ON dbo.component(lesson_id);

-- ─────────────────────────── sittings ───────────────────────────

IF OBJECT_ID('dbo.learning_sessions') IS NULL
CREATE TABLE dbo.learning_sessions (
  id         NVARCHAR(64)  NOT NULL PRIMARY KEY,
  child_id   NVARCHAR(64)  NOT NULL,
  block      INT           NOT NULL DEFAULT 1,
  subject    NVARCHAR(64)  NULL,
  lesson_id  NVARCHAR(128) NULL,
  plan       NVARCHAR(MAX) NULL,
  started_at BIGINT        NOT NULL,
  ended_at   BIGINT        NULL,
  active_ms  BIGINT        NOT NULL DEFAULT 0,
  phase      NVARCHAR(32)  NULL,
  completed  INT           NOT NULL DEFAULT 0,
  device     NVARCHAR(400) NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_sessions_child')
CREATE INDEX idx_sessions_child ON dbo.learning_sessions(child_id, started_at DESC);

IF OBJECT_ID('dbo.lesson_attempts') IS NULL
CREATE TABLE dbo.lesson_attempts (
  id           NVARCHAR(64)  NOT NULL PRIMARY KEY,
  session_id   NVARCHAR(64)  NOT NULL,
  child_id     NVARCHAR(64)  NOT NULL,
  lesson_id    NVARCHAR(128) NOT NULL,
  curriculum_v NVARCHAR(32)  NOT NULL,
  subject      NVARCHAR(64)  NOT NULL,
  term_id      NVARCHAR(64)  NULL,
  week         INT           NULL,
  status       NVARCHAR(24)  NOT NULL,
  started_at   BIGINT        NOT NULL,
  completed_at BIGINT        NULL,
  active_ms    BIGINT        NOT NULL DEFAULT 0,
  score_num    INT           NULL,
  score_den    INT           NULL,
  teach_back   NVARCHAR(MAX) NULL,
  wonder_note  NVARCHAR(MAX) NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_attempts_child')
CREATE INDEX idx_attempts_child ON dbo.lesson_attempts(child_id, started_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_attempts_lesson')
CREATE INDEX idx_attempts_lesson ON dbo.lesson_attempts(child_id, lesson_id);

-- ─────────────────────── individual responses ───────────────────────

IF OBJECT_ID('dbo.question_responses') IS NULL
CREATE TABLE dbo.question_responses (
  id             BIGINT IDENTITY(1,1) PRIMARY KEY,
  attempt_id     NVARCHAR(64)  NULL,
  session_id     NVARCHAR(64)  NULL,
  child_id       NVARCHAR(64)  NOT NULL,
  component_id   NVARCHAR(128) NOT NULL,
  variant_seed   BIGINT        NULL,
  item_type      NVARCHAR(4)   NULL,
  modality       NVARCHAR(32)  NULL,
  phase          NVARCHAR(32)  NULL,
  question_text  NVARCHAR(MAX) NULL,
  expected       NVARCHAR(MAX) NULL,
  given          NVARCHAR(MAX) NULL,
  raw_transcript NVARCHAR(MAX) NULL,
  correct        INT           NOT NULL,
  partial        FLOAT         NULL,
  scaffold_level INT           NOT NULL DEFAULT 0,
  hints_used     INT           NOT NULL DEFAULT 0,
  latency_ms     INT           NULL,
  grader_conf    FLOAT         NULL,
  asr_suspect    INT           NOT NULL DEFAULT 0,
  deferred       INT           NOT NULL DEFAULT 0,
  pretest        INT           NOT NULL DEFAULT 0,
  misconceptions NVARCHAR(MAX) NULL,
  answered_at    BIGINT        NOT NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_resp_child_time')
CREATE INDEX idx_resp_child_time ON dbo.question_responses(child_id, answered_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_resp_child_comp')
CREATE INDEX idx_resp_child_comp ON dbo.question_responses(child_id, component_id, answered_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_resp_deferred')
CREATE INDEX idx_resp_deferred ON dbo.question_responses(child_id, deferred, answered_at DESC);

-- ──────────────────────── FSRS scheduler state ────────────────────────

IF OBJECT_ID('dbo.srs_card') IS NULL
CREATE TABLE dbo.srs_card (
  child_id              NVARCHAR(64)  NOT NULL,
  component_id          NVARCHAR(128) NOT NULL,
  subject               NVARCHAR(64)  NULL,
  strand                NVARCHAR(64)  NULL,
  item_type             NVARCHAR(4)   NULL,
  due                   BIGINT        NOT NULL,
  stability             FLOAT         NOT NULL DEFAULT 0,
  difficulty            FLOAT         NOT NULL DEFAULT 0,
  elapsed_days          FLOAT         NOT NULL DEFAULT 0,
  scheduled_days        FLOAT         NOT NULL DEFAULT 0,
  learning_steps        INT           NOT NULL DEFAULT 0,
  reps                  INT           NOT NULL DEFAULT 0,
  lapses                INT           NOT NULL DEFAULT 0,
  state                 INT           NOT NULL DEFAULT 0,
  last_review           BIGINT        NULL,
  consec_correct        INT           NOT NULL DEFAULT 0,
  distinct_days_correct INT           NOT NULL DEFAULT 0,
  last_correct_day      NVARCHAR(16)  NULL,
  unaided_recent        INT           NOT NULL DEFAULT 0,
  interleaved_correct   INT           NOT NULL DEFAULT 0,
  variants_seen         INT           NOT NULL DEFAULT 0,
  median_latency_ms     INT           NULL,
  seeded                INT           NOT NULL DEFAULT 0,
  mastered              INT           NOT NULL DEFAULT 0,
  mastered_at           BIGINT        NULL,
  suspended             INT           NOT NULL DEFAULT 0,
  same_day_exposures    INT           NOT NULL DEFAULT 0,
  same_day_key          NVARCHAR(16)  NULL,
  CONSTRAINT pk_srs_card PRIMARY KEY (child_id, component_id)
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_srs_due')
CREATE INDEX idx_srs_due ON dbo.srs_card(child_id, suspended, due);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_srs_subject')
CREATE INDEX idx_srs_subject ON dbo.srs_card(child_id, subject, mastered);

IF OBJECT_ID('dbo.review_log') IS NULL
CREATE TABLE dbo.review_log (
  id                BIGINT IDENTITY(1,1) PRIMARY KEY,
  child_id          NVARCHAR(64)  NOT NULL,
  component_id      NVARCHAR(128) NOT NULL,
  response_id       BIGINT        NULL,
  rating            INT           NOT NULL,
  state_before      INT           NOT NULL,
  elapsed_days      FLOAT         NULL,
  scheduled_days    FLOAT         NULL,
  stability_before  FLOAT         NULL,
  difficulty_before FLOAT         NULL,
  stability_after   FLOAT         NULL,
  difficulty_after  FLOAT         NULL,
  duration_ms       INT           NULL,
  scaffold_level    INT           NULL,
  modality          NVARCHAR(32)  NULL,
  interleaved       INT           NOT NULL DEFAULT 0,
  grader_conf       FLOAT         NULL,
  reviewed_at       BIGINT        NOT NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_revlog_child')
CREATE INDEX idx_revlog_child ON dbo.review_log(child_id, reviewed_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_revlog_comp')
CREATE INDEX idx_revlog_comp ON dbo.review_log(child_id, component_id, reviewed_at DESC);

-- ────────────────────────── voice lessons ──────────────────────────

IF OBJECT_ID('dbo.voice_conversations') IS NULL
CREATE TABLE dbo.voice_conversations (
  id              NVARCHAR(128) NOT NULL PRIMARY KEY,
  child_id        NVARCHAR(64)  NOT NULL,
  session_id      NVARCHAR(64)  NULL,
  agent_id        NVARCHAR(128) NULL,
  started_at      BIGINT        NOT NULL,
  ended_at        BIGINT        NULL,
  duration_s      INT           NULL,
  billed_s        INT           NULL,
  cost_fiat       FLOAT         NULL,
  status          NVARCHAR(24)  NULL,
  turn_count      INT           NULL,
  transcript_json NVARCHAR(MAX) NULL,
  summary         NVARCHAR(MAX) NULL,
  analysis_json   NVARCHAR(MAX) NULL,
  safety_flag     INT           NOT NULL DEFAULT 0
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_voice_child')
CREATE INDEX idx_voice_child ON dbo.voice_conversations(child_id, started_at DESC);

IF OBJECT_ID('dbo.token_grants') IS NULL
CREATE TABLE dbo.token_grants (
  id              BIGINT IDENTITY(1,1) PRIMARY KEY,
  child_id        NVARCHAR(64)  NOT NULL,
  agent_id        NVARCHAR(128) NOT NULL,
  conversation_id NVARCHAR(128) NULL,
  session_id      NVARCHAR(64)  NULL,
  minted_at       BIGINT        NOT NULL,
  user_agent      NVARCHAR(400) NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_grants_child')
CREATE INDEX idx_grants_child ON dbo.token_grants(child_id, minted_at DESC);

-- ─────────────────────────── rollups ───────────────────────────

IF OBJECT_ID('dbo.daily_rollup') IS NULL
CREATE TABLE dbo.daily_rollup (
  child_id          NVARCHAR(64) NOT NULL,
  day               NVARCHAR(16) NOT NULL,
  active_ms         BIGINT NOT NULL DEFAULT 0,
  sessions          INT NOT NULL DEFAULT 0,
  lessons_completed INT NOT NULL DEFAULT 0,
  items_answered    INT NOT NULL DEFAULT 0,
  items_correct     INT NOT NULL DEFAULT 0,
  unaided_answered  INT NOT NULL DEFAULT 0,
  reviews_due       INT NOT NULL DEFAULT 0,
  reviews_done      INT NOT NULL DEFAULT 0,
  overflow          INT NOT NULL DEFAULT 0,
  new_introduced    INT NOT NULL DEFAULT 0,
  mature_items      INT NOT NULL DEFAULT 0,
  delayed_correct   INT NOT NULL DEFAULT 0,
  delayed_answered  INT NOT NULL DEFAULT 0,
  voice_seconds     INT NOT NULL DEFAULT 0,
  CONSTRAINT pk_daily_rollup PRIMARY KEY (child_id, day)
);

IF OBJECT_ID('dbo.events') IS NULL
CREATE TABLE dbo.events (
  id         BIGINT IDENTITY(1,1) PRIMARY KEY,
  child_id   NVARCHAR(64)  NULL,
  type       NVARCHAR(64)  NOT NULL,
  payload    NVARCHAR(MAX) NOT NULL,
  created_at BIGINT        NOT NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_events_child')
CREATE INDEX idx_events_child ON dbo.events(child_id, created_at DESC);
