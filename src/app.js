require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { errorHandler, notFound } = require('./middleware/errorHandler');

// Route imports
const authRoutes        = require('./modules/auth/auth.routes');
const usersRoutes       = require('./modules/users/users.routes');
const profilesRoutes    = require('./modules/profiles/profiles.routes');
const coursesRoutes     = require('./modules/courses/courses.routes');
const salesRoutes       = require('./modules/sales/sales.routes');
const paymentsRoutes    = require('./modules/payments/payments.routes');
const reportsRoutes     = require('./modules/reports/reports.routes');
const fieldConfigRoutes = require('./modules/field-configs/field-configs.routes');

const app = express();

// ── Security ──────────────────────────────────────────────
app.use(helmet());
app.set('trust proxy', 1);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}));
app.options('*', cors());

// ── Rate limiting ─────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { success: false, message: 'অনেক বেশি request, কিছুক্ষণ পরে চেষ্টা করুন' },
});

const otpLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'অনেকবার OTP চেয়েছেন, কিছুক্ষণ পরে চেষ্টা করুন' },
});

app.use('/api', generalLimiter);
app.use('/api/auth/send-otp', otpLimiter);

// ── Body Parser ───────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Health check ──────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'সাফল্য CRM API চলছে ✅',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// ── API Routes ────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/users',        usersRoutes);
app.use('/api/profiles',     profilesRoutes);
app.use('/api/courses',      coursesRoutes);
app.use('/api/sales',        salesRoutes);
app.use('/api/payments',     paymentsRoutes);
app.use('/api/reports',      reportsRoutes);
app.use('/api/field-configs', fieldConfigRoutes);
app.use('/api/audit', require('./modules/audit/audit.routes'));
app.use('/api/approvals', require('./modules/approvals/approvals.routes'));
app.use('/api/notifications', require('./modules/notifications/notifications.routes'));
app.use('/api/accounting', require('./modules/accounting/accounting.routes'));
app.use('/api/book', require('./modules/sales/book.routes'));

// ── Error handling ────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
