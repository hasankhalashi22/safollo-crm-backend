require('dotenv').config();
const { pool } = require('../src/config/database');
const fs = require('fs');
const path = require('path');

const run = async () => {
  try {
    console.log('🔄 Running migrations...');
    const sql = fs.readFileSync(
      path.join(__dirname, '001_initial_schema.sql'),
      'utf8'
    );
    await pool.query(sql);
    console.log('✅ Migration successful');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
};

run();
