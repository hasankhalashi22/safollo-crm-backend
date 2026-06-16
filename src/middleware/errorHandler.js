const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // PostgreSQL unique violation
  if (err.code === '23505') {
    const field = err.detail?.match(/\((.+?)\)/)?.[1] || 'field';
    return res.status(409).json({
      success: false,
      message: `এই ${field} ইতিমধ্যে ব্যবহার হয়েছে`,
    });
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      message: 'সম্পর্কিত তথ্য পাওয়া যায়নি',
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'অবৈধ টোকেন',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'সেশন শেষ হয়ে গেছে, আবার লগইন করুন',
    });
  }

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'ফাইলের সাইজ ৫MB-এর বেশি হওয়া যাবে না',
    });
  }

  // Default error
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'সার্ভারে সমস্যা হয়েছে, পরে চেষ্টা করুন',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

// 404 handler
const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    message: 'এই পথটি পাওয়া যায়নি',
  });
};

module.exports = { errorHandler, notFound };
