const { query, withTransaction } = require('../../config/database');

const getChargeRate = async (key) => {
  const result = await query('SELECT value FROM acc_settings WHERE key = $1', [key]);
  if (result.rows.length === 0) return 0;
  return parseFloat(result.rows[0].value) / 100;
};

const getSettings = async () => {
  const result = await query('SELECT * FROM acc_settings');
  const settings = {};
  result.rows.forEach(r => { settings[r.key] = parseFloat(r.value); });
  return settings;
};

const updateSetting = async (key, value) => {
  const result = await query(
    `UPDATE acc_settings SET value = $1, updated_at = NOW() WHERE key = $2 RETURNING *`,
    [value, key]
  );
  if (result.rows.length === 0) throw { statusCode: 404, message: 'Setting পাওয়া যায়নি' };
  return result.rows[0];
};

// BD time = UTC+6. "Accounting day" runs from 1:00 AM BD to next 1:00 AM BD.
const getAccountingDayWindow = (referenceDate = new Date()) => {
  const bdOffset = 6 * 60; // minutes
  const bdNow = new Date(referenceDate.getTime() + bdOffset * 60000);

  let dayStartBD = new Date(bdNow);
  if (bdNow.getUTCHours() < 1) {
    dayStartBD.setUTCDate(dayStartBD.getUTCDate() - 1);
  }
  dayStartBD.setUTCHours(1, 0, 0, 0);

  const dayEndBD = new Date(dayStartBD);
  dayEndBD.setUTCDate(dayEndBD.getUTCDate() + 1);

  const startUTC = new Date(dayStartBD.getTime() - bdOffset * 60000);
  const endUTC = new Date(dayEndBD.getTime() - bdOffset * 60000);

  return { startUTC, endUTC, settlementDate: dayStartBD.toISOString().split('T')[0] };
};

const getAccountIdByName = async (name) => {
  const result = await query('SELECT id FROM acc_accounts WHERE name = $1', [name]);
  return result.rows[0]?.id || null;
};

const getTodayCollectionTotal = async (accountName) => {
  const { startUTC, endUTC } = getAccountingDayWindow();
  const accountId = await getAccountIdByName(accountName);
  if (!accountId) return 0;

  const result = await query(
    `SELECT COALESCE(SUM(amount), 0) as total
     FROM acc_transactions
     WHERE debit_account_id = $1
       AND transaction_type = 'revenue'
       AND source = 'crm_sync'
       AND created_at >= $2 AND created_at < $3`,
    [accountId, startUTC.toISOString(), endUTC.toISOString()]
  );
  return parseFloat(result.rows[0].total);
};

const getTodayBkashTotal = () => getTodayCollectionTotal('bKash Wallet');
const getTodayRocketTotal = () => getTodayCollectionTotal('Rocket Wallet');

// Generic settlement runner
const runSettlement = async ({ source, walletAccountName, destAccountName, chargeRate }) => {
  const now = new Date();
  const { startUTC, endUTC, settlementDate } = getAccountingDayWindow(new Date(now.getTime() - 60000));

  const walletAccountId = await getAccountIdByName(walletAccountName);
  const destAccountId = await getAccountIdByName(destAccountName);
  const chargeAccountId = await getAccountIdByName('Bank Charges');

  if (!walletAccountId || !destAccountId || !chargeAccountId) {
    throw new Error(`Required accounts not found (${walletAccountName} / ${destAccountName} / Bank Charges)`);
  }

  const existing = await query(
    'SELECT id FROM acc_daily_settlements WHERE settlement_date = $1 AND source = $2',
    [settlementDate, source]
  );
  if (existing.rows.length > 0) {
    return { skipped: true, reason: 'Already settled', settlementDate };
  }

  const result = await query(
    `SELECT COALESCE(SUM(amount), 0) as total
     FROM acc_transactions
     WHERE debit_account_id = $1
       AND transaction_type = 'revenue'
       AND source = 'crm_sync'
       AND created_at >= $2 AND created_at < $3`,
    [walletAccountId, startUTC.toISOString(), endUTC.toISOString()]
  );
  const gross = parseFloat(result.rows[0].total);

  if (gross <= 0) {
    return { skipped: true, reason: 'No collection', settlementDate, gross };
  }

  const charge = Math.round(gross * chargeRate * 100) / 100;
  const net = gross - charge;

  return await withTransaction(async (client) => {
    const transferTxn = await client.query(
      `INSERT INTO acc_transactions
         (transaction_date, transaction_type, description, amount,
          debit_account_id, credit_account_id, source)
       VALUES ($1, 'fund_transfer', $2, $3, $4, $5, 'auto_settlement')
       RETURNING *`,
      [settlementDate, `${walletAccountName} সেটেলমেন্ট — ${settlementDate}`, net, destAccountId, walletAccountId]
    );
    await client.query(
      `INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date) VALUES ($1,$2,'debit',$3,$4)`,
      [transferTxn.rows[0].id, destAccountId, net, settlementDate]
    );
    await client.query(
      `INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date) VALUES ($1,$2,'credit',$3,$4)`,
      [transferTxn.rows[0].id, walletAccountId, net, settlementDate]
    );

    const chargeTxn = await client.query(
      `INSERT INTO acc_transactions
         (transaction_date, transaction_type, description, amount,
          debit_account_id, credit_account_id, source)
       VALUES ($1, 'expense', $2, $3, $4, $5, 'auto_settlement')
       RETURNING *`,
      [settlementDate, `${walletAccountName} চার্জ (${(chargeRate * 100).toFixed(2)}%) — ${settlementDate}`, charge, chargeAccountId, walletAccountId]
    );
    await client.query(
      `INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date) VALUES ($1,$2,'debit',$3,$4)`,
      [chargeTxn.rows[0].id, chargeAccountId, charge, settlementDate]
    );
    await client.query(
      `INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date) VALUES ($1,$2,'credit',$3,$4)`,
      [chargeTxn.rows[0].id, walletAccountId, charge, settlementDate]
    );

    await client.query(
      `INSERT INTO acc_daily_settlements
         (settlement_date, source, gross_amount, charge_amount, net_amount, transfer_transaction_id, charge_transaction_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [settlementDate, source, gross, charge, net, transferTxn.rows[0].id, chargeTxn.rows[0].id]
    );

    return { settled: true, settlementDate, gross, charge, net };
  });
};

const runBkashSettlement = async () => {
  const chargeRate = await getChargeRate('bkash_charge_rate');
  return runSettlement({
    source: 'bkash',
    walletAccountName: 'bKash Wallet',
    destAccountName: 'BRAC Bank',
    chargeRate,
  });
};

const runRocketSettlement = async () => {
  const chargeRate = await getChargeRate('rocket_charge_rate');
  return runSettlement({
    source: 'rocket',
    walletAccountName: 'Rocket Wallet',
    destAccountName: 'Dutch Bangla Bank',
    chargeRate,
  });
};
module.exports = { getTodayBkashTotal, getTodayRocketTotal, runBkashSettlement, runRocketSettlement, getAccountingDayWindow, getSettings, updateSetting };