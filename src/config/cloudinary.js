const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage for profile photos
const profileStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'safollo-crm/profiles',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill' }],
  },
});

// Storage for NID images
const nidStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'safollo-crm/nid',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
  },
});

// Storage for payment proofs
const paymentStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'safollo-crm/payment-proofs',
    allowed_formats: ['jpg', 'jpeg', 'png'],
  },
});

// Storage for signatures
const signatureStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'safollo-crm/signatures',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    transformation: [{ background: 'white' }],
  },
});

// Storage for HR notice attachments
const noticeStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'safollo-crm/notices',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
    resource_type: 'auto',
  },
});

const uploadProfile   = multer({ storage: profileStorage });
const uploadNid       = multer({ storage: nidStorage });
const uploadPayment   = multer({ storage: paymentStorage });
const uploadSignature = multer({ storage: signatureStorage });
const uploadNotice    = multer({ storage: noticeStorage });

// Delete from cloudinary
const deleteFile = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('Cloudinary delete error:', err);
  }
};

module.exports = {
  cloudinary,
  uploadProfile,
  uploadNid,
  uploadPayment,
  uploadSignature,
  uploadNotice,
  deleteFile,
};
