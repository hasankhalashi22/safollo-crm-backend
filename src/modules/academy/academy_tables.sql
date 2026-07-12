-- ═══════════════════════════════════════════════════════════════════
-- ACADEMY MODULE — Database Tables
-- Run this in Supabase SQL Editor (once)
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Zoom Accounts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_zoom_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name    TEXT NOT NULL,
  email           TEXT NOT NULL,
  host_key        TEXT,
  zoom_user_id    TEXT,
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Payment Rates (teacher_type × class_type matrix) ──────────
CREATE TABLE IF NOT EXISTS academy_payment_rates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_type    TEXT NOT NULL CHECK (teacher_type IN ('senior','junior','guest')),
  class_type      TEXT NOT NULL CHECK (class_type IN ('regular','makeup','exam_review')),
  rate_per_class  NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_type, class_type)
);

-- ── 3. Teachers ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_teachers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_code        TEXT NOT NULL UNIQUE,          -- auto: TCH-0001
  full_name           TEXT NOT NULL,
  phone               TEXT,
  email               TEXT,
  teacher_type        TEXT NOT NULL DEFAULT 'junior'
                        CHECK (teacher_type IN ('senior','junior','guest')),
  specialization      TEXT,
  bio                 TEXT,
  zoom_display_name   TEXT,                          -- for attendance matching
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4. Courses ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_courses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_code   TEXT NOT NULL UNIQUE,               -- auto: CRS-001
  course_name   TEXT NOT NULL,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 5. Course Plans ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_course_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     UUID NOT NULL REFERENCES academy_courses(id) ON DELETE CASCADE,
  plan_name     TEXT NOT NULL,
  version       INT NOT NULL DEFAULT 1,
  total_classes INT NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT false,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 6. Plan Subjects ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_plan_subjects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       UUID NOT NULL REFERENCES academy_course_plans(id) ON DELETE CASCADE,
  serial_no     INT NOT NULL,                        -- auto-assigned
  subject_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 7. Plan Lectures ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_plan_lectures (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id    UUID NOT NULL REFERENCES academy_plan_subjects(id) ON DELETE CASCADE,
  serial_no     INT NOT NULL,                        -- global serial within plan
  lecture_no    INT NOT NULL,                        -- per-subject lecture number
  title         TEXT NOT NULL,
  duration_min  INT NOT NULL DEFAULT 60,
  is_practical  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 8. Batches ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_name      TEXT NOT NULL,
  course_id       UUID NOT NULL REFERENCES academy_courses(id),
  plan_id         UUID REFERENCES academy_course_plans(id),
  zoom_account_id UUID REFERENCES academy_zoom_accounts(id),
  start_date      DATE,
  end_date        DATE,
  max_students    INT,
  status          TEXT NOT NULL DEFAULT 'upcoming'
                    CHECK (status IN ('upcoming','active','completed','cancelled')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 9. Batch Outline ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_batch_outline (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          UUID NOT NULL REFERENCES academy_batches(id) ON DELETE CASCADE,
  row_no            INT NOT NULL,                    -- display order
  row_type          TEXT NOT NULL DEFAULT 'class'
                      CHECK (row_type IN ('class','exam')),
  class_no          INT,                             -- NULL for exams
  scheduled_date    DATE,
  scheduled_time    TIME,
  topic             TEXT,
  teacher_id        UUID REFERENCES academy_teachers(id),
  class_type        TEXT NOT NULL DEFAULT 'regular'
                      CHECK (class_type IN ('regular','makeup','exam_review')),
  zoom_link         TEXT,
  status            TEXT NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled','done','cancelled','rescheduled')),
  notes             TEXT,
  feedback_id       UUID,                            -- FK added after feedback table
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 10. Outline History (reschedule log) ─────────────────────────
CREATE TABLE IF NOT EXISTS academy_outline_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outline_id      UUID NOT NULL REFERENCES academy_batch_outline(id) ON DELETE CASCADE,
  changed_by      UUID,                              -- users.id
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_values      JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_values      JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason          TEXT
);

-- ── 11. Class Feedback ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_class_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outline_id      UUID NOT NULL REFERENCES academy_batch_outline(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES academy_teachers(id),
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  note            TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  reviewed_by     UUID,                              -- users.id
  reviewed_at     TIMESTAMPTZ,
  approved        BOOLEAN
);

-- Add FK back to outline
ALTER TABLE academy_batch_outline
  ADD CONSTRAINT fk_outline_feedback
  FOREIGN KEY (feedback_id) REFERENCES academy_class_feedback(id);

ALTER TABLE academy_batch_outline ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE academy_batch_outline ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE academy_batch_outline ADD COLUMN IF NOT EXISTS exam_no INT;
ALTER TABLE academy_batch_outline ADD COLUMN IF NOT EXISTS zoom_account_id UUID REFERENCES academy_zoom_accounts(id);
ALTER TABLE academy_batch_outline ADD COLUMN IF NOT EXISTS class_mode TEXT DEFAULT 'online';
ALTER TABLE academy_batch_outline ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE academy_batch_outline ADD COLUMN IF NOT EXISTS subject_name TEXT;

-- ── 12. Teacher Payments ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_teacher_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id      UUID NOT NULL REFERENCES academy_teachers(id),
  outline_id      UUID REFERENCES academy_batch_outline(id),
  batch_id        UUID REFERENCES academy_batches(id),
  class_date      DATE,
  class_type      TEXT,
  amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','paid')),
  paid_at         TIMESTAMPTZ,
  paid_by         UUID,                              -- users.id
  payment_note    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_course_plans_course   ON academy_course_plans(course_id);
CREATE INDEX IF NOT EXISTS idx_plan_subjects_plan    ON academy_plan_subjects(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_lectures_subject ON academy_plan_lectures(subject_id);
CREATE INDEX IF NOT EXISTS idx_batches_course        ON academy_batches(course_id);
CREATE INDEX IF NOT EXISTS idx_outline_batch         ON academy_batch_outline(batch_id);
CREATE INDEX IF NOT EXISTS idx_feedback_outline      ON academy_class_feedback(outline_id);
CREATE INDEX IF NOT EXISTS idx_payments_teacher      ON academy_teacher_payments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_payments_status       ON academy_teacher_payments(status);

-- ── Seed: default payment rates ───────────────────────────────────
INSERT INTO academy_payment_rates (teacher_type, class_type, rate_per_class) VALUES
  ('senior', 'regular',      1500),
  ('senior', 'makeup',       1200),
  ('senior', 'exam_review',  1000),
  ('junior', 'regular',       800),
  ('junior', 'makeup',        600),
  ('junior', 'exam_review',   500),
  ('guest',  'regular',      2000),
  ('guest',  'makeup',       1500),
  ('guest',  'exam_review',  1200)
ON CONFLICT (teacher_type, class_type) DO NOTHING;
