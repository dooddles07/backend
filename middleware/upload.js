// ============================================
// FILE UPLOAD MIDDLEWARE
// ============================================
// Handles image uploads using Multer

const multer = require('multer');
const path = require('path');

// Configure multer for memory storage (for Cloudinary upload)
const storage = multer.memoryStorage();

// File filter - Accept only image files
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error('Only image files (JPEG, JPG, PNG, GIF) are allowed!'));
};

// Configure upload with size limit and file filter
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max file size
  fileFilter
});

module.exports = upload;