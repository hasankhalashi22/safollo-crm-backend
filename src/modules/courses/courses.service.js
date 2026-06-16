const { query } = require('../../config/database');

const getCourses = async (includeInactive = false) => {
  const where = includeInactive ? '' : 'WHERE c.is_active = TRUE';
  const result = await query(
    `SELECT c.*,
            json_agg(
              json_build_object(
                'id', b.id,
                'name', b.name,
                'price', COALESCE(b.price, c.default_price),
                'start_date', b.start_date,
                'is_active', b.is_active
              ) ORDER BY b.id
            ) FILTER (WHERE b.id IS NOT NULL) as batches
     FROM courses c
     LEFT JOIN batches b ON b.course_id = c.id ${includeInactive ? '' : 'AND b.is_active = TRUE'}
     ${where}
     GROUP BY c.id
     ORDER BY c.id`
  );
  return result.rows;
};

const getCourseById = async (id) => {
  const result = await query(
    `SELECT c.*,
            json_agg(
              json_build_object('id', b.id, 'name', b.name,
                'price', COALESCE(b.price, c.default_price),
                'start_date', b.start_date, 'is_active', b.is_active)
            ) FILTER (WHERE b.id IS NOT NULL) as batches
     FROM courses c
     LEFT JOIN batches b ON b.course_id = c.id
     WHERE c.id = $1 GROUP BY c.id`,
    [id]
  );
  if (result.rows.length === 0) throw { statusCode: 404, message: 'কোর্স পাওয়া যায়নি' };
  return result.rows[0];
};

const createCourse = async (data, userId) => {
  const { name, short_name, default_price, description, is_book } = data;
  const result = await query(
    `INSERT INTO courses (name, short_name, default_price, description, created_by, is_book)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name, short_name || null, default_price, description || null, userId, is_book || false]
  );
  return result.rows[0];
};

const updateCourse = async (id, data) => {
  const fields = Object.keys(data);
  if (fields.length === 0) throw { statusCode: 400, message: 'কোনো তথ্য দেওয়া হয়নি' };
  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const result = await query(
    `UPDATE courses SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, ...fields.map(f => data[f])]
  );
  if (result.rows.length === 0) throw { statusCode: 404, message: 'কোর্স পাওয়া যায়নি' };
  return result.rows[0];
};

const createBatch = async (data, userId) => {
  const { course_id, name, price, start_date } = data;
  const result = await query(
    `INSERT INTO batches (course_id, name, price, start_date, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [course_id, name, price || null, start_date || null, userId]
  );
  return result.rows[0];
};

const updateBatch = async (id, data) => {
  const fields = Object.keys(data);
  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const result = await query(
    `UPDATE batches SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, ...fields.map(f => data[f])]
  );
  if (result.rows.length === 0) throw { statusCode: 404, message: 'ব্যাচ পাওয়া যায়নি' };
  return result.rows[0];
};

const deleteCourse = async (id) => {
  const enrollmentCheck = await query(
    'SELECT COUNT(*) FROM enrollments WHERE course_id = $1',
    [id]
  );
  if (parseInt(enrollmentCheck.rows[0].count) > 0) {
    throw { statusCode: 400, message: 'এই কোর্সে enrollment আছে, delete করা যাবে না। নিষ্ক্রিয় করুন।' };
  }
  await query('DELETE FROM batches WHERE course_id = $1', [id]);
  const result = await query('DELETE FROM courses WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) throw { statusCode: 404, message: 'কোর্স পাওয়া যায়নি' };
  return { deleted: true };
};

const deleteBatch = async (id) => {
  const enrollmentCheck = await query(
    'SELECT COUNT(*) FROM enrollments WHERE batch_id = $1',
    [id]
  );
  if (parseInt(enrollmentCheck.rows[0].count) > 0) {
    throw { statusCode: 400, message: 'এই ব্যাচে enrollment আছে, delete করা যাবে না।' };
  }
  const result = await query('DELETE FROM batches WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) throw { statusCode: 404, message: 'ব্যাচ পাওয়া যায়নি' };
  return { deleted: true };
};

module.exports = { getCourses, getCourseById, createCourse, updateCourse, createBatch, updateBatch, deleteCourse, deleteBatch };