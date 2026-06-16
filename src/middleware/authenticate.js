const { verifyToken } = require('../utils/jwt');
const { query } = require('../config/database');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'লগইন করুন',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    // Check session in DB
    const sessionResult = await query(
      'SELECT s.*, u.role_id, u.is_active, u.manager_id, u.phone FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1 AND s.expires_at > NOW()',
      [token]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'সেশন শেষ হয়ে গেছে, আবার লগইন করুন',
      });
    }

    const session = sessionResult.rows[0];

    if (!session.is_active) {
      return res.status(403).json({
        success: false,
        message: 'আপনার অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে',
      });
    }

    // Get role info
    const roleResult = await query(
      'SELECT * FROM roles WHERE id = $1',
      [session.role_id]
    );

   // Get user's full name from staff_profiles
    const profileResult = await query(
      'SELECT full_name FROM staff_profiles WHERE user_id = $1',
      [session.user_id]
    );

    req.user = {
      id:          session.user_id,
      role_id:     session.role_id,
      role:        roleResult.rows[0]?.name,
      role_level:  roleResult.rows[0]?.level,
      permissions: roleResult.rows[0]?.permissions || [],
      manager_id:  session.manager_id,
      full_name:   profileResult.rows[0]?.full_name || null,
      phone:       session.phone,
    };

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'অবৈধ টোকেন',
    });
  }
};

// Role-based authorization
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'অননুমোদিত' });
    }

    // Advisor gets same access as super_admin except editing sales/courses
    const effectiveRole = req.user.role;
    const checkRoles = allowedRoles.includes('super_admin') && !allowedRoles.includes('advisor')
      ? [...allowedRoles]
      : allowedRoles;

    if (!checkRoles.includes(effectiveRole)) {
      return res.status(403).json({
        success: false,
        message: 'এই কাজের অনুমতি আপনার নেই',
      });
    }

    next();
  };
};

// Read-only check — advisor cannot edit
const authorizeEdit = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'অননুমোদিত' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'এই কাজের অনুমতি আপনার নেই',
      });
    }

    next();
  };
};

// Level-based: minimum level check
// level 1 = CEO (highest), level 4 = executive (lowest)
const authorizeLevel = (maxLevel) => {
  return (req, res, next) => {
    if (!req.user || req.user.role_level > maxLevel) {
      return res.status(403).json({
        success: false,
        message: 'এই কাজের অনুমতি আপনার নেই',
      });
    }
    next();
  };
};
// Permission-based check
const hasPermission = (permission) => {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'অননুমোদিত' });

    // Super admin ও advisor সব পারে
    if (req.user.role === 'super_admin' || req.user.role === 'advisor') return next();

    // req.user.permissions থেকে check করো
    const permissions = req.user.permissions || [];
    if (!permissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        message: 'এই কাজের অনুমতি আপনার নেই',
      });
    }
    next();
  };
};

module.exports = { authenticate, authorize, authorizeEdit, authorizeLevel, hasPermission };
