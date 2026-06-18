require('dotenv').config();
const fs = require('fs');
const path = require('path');
const app = require('./src/app');
const { pool } = require('./src/config/database');

const PORT = process.env.PORT || 3000;

const start = async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected');

    console.log('🔄 Running migrations...');
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', '001_initial_schema.sql'),
      'utf8'
    );
    await pool.query(sql);
    console.log('✅ Migration successful');

    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_first_login BOOLEAN DEFAULT TRUE');
    await pool.query('ALTER TABLE roles ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT \'[]\'');
    await pool.query('ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE');
    await pool.query("UPDATE roles SET is_system = TRUE WHERE name IN ('super_admin', 'advisor')");
    await pool.query("UPDATE roles SET permissions = '[\"create_sale\",\"view_sales\",\"view_due\",\"view_reports\",\"view_performance\"]' WHERE name = 'executive' AND (permissions = '[]' OR permissions IS NULL)");
    await pool.query("UPDATE roles SET permissions = '[\"create_sale\",\"view_sales\",\"edit_sale\",\"view_due\",\"reassign_due\",\"view_staff\",\"view_reports\",\"view_performance\",\"manage_staff\"]' WHERE name = 'manager' AND (permissions = '[]' OR permissions IS NULL)");

    await pool.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT \'pending\'');
    await pool.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL');
    await pool.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP');
    await pool.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS approver_name VARCHAR(255)');
    await pool.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS rejection_reason TEXT');
    await pool.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP');
    await pool.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id) ON DELETE SET NULL');
    console.log('✅ Approval columns ready');

    await pool.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT \'pending\'');
    await pool.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL');
    await pool.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP');
    await pool.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS approver_name VARCHAR(255)');
    await pool.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id) ON DELETE SET NULL');
    await pool.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP');
    await pool.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS rejection_reason TEXT');
    await pool.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS sender_number VARCHAR(20)');
    console.log('✅ Payment approval columns ready');

    await pool.query(`
      UPDATE payments SET approval_status = 'approved'
      WHERE approval_status = 'pending'
      AND enrollment_id IN (
        SELECT id FROM enrollments WHERE approval_status = 'approved'
      )
    `);
    console.log('✅ Existing payments approval status fixed');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        user_name VARCHAR(255),
        user_role VARCHAR(100),
        action VARCHAR(50) NOT NULL,
        module VARCHAR(50) NOT NULL,
        target_id VARCHAR(255),
        target_name VARCHAR(255),
        old_data JSONB,
        new_data JSONB,
        description TEXT,
        ip_address VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module)');
    console.log('✅ Audit logs table ready');

// Push subscriptions table
await pool.query(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    subscription JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )
`);
console.log('✅ Push subscriptions table ready');

    await pool.query('ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS joining_date DATE');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS joining_date DATE');
    console.log('✅ joining_date columns ready');

// Accounting module migration
    const accountingSql = fs.readFileSync(
      path.join(__dirname, 'migrations', '002_accounting_schema.sql'),
      'utf8'
    );
    await pool.query(accountingSql);
    console.log('✅ Accounting module schema ready');

await pool.query('ALTER TABLE acc_transactions ADD COLUMN IF NOT EXISTS payment_id UUID');




    await pool.query('CREATE INDEX IF NOT EXISTS idx_acc_transactions_payment ON acc_transactions(payment_id)');
    console.log('✅ Accounting payment_id column ready');

await pool.query(`
      CREATE TABLE IF NOT EXISTS acc_daily_settlements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        settlement_date DATE NOT NULL,
        source VARCHAR(20) NOT NULL,
        gross_amount DECIMAL(12,2) NOT NULL,
        charge_amount DECIMAL(12,2) NOT NULL,
        net_amount DECIMAL(12,2) NOT NULL,
        transfer_transaction_id UUID REFERENCES acc_transactions(id),
        charge_transaction_id UUID REFERENCES acc_transactions(id),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(settlement_date, source)
      )
    `);
    console.log('✅ Daily settlements table ready');

await pool.query('ALTER TABLE acc_transactions ADD COLUMN IF NOT EXISTS related_account_id UUID REFERENCES acc_accounts(id)');
    await pool.query(`
      SELECT id FROM acc_accounts WHERE name = 'Investor Profit Expense'
    `).then(async (r) => {
      if (r.rows.length === 0) {
        await pool.query(`
          INSERT INTO acc_accounts (code, name, account_type, account_subtype)
          VALUES ('5009', 'Investor Profit Expense', 'expense', 'investor_profit')
        `);
      }
    });
await pool.query('ALTER TABLE acc_accounts ADD COLUMN IF NOT EXISTS is_accruing BOOLEAN DEFAULT TRUE');
    console.log('✅ Investor accrual toggle ready');
    console.log('✅ Investor profit tracking ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS acc_card_statements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID NOT NULL REFERENCES acc_accounts(id),
        statement_date DATE,
        statement_file_url TEXT,
        total_statement_interest NUMERIC(12,2),
        total_statement_outstanding NUMERIC(12,2),
        academy_used_amount NUMERIC(12,2),
        academy_interest_share NUMERIC(12,2),
        transaction_id UUID REFERENCES acc_transactions(id),
        raw_ai_response JSONB,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Card statement tracking ready');

await pool.query('ALTER TABLE acc_accounts ADD COLUMN IF NOT EXISTS shareholder_name VARCHAR(100)');
    await pool.query('ALTER TABLE acc_accounts ADD COLUMN IF NOT EXISTS share_percentage NUMERIC(5,2)');
    console.log('✅ Shareholder tracking ready');

await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_employee_details (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
        designation VARCHAR(100),
        department VARCHAR(100),
        reports_to UUID REFERENCES users(id),
        employment_type VARCHAR(30) DEFAULT 'full_time',
        office_start_time TIME DEFAULT '09:00',
        office_end_time TIME DEFAULT '17:00',
        is_remote BOOLEAN DEFAULT FALSE,
        basic_salary NUMERIC(12,2),
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_positions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(150) NOT NULL,
        parent_position_id UUID REFERENCES hr_positions(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE hr_employee_details ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES hr_positions(id)`);
await pool.query(`ALTER TABLE hr_employee_details ADD COLUMN IF NOT EXISTS weekly_off_day VARCHAR(20)`);
    await pool.query(`ALTER TABLE hr_employee_details ALTER COLUMN office_start_time SET DEFAULT '11:00'`);
    await pool.query(`ALTER TABLE hr_employee_details ALTER COLUMN office_end_time SET DEFAULT '21:00'`);
await pool.query(`ALTER TABLE hr_positions ADD COLUMN IF NOT EXISTS department VARCHAR(100)`);
    console.log('✅ HR positions table ready');

await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_employees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        full_name VARCHAR(150) NOT NULL,
        phone VARCHAR(20),
        email VARCHAR(150),
        photo_url TEXT,
        position_id UUID REFERENCES hr_positions(id),
        designation VARCHAR(150),
        department VARCHAR(100),
        reports_to UUID REFERENCES hr_employees(id),
        employment_type VARCHAR(30) DEFAULT 'full_time',
        office_start_time TIME DEFAULT '11:00',
        office_end_time TIME DEFAULT '21:00',
        is_remote BOOLEAN DEFAULT FALSE,
        weekly_off_day VARCHAR(20),
        basic_salary NUMERIC(12,2),
        status VARCHAR(20) DEFAULT 'active',
        joining_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const migrationCheck = await pool.query('SELECT COUNT(*) FROM hr_employees');
    if (parseInt(migrationCheck.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO hr_employees
          (user_id, full_name, phone, email, position_id, designation, department,
           employment_type, office_start_time, office_end_time, is_remote,
           weekly_off_day, basic_salary, status, joining_date)
        SELECT u.id, COALESCE(sp.full_name, u.phone), u.phone, sp.email,
               hed.position_id, hed.designation, hed.department,
               hed.employment_type, hed.office_start_time, hed.office_end_time, hed.is_remote,
               hed.weekly_off_day, hed.basic_salary, hed.status, sp.joining_date
        FROM users u
        LEFT JOIN staff_profiles sp ON sp.user_id = u.id
        LEFT JOIN hr_employee_details hed ON hed.user_id = u.id
        WHERE u.is_active = TRUE
      `);

      await pool.query(`
        UPDATE hr_employees he
        SET reports_to = mgr.id
        FROM hr_employee_details hed
        JOIN hr_employees mgr ON mgr.user_id = hed.reports_to
        WHERE he.user_id = hed.user_id AND hed.reports_to IS NOT NULL
      `);

      console.log('✅ Migrated existing employees into hr_employees table');
    }

await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS father_name VARCHAR(100)`);
    await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS mother_name VARCHAR(100)`);
    await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS date_of_birth DATE`);
    await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS blood_group VARCHAR(10)`);
    await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS gender VARCHAR(20)`);
    await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS guardian_mobile VARCHAR(20)`);
    await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS guardian_relation VARCHAR(50)`);
    await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS present_address TEXT`);
    await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS permanent_address TEXT`);
    await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS education_level VARCHAR(100)`);
    await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS education_details TEXT`);
    await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS nid_number VARCHAR(30)`);
    await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS nid_image_url TEXT`);
    await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS nid_image_public_id VARCHAR(150)`);
    await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS photo_url TEXT`);
    await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS photo_public_id VARCHAR(150)`);
    await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS signature_url TEXT`);
    await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS signature_public_id VARCHAR(150)`);
    await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE`);

    // One-time: copy full profile data from staff_profiles for CRM-linked employees
    const profileMigrationCheck = await pool.query(
      `SELECT COUNT(*) FROM hr_employees WHERE user_id IS NOT NULL AND nid_number IS NULL`
    );
    if (parseInt(profileMigrationCheck.rows[0].count) > 0) {
      await pool.query(`
        UPDATE hr_employees he
        SET father_name = sp.father_name,
            mother_name = sp.mother_name,
            date_of_birth = sp.date_of_birth,
            blood_group = sp.blood_group,
            gender = sp.gender,
            guardian_mobile = sp.guardian_mobile,
            guardian_relation = sp.guardian_relation,
            present_address = sp.present_address,
            permanent_address = sp.permanent_address,
            education_level = sp.education_level,
            education_details = sp.education_details,
            nid_number = sp.nid_number,
            nid_image_url = sp.nid_image_url,
            nid_image_public_id = sp.nid_image_public_id,
            photo_url = sp.photo_url,
            photo_public_id = sp.photo_public_id,
            signature_url = sp.signature_url,
            signature_public_id = sp.signature_public_id
        FROM staff_profiles sp
        WHERE sp.user_id = he.user_id
      `);
      console.log('✅ Migrated full profile data from staff_profiles into hr_employees');
    }

    console.log('✅ HR employee full profile fields ready');

// One-time fix: existing users (created before the default-password feature) who already
    // have a working password should not be forced through the new password-change screen.
    await pool.query(`
      UPDATE users
      SET is_first_login = FALSE
      WHERE password IS NOT NULL
        AND created_at < '2026-06-18'
    `);
    console.log('✅ Cleared is_first_login flag for pre-existing users with passwords');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_employee_module_access (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
        module_key VARCHAR(50) NOT NULL,
        role_key VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(employee_id, module_key)
      )
    `);

    const accessMigrationCheck = await pool.query(`SELECT COUNT(*) FROM hr_employee_module_access WHERE module_key = 'crm'`);
    if (parseInt(accessMigrationCheck.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO hr_employee_module_access (employee_id, module_key, role_key)
        SELECT he.id, 'crm', r.name
        FROM hr_employees he
        JOIN users u ON u.id = he.user_id
        JOIN roles r ON r.id = u.role_id
        WHERE r.name IS DISTINCT FROM 'super_admin'
        ON CONFLICT (employee_id, module_key) DO NOTHING
      `);
      console.log('✅ Mirrored existing CRM roles into hr_employee_module_access');
    }

    console.log('✅ HR employee module access table ready');

    console.log('✅ HR employees master table ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS hr_notices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        attachment_url TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ HR module schema ready');

await pool.query(`
      CREATE TABLE IF NOT EXISTS acc_settings (
        key VARCHAR(50) PRIMARY KEY,
        value VARCHAR(50) NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      INSERT INTO acc_settings (key, value) VALUES
        ('bkash_charge_rate', '1.15'),
        ('rocket_charge_rate', '1.00')
      ON CONFLICT (key) DO NOTHING
    `);
    console.log('✅ Accounting settings ready');

await pool.query('ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_book BOOLEAN DEFAULT FALSE');
    console.log('✅ is_book column ready');

    // Add Book Sales revenue account
    const bookSalesCheck = await pool.query("SELECT id FROM acc_accounts WHERE name = 'Book Sales'");
    if (bookSalesCheck.rows.length === 0) {
      await pool.query(`
        INSERT INTO acc_accounts (code, name, account_type, account_subtype) VALUES
        ('4004', 'Book Sales', 'revenue', 'sales')
      `);
      console.log('✅ Book Sales account added');
    }

    // Seed default accounts (only if not exists)
    const accCheck = await pool.query("SELECT COUNT(*) FROM acc_accounts");
    if (parseInt(accCheck.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO acc_accounts (code, name, account_type, account_subtype) VALUES
        ('1001', 'Cash', 'asset', 'cash'),
        ('1002', 'Petty Cash', 'asset', 'cash'),
        ('1003', 'bKash Wallet', 'asset', 'mobile_wallet'),
        ('1004', 'Nagad Wallet', 'asset', 'mobile_wallet'),
        ('1005', 'Rocket Wallet', 'asset', 'mobile_wallet'),
        ('1006', 'BRAC Bank', 'asset', 'bank'),
        ('1007', 'Dutch Bangla Bank', 'asset', 'bank'),
        ('1008', 'SSL Wallet', 'asset', 'gateway'),
        ('1009', 'Steadfast Wallet', 'asset', 'wallet'),
        ('1010', 'Accounts Receivable', 'asset', 'receivable'),
        ('2001', 'Accounts Payable', 'liability', 'payable'),
        ('3001', 'Owner Equity', 'equity', 'capital'),
        ('3002', 'Retained Earnings', 'equity', 'retained'),
        ('4001', 'Course Sales', 'revenue', 'sales'),
        ('4002', 'Book Sales', 'revenue', 'sales'),
        ('4003', 'Other Income', 'revenue', 'other'),
        ('5001', 'Salary Expense', 'expense', 'salary'),
        ('5002', 'Rent Expense', 'expense', 'rent'),
        ('5003', 'Marketing Expense', 'expense', 'marketing'),
        ('5004', 'Teacher Payment', 'expense', 'teacher'),
        ('5005', 'Bank Charges', 'expense', 'charges'),
        ('5006', 'Interest Expense', 'expense', 'interest'),
        ('5007', 'Office Expense', 'expense', 'office'),
        ('5008', 'Others Expense', 'expense', 'other')
      `);
      console.log('✅ Default accounting accounts seeded');
    }

    try {
      const adminCheck = await pool.query("SELECT id FROM users WHERE phone = '01518916372'");
      if (adminCheck.rows.length === 0) {
        const roleResult = await pool.query("SELECT id FROM roles WHERE name = 'super_admin'");
        if (roleResult.rows.length > 0) {
          await pool.query(
            "INSERT INTO users (phone, role_id, is_active, is_first_login) VALUES ('01518916372', $1, TRUE, FALSE)",
            [roleResult.rows[0].id]
          );
          console.log('✅ Super admin created');
        }
      } else {
        console.log('✅ Super admin already exists');
      }
    } catch (e) {
      console.error('Super admin error:', e.message);
    }
app.get('/debug-check-columns', async (req, res) => {
  try {
    const result = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='acc_accounts' AND column_name IN ('shareholder_name','share_percentage')`);
    res.json({ columns: result.rows });
  } catch (err) {
    res.json({ error: err.message });
  }
});
    app.listen(PORT, () => {
      console.log(`🚀 সাফল্য CRM API running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
    });
  } catch (err) {
    console.error('❌ Failed to start:', err.message);
    process.exit(1);
  }
};

start();