-- ============================================
-- ACCOUNTING MODULE — Isolated Schema
-- ============================================

-- Chart of Accounts
CREATE TABLE IF NOT EXISTS acc_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE,
  name VARCHAR(100) NOT NULL,
  account_type VARCHAR(20) NOT NULL,
  account_subtype VARCHAR(50),
  parent_id UUID REFERENCES acc_accounts(id),
  is_active BOOLEAN DEFAULT TRUE,

  bank_name VARCHAR(100),
  credit_limit DECIMAL(12,2),
  interest_rate DECIMAL(5,2),

  investor_name VARCHAR(100),
  principal_amount DECIMAL(12,2),
  profit_rate DECIMAL(5,2),
  contract_start_date DATE,
  contract_end_date DATE,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Transactions (single entry point)
CREATE TABLE IF NOT EXISTS acc_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date DATE NOT NULL,
  transaction_type VARCHAR(30) NOT NULL,
  description TEXT,
  amount DECIMAL(12,2) NOT NULL,

  debit_account_id UUID REFERENCES acc_accounts(id),
  credit_account_id UUID REFERENCES acc_accounts(id),

  proof_url TEXT,
  proof_type VARCHAR(20),
  reference_no VARCHAR(100),

  source VARCHAR(20) DEFAULT 'manual',
  reconciliation_status VARCHAR(20) DEFAULT 'matched',

  enrollment_id UUID,
  employee_id UUID,
  teacher_id UUID,

  created_by UUID REFERENCES users(id),
  approval_status VARCHAR(20) DEFAULT 'approved',
  approved_by UUID REFERENCES users(id),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Journal Entries (auto double entry)
CREATE TABLE IF NOT EXISTS acc_journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES acc_transactions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES acc_accounts(id),
  entry_type VARCHAR(10) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  entry_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Adjusting Entries
CREATE TABLE IF NOT EXISTS acc_adjusting_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL,
  description TEXT NOT NULL,
  debit_account_id UUID REFERENCES acc_accounts(id),
  credit_account_id UUID REFERENCES acc_accounts(id),
  amount DECIMAL(12,2) NOT NULL,
  period VARCHAR(20),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Credit Card Transactions
CREATE TABLE IF NOT EXISTS acc_credit_card_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_account_id UUID NOT NULL REFERENCES acc_accounts(id),
  transaction_id UUID REFERENCES acc_transactions(id),
  type VARCHAR(20) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  transaction_date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Investor Transactions
CREATE TABLE IF NOT EXISTS acc_investor_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_account_id UUID NOT NULL REFERENCES acc_accounts(id),
  transaction_id UUID REFERENCES acc_transactions(id),
  type VARCHAR(20) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  transaction_date DATE NOT NULL,
  period VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Petty Cash
CREATE TABLE IF NOT EXISTS acc_petty_cash_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES acc_transactions(id),
  manager_id UUID REFERENCES users(id),
  type VARCHAR(20) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  description TEXT,
  proof_url TEXT,
  entry_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Reconciliation Log
CREATE TABLE IF NOT EXISTS acc_reconciliation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(20) NOT NULL,
  api_amount DECIMAL(12,2),
  system_amount DECIMAL(12,2),
  difference DECIMAL(12,2),
  date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Module Access Permissions (shared across future modules)
CREATE TABLE IF NOT EXISTS module_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module VARCHAR(30) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}',
  set_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, module)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_acc_journal_account ON acc_journal_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_acc_journal_date ON acc_journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_acc_transactions_date ON acc_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_acc_transactions_type ON acc_transactions(transaction_type);