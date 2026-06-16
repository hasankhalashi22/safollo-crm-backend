const { query } = require('../../config/database');

const getDailySummary = async ({ executiveId, roleLevel, date }) => {
  const targetDate = date || new Date().toISOString().split('T')[0];

  const conditions = [`DATE(p.created_at) = $1`, `e.approval_status = 'approved'`, `p.approval_status = 'approved'`];
  const params = [targetDate];
  let idx = 2;

  if (roleLevel >= 4) {
    conditions.push(`p.executive_id = $${idx++}`);
    params.push(executiveId);
  } else if (roleLevel === 3) {
    conditions.push(`p.executive_id IN (SELECT id FROM users WHERE manager_id = $${idx++} OR id = $${idx++})`);
    params.push(executiveId, executiveId);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const result = await query(
  `SELECT
       COUNT(p.id) as total_transactions,
       COUNT(DISTINCT CASE WHEN NOT p.is_due_payment THEN p.enrollment_id END) as new_enrollments,
       COUNT(DISTINCT CASE WHEN p.is_due_payment THEN p.enrollment_id END) as due_cleared,
       COALESCE(SUM(p.amount), 0) as total_collected
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     ${where}`,
    params
  );

  const courseBreakdown = await query(
    `SELECT c.name as course_name, c.short_name,
            COUNT(DISTINCT p.enrollment_id) as enrollments,
            COALESCE(SUM(p.amount), 0) as collected
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     JOIN courses c ON c.id = e.course_id
     ${where}
     GROUP BY c.id, c.name, c.short_name
     ORDER BY collected DESC`,
    params
  );

  const todayDue = await query(
    `SELECT e.id, s.phone as student_phone, s.name as student_name,
            c.name as course_name,
            (e.course_price - e.total_collected) as due_amount,
            (SELECT p.due_date FROM payments p WHERE p.enrollment_id = e.id
             ORDER BY p.created_at DESC LIMIT 1) as due_date
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     JOIN courses c ON c.id = e.course_id
     WHERE e.payment_status IN ('due', 'partial')
     AND e.approval_status = 'approved'
     AND (SELECT p.due_date FROM payments p WHERE p.enrollment_id = e.id
          ORDER BY p.created_at DESC LIMIT 1) <= CURRENT_DATE + INTERVAL '3 days'
     ${roleLevel >= 4 ? `AND e.executive_id = '${executiveId}'` : ''}
     ORDER BY due_date ASC NULLS LAST
     LIMIT 10`,
    []
  );

  return {
    date: targetDate,
    summary: result.rows[0],
    course_breakdown: courseBreakdown.rows,
    upcoming_dues: todayDue.rows,
  };
};

const getMonthlySummary = async ({ executiveId, roleLevel, month, year }) => {
  const targetMonth = month || new Date().getMonth() + 1;
  const targetYear = year || new Date().getFullYear();

 const conditions = [
    `EXTRACT(MONTH FROM p.created_at) = $1`,
    `EXTRACT(YEAR FROM p.created_at) = $2`,
    `e.approval_status = 'approved'`,
    `p.approval_status = 'approved'`
  ];
  const params = [targetMonth, targetYear];
  let idx = 3;

  if (roleLevel >= 4) {
    conditions.push(`p.executive_id = $${idx++}`);
    params.push(executiveId);
  } else if (roleLevel === 3) {
    conditions.push(`p.executive_id IN (SELECT id FROM users WHERE manager_id = $${idx++} OR id = $${idx++})`);
    params.push(executiveId, executiveId);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const dailyBreakdown = await query(
    `SELECT DATE(p.created_at) as date,
            COUNT(DISTINCT p.enrollment_id) as transactions,
            COALESCE(SUM(p.amount), 0) as collected
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     ${where}
     GROUP BY DATE(p.created_at)
     ORDER BY date ASC`,
    params
  );

  let leaderboard = [];
  if (roleLevel <= 3) {
    const lbResult = await query(
      `SELECT sp.full_name, u.phone,
              COUNT(DISTINCT p.enrollment_id) as sales_count,
              COALESCE(SUM(p.amount), 0) as total_collected
       FROM payments p
       JOIN enrollments e ON e.id = p.enrollment_id
       JOIN users u ON u.id = p.executive_id
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       WHERE EXTRACT(MONTH FROM p.created_at) = $1
         AND EXTRACT(YEAR FROM p.created_at) = $2
         AND e.approval_status = 'approved'
         ${roleLevel === 3 ? `AND u.manager_id = '${executiveId}'` : ''}
       GROUP BY u.id, sp.full_name, u.phone
       ORDER BY total_collected DESC`,
      [targetMonth, targetYear]
    );
    leaderboard = lbResult.rows;
  }

  const totalResult = await query(
    `SELECT COALESCE(SUM(p.amount), 0) as total_collected,
            COUNT(DISTINCT p.enrollment_id) as total_transactions,
            COUNT(DISTINCT CASE WHEN NOT p.is_due_payment THEN p.enrollment_id END) as new_enrollments,
            COALESCE(SUM(CASE WHEN e.payment_status IN ('due','partial')
              THEN e.course_price - e.total_collected END), 0) as total_outstanding_due
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     ${where}`,
    params
  );

  return {
    month: targetMonth,
    year: targetYear,
    summary: totalResult.rows[0],
    daily_breakdown: dailyBreakdown.rows,
    leaderboard,
  };
};

const getAdminOverview = async () => {
  const today = new Date().toISOString().split('T')[0];

  const [todayStats, totalStats, dueStats, courseStats] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(p.amount), 0) as today_collected,
              COUNT(DISTINCT p.enrollment_id) as today_transactions
       FROM payments p
       JOIN enrollments e ON e.id = p.enrollment_id
       WHERE DATE(p.created_at) = $1 AND e.approval_status = 'approved'`,
      [today]
    ),
    query(
      `SELECT COUNT(*) as total_students,
              COUNT(DISTINCT CASE WHEN payment_status = 'paid' THEN id END) as paid_students,
              COUNT(DISTINCT CASE WHEN payment_status IN ('due','partial') THEN id END) as due_students,
              COALESCE(SUM(total_collected), 0) as total_revenue
       FROM enrollments WHERE approval_status = 'approved'`
    ),
    query(
      `SELECT COALESCE(SUM(course_price - total_collected), 0) as total_due
       FROM enrollments WHERE payment_status IN ('due', 'partial') AND approval_status = 'approved'`
    ),
    query(
      `SELECT c.name as course_name, c.short_name,
              COUNT(*) as total_enrollments,
              COUNT(CASE WHEN e.payment_status = 'paid' THEN 1 END) as paid,
              COUNT(CASE WHEN e.payment_status IN ('due','partial') THEN 1 END) as due
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.approval_status = 'approved'
       GROUP BY c.id, c.name, c.short_name
       ORDER BY total_enrollments DESC`
    ),
  ]);

  return {
    today: todayStats.rows[0],
    totals: { ...totalStats.rows[0], ...dueStats.rows[0] },
    course_stats: courseStats.rows,
  };
};

const getMyPerformance = async ({ executiveId, roleLevel, month, year, self_only, filter_executive_id }) => {
  const targetMonth = parseInt(month) || new Date().getMonth() + 1;
  const targetYear = parseInt(year) || new Date().getFullYear();

  let execCondition = '';

  if (filter_executive_id) {
    execCondition = `AND e.executive_id = '${filter_executive_id}'`;
  } else if (self_only === 'true' || roleLevel >= 4) {
    execCondition = `AND e.executive_id = '${executiveId}'`;
  } else if (roleLevel === 3) {
    execCondition = `AND e.executive_id IN (SELECT id FROM users WHERE manager_id = '${executiveId}' OR id = '${executiveId}')`;
  }

  const thisMonthResult = await query(
    `SELECT
       COUNT(DISTINCT e.id) as total_enrollments,
       COALESCE(SUM(p.amount), 0) as total_collected,
       COUNT(DISTINCT CASE WHEN e.payment_status = 'paid' THEN e.id END) as paid_count,
       COUNT(DISTINCT CASE WHEN e.payment_status IN ('due','partial') THEN e.id END) as due_count
     FROM enrollments e
     JOIN payments p ON p.enrollment_id = e.id
     WHERE EXTRACT(MONTH FROM p.created_at) = $1
       AND EXTRACT(YEAR FROM p.created_at) = $2
       AND e.approval_status = 'approved'
       ${execCondition}`,
    [targetMonth, targetYear]
  );

  const allTimeResult = await query(
    `SELECT
       COUNT(DISTINCT e.id) as total_enrollments,
       COALESCE(SUM(p.amount), 0) as total_collected,
       COUNT(DISTINCT CASE WHEN e.payment_status = 'paid' THEN e.id END) as paid_count,
       COUNT(DISTINCT CASE WHEN e.payment_status IN ('due','partial') THEN e.id END) as due_count,
       COALESCE(SUM(e.course_price - e.total_collected), 0) as total_due
     FROM enrollments e
     LEFT JOIN payments p ON p.enrollment_id = e.id
     WHERE e.approval_status = 'approved' ${execCondition}`,
    []
  );

  const courseMonthResult = await query(
    `SELECT
       c.name as course_name,
       COUNT(DISTINCT e.id) as enrollments,
       COALESCE(SUM(p.amount), 0) as collected
     FROM enrollments e
     JOIN payments p ON p.enrollment_id = e.id
     JOIN courses c ON c.id = e.course_id
     WHERE EXTRACT(MONTH FROM p.created_at) = $1
       AND EXTRACT(YEAR FROM p.created_at) = $2
       AND e.approval_status = 'approved'
       ${execCondition}
     GROUP BY c.id, c.name
     ORDER BY collected DESC`,
    [targetMonth, targetYear]
  );

  const courseAllResult = await query(
    `SELECT
       c.name as course_name,
       COUNT(DISTINCT e.id) as enrollments,
       COALESCE(SUM(p.amount), 0) as collected
     FROM enrollments e
     LEFT JOIN payments p ON p.enrollment_id = e.id
     JOIN courses c ON c.id = e.course_id
     WHERE e.approval_status = 'approved' ${execCondition}
     GROUP BY c.id, c.name
     ORDER BY collected DESC`,
    []
  );

  const trendResult = await query(
    `SELECT
       EXTRACT(MONTH FROM p.created_at) as month,
       EXTRACT(YEAR FROM p.created_at) as year,
       COUNT(DISTINCT e.id) as enrollments,
       COALESCE(SUM(p.amount), 0) as collected
     FROM enrollments e
     JOIN payments p ON p.enrollment_id = e.id
     WHERE p.created_at >= NOW() - INTERVAL '6 months'
       AND e.approval_status = 'approved'
       ${execCondition}
     GROUP BY EXTRACT(MONTH FROM p.created_at), EXTRACT(YEAR FROM p.created_at)
     ORDER BY year ASC, month ASC`,
    []
  );

  return {
    this_month: thisMonthResult.rows[0],
    all_time: allTimeResult.rows[0],
    course_this_month: courseMonthResult.rows,
    course_all_time: courseAllResult.rows,
    monthly_trend: trendResult.rows,
  };
};

module.exports = { getDailySummary, getMonthlySummary, getAdminOverview, getMyPerformance };