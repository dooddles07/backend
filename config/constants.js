const AUTHENTICATION = {
  JWT_SECRET: process.env.JWT_SECRET,
  TOKEN_EXPIRY: '7d',
  BCRYPT_SALT_ROUNDS: 12, // 🔒 Increased from 10 to 12 for better security
  RESET_CODE_EXPIRY_MS: 15 * 60 * 1000,
  RESET_CODE_LENGTH: 6,
  MIN_PASSWORD_LENGTH: 8, // 🔒 Increased from 6 to 8 for stronger passwords
  MAX_LOGIN_ATTEMPTS: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
  LOCKOUT_DURATION_MS: parseInt(process.env.LOCKOUT_DURATION) * 60 * 1000 || 15 * 60 * 1000
};

const RATE_LIMITING = {
  WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 500,
  // 🔒 SECURITY: Strict rate limiting for auth endpoints to prevent brute force
  AUTH_MAX_REQUESTS: parseInt(process.env.AUTH_MAX_REQUESTS) || 20, // Reduced from 100 to 20
  // Set AUTH_MAX_REQUESTS=100 in .env for development if needed
  AUTH_WINDOW_MS: parseInt(process.env.AUTH_WINDOW_MS) || 15 * 60 * 1000 // 15 minutes
};

const SOS = {
  MAX_LOCATION_HISTORY: 50,
  DEFAULT_HISTORY_LIMIT: 50,
  STATUS: {
    ACTIVE: 'active',
    RESOLVED: 'resolved',
    CANCELLED: 'cancelled'
  }
};

const TIME = {
  MILLISECONDS_IN_24_HOURS: 24 * 60 * 60 * 1000
};

const MESSAGE = {
  DEFAULT_LIMIT: 50,
  PREVIEW_LENGTH: 100,
  TYPES: ['text', 'image', 'video', 'audio'],
  SENDER_TYPES: ['user', 'admin']
};

const CONVERSATION = {
  STATUS: {
    ACTIVE: 'active',
    ARCHIVED: 'archived'
  }
};

const ADMIN_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  RESPONDER: 'responder'
};

const UPLOAD = {
  MAX_FILE_SIZE: 5 * 1024 * 1024,
  ALLOWED_IMAGE_TYPES: /jpeg|jpg|png|gif/,
  JSON_LIMIT: '10mb'
};

const EMAIL = {
  USER: process.env.EMAIL_USER,
  PASSWORD: process.env.EMAIL_PASSWORD,
  SERVICE: 'gmail'
};

const CLOUDINARY = {
  FOLDER: 'resqyou_messages',
  VIDEO_THUMBNAIL: {
    width: 300,
    height: 300,
    crop: 'thumb',
    gravity: 'center',
    format: 'jpg'
  }
};

module.exports = {
  AUTHENTICATION,
  RATE_LIMITING,
  SOS,
  TIME,
  MESSAGE,
  CONVERSATION,
  ADMIN_ROLES,
  UPLOAD,
  EMAIL,
  CLOUDINARY
};
