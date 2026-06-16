const { z } = require('zod');

// Phone number validation (Bangladesh)
const phoneSchema = z
  .string()
  .regex(/^01[3-9]\d{8}$/, 'সঠিক মোবাইল নম্বর দিন (যেমন: 01711000000)');

// Auth
const sendOtpSchema = z.object({
  phone: phoneSchema,
});

const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code:  z.string().length(6, 'OTP ৬ সংখ্যার হতে হবে'),
});

// User creation (admin করবে)
const createUserSchema = z.object({
  phone:        z.string().min(11).max(15),
  role_id:      z.coerce.number().int().positive(),
  manager_id:   z.string().uuid().optional().nullable(),
  joining_date: z.string().optional(),
});

// Profile update
const updateProfileSchema = z.object({
  full_name:          z.string().min(2).max(150).optional(),
  father_name:        z.string().max(150).optional().or(z.literal('')),
  mother_name:        z.string().max(150).optional().or(z.literal('')),
  date_of_birth:      z.string().optional().or(z.literal('')),
  blood_group:        z.string().optional().or(z.literal('')),
  gender:             z.string().optional().or(z.literal('')),
  mobile_number:      z.string().optional().or(z.literal('')),
  guardian_mobile:    z.string().optional().or(z.literal('')),
  guardian_relation:  z.string().max(50).optional().or(z.literal('')),
  email:              z.string().optional().or(z.literal('')),
  present_address:    z.string().optional().or(z.literal('')),
  permanent_address:  z.string().optional().or(z.literal('')),
  education_level:    z.string().optional().or(z.literal('')),
  education_details:  z.string().optional().or(z.literal('')),
  nid_number:         z.string().max(30).optional().or(z.literal('')),
  joining_date:       z.string().optional().or(z.literal('')),
});

// Course
const createCourseSchema = z.object({
  name:          z.string().min(2).max(200),
  short_name:    z.string().max(50).optional(),
  default_price: z.number().positive(),
  description:   z.string().optional(),
});

// Batch
const createBatchSchema = z.object({
  course_id:  z.number().int().positive(),
  name:       z.string().min(1).max(100),
  price:      z.number().positive().optional(),
  start_date: z.string().optional(),
});

// Sale (new enrollment + first payment)
const createSaleSchema = z.object({
  student_phone:    phoneSchema,
  student_name:     z.string().max(150).optional(),
  course_id:        z.number().int().positive(),
  batch_id:         z.number().int().positive().optional(),
  course_price:     z.number().positive(),
  collected_amount: z.number().min(0),
  payment_method:   z.enum(['bkash','nagad','rocket','cod','cash']),
  transaction_id:   z.string().max(100).optional(),
  due_date:         z.string().optional().nullable(),
  reference:        z.string().max(200).optional(),
  notes:            z.string().optional(),
});

// Due payment (existing enrollment-এ payment)
const addPaymentSchema = z.object({
  enrollment_id:   z.string().uuid(),
  amount:          z.number().positive(),
  payment_method:  z.enum(['bkash','nagad','rocket','cod','cash']),
  transaction_id:  z.string().max(100).optional(),
  due_date:        z.string().optional().nullable(),
  notes:           z.string().optional(),
});

// Validate helper
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: 'ইনপুট সঠিক নয়',
      errors:  result.error.errors.map(e => ({
        field:   e.path.join('.'),
        message: e.message,
      })),
    });
  }
  req.validatedBody = result.data;
  next();
};

module.exports = {
  validate,
  sendOtpSchema,
  verifyOtpSchema,
  createUserSchema,
  updateProfileSchema,
  createCourseSchema,
  createBatchSchema,
  createSaleSchema,
  addPaymentSchema,
};
