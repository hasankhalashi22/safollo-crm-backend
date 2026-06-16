CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  level INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO roles (name, label, level) VALUES
  ('super_admin', 'সুপার অ্যাডমিন / CEO', 1),
  ('advisor', 'অ্যাডভাইজর', 2),
  ('manager', 'ম্যানেজার', 3),
  ('executive', 'সেলস এক্সিকিউটিভ', 4)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(20) NOT NULL UNIQUE,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  manager_id UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT TRUE,
  is_profile_complete BOOLEAN DEFAULT FALSE,
  joining_date DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(150),
  father_name VARCHAR(150),
  mother_name VARCHAR(150),
  date_of_birth DATE,
  blood_group VARCHAR(5),
  gender VARCHAR(10),
  mobile_number VARCHAR(20),
  guardian_mobile VARCHAR(20),
  guardian_relation VARCHAR(50),
  email VARCHAR(100),
  present_address TEXT,
  permanent_address TEXT,
  education_level VARCHAR(100),
  education_details TEXT,
  nid_number VARCHAR(30),
  nid_image_url VARCHAR(500),
  nid_image_public_id VARCHAR(200),
  photo_url VARCHAR(500),
  photo_public_id VARCHAR(200),
  signature_url VARCHAR(500),
  signature_public_id VARCHAR(200),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(500) NOT NULL UNIQUE,
  device_info TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  short_name VARCHAR(50),
  default_price DECIMAL(10,2) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);



CREATE TABLE IF NOT EXISTS batches (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10,2),
  start_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS field_configs (
  id SERIAL PRIMARY KEY,
  field_key VARCHAR(100) NOT NULL UNIQUE,
  field_label VARCHAR(150) NOT NULL,
  field_type VARCHAR(50) NOT NULL,
  is_mandatory BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO field_configs (field_key, field_label, field_type, is_mandatory, sort_order) VALUES
  ('student_name', 'স্টুডেন্টের নাম', 'text', TRUE, 1),
  ('transaction_id', 'ট্রানজেকশন আইডি', 'text', FALSE, 2),
  ('payment_proof', 'পেমেন্ট প্রুফ', 'image', FALSE, 3),
  ('reference', 'রেফারেন্স', 'text', FALSE, 4),
  ('due_date', 'বাকি দেওয়ার তারিখ', 'date', FALSE, 5),
  ('notes', 'নোট / মন্তব্য', 'text', FALSE, 6)
ON CONFLICT (field_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id),
  course_id INTEGER NOT NULL REFERENCES courses(id),
  batch_id INTEGER REFERENCES batches(id),
  course_price DECIMAL(10,2) NOT NULL,
  total_collected DECIMAL(10,2) DEFAULT 0,
  payment_status VARCHAR(20) DEFAULT 'due',
  enrollment_status VARCHAR(20) DEFAULT 'active',
  executive_id UUID NOT NULL REFERENCES users(id),
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, course_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id),
  student_id UUID NOT NULL REFERENCES students(id),
  amount DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(20) NOT NULL,
  transaction_id VARCHAR(100),
  payment_proof_url VARCHAR(500),
  payment_proof_pid VARCHAR(200),
  due_date DATE,
  is_due_payment BOOLEAN DEFAULT FALSE,
  executive_id UUID NOT NULL REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_enrollment_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE enrollments
  SET
    total_collected = (
      SELECT COALESCE(SUM(amount), 0)
      FROM payments
      WHERE enrollment_id = NEW.enrollment_id
    ),
    payment_status = CASE
      WHEN (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE enrollment_id = NEW.enrollment_id) >= course_price
        THEN 'paid'
      WHEN (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE enrollment_id = NEW.enrollment_id) > 0
        THEN 'partial'
      ELSE 'due'
    END,
    updated_at = NOW()
  WHERE id = NEW.enrollment_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_enrollment ON payments;
CREATE TRIGGER trigger_update_enrollment
AFTER INSERT OR UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION update_enrollment_totals();

CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  executive_id UUID NOT NULL REFERENCES users(id),
  report_date DATE NOT NULL,
  total_sales INTEGER DEFAULT 0,
  total_collected DECIMAL(10,2) DEFAULT 0,
  total_due DECIMAL(10,2) DEFAULT 0,
  new_enrollments INTEGER DEFAULT 0,
  due_cleared INTEGER DEFAULT 0,
  generated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(executive_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_enrollment ON payments(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_payments_executive ON payments(executive_id);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone, is_used);
-- Password system
ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_first_login BOOLEAN DEFAULT TRUE;